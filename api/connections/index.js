// Bağlantılar (eşlik istekleri) — v2 M3.  /api/connections (bare): liste + olusturma.
// Alt-uclar (PATCH/messages/report) connections/[...path].js'de. (events ile ayni desen.)
// POST {addressee_id, event_id} -> istek gonder (karsi istek varsa kabul). GET -> {incoming,outgoing,accepted}
import { admin } from '../../lib/supabase.js';
import { getUser } from '../../lib/auth.js';
import { json, withErrors } from '../../lib/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const is18 = (by) => Boolean(by) && new Date().getFullYear() - by >= 18;

export default withErrors(async (req, res) => {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }
  const db = admin();

  if (req.method === 'GET') {
    const { data: conns, error } = await db.from('connections')
      .select('id, requester_id, addressee_id, event_id, status, updated_at')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    const rows = (conns ?? []).filter((c) => c.status !== 'blocked' && c.status !== 'declined');

    const otherIds = [...new Set(rows.map((c) => (c.requester_id === user.id ? c.addressee_id : c.requester_id)))];
    const eventIds = [...new Set(rows.map((c) => c.event_id).filter(Boolean))];
    const [{ data: profs }, { data: events }] = await Promise.all([
      otherIds.length ? db.from('profiles').select('id, nickname, avatar_url').in('id', otherIds) : Promise.resolve({ data: [] }),
      eventIds.length ? db.from('events').select('id, title, start_at').in('id', eventIds) : Promise.resolve({ data: [] }),
    ]);
    const pMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
    const eMap = Object.fromEntries((events ?? []).map((e) => [e.id, e]));
    const shape = (c) => {
      const otherId = c.requester_id === user.id ? c.addressee_id : c.requester_id;
      return {
        id: c.id, status: c.status,
        direction: c.requester_id === user.id ? 'outgoing' : 'incoming',
        other: pMap[otherId] || { id: otherId, nickname: null },
        event: c.event_id ? (eMap[c.event_id] || null) : null,
      };
    };
    const all = rows.map(shape);
    const accepted = all.filter((c) => c.status === 'accepted');

    // Bildirim icin: kabul edilmis baglantilarda son mesaj (yeni-mesaj sinyali)
    if (accepted.length) {
      const { data: msgs } = await db.from('messages')
        .select('connection_id, sender_id, created_at')
        .in('connection_id', accepted.map((c) => c.id))
        .order('created_at', { ascending: false }).limit(300);
      const last = {};
      for (const m of msgs ?? []) if (!last[m.connection_id]) last[m.connection_id] = m;
      for (const c of accepted) {
        const m = last[c.id];
        c.last_message_at = m ? m.created_at : null;
        c.last_message_mine = m ? (m.sender_id === user.id) : null;
      }
    }

    json(res, 200, {
      incoming: all.filter((c) => c.status === 'pending' && c.direction === 'incoming'),
      outgoing: all.filter((c) => c.status === 'pending' && c.direction === 'outgoing'),
      accepted,
    });
    return;
  }

  if (req.method !== 'POST') { json(res, 405, { error: 'Desteklenmeyen method' }); return; }

  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body || '{}');
  const addressee_id = body?.addressee_id;
  const event_id = body?.event_id;
  if (!UUID.test(addressee_id || '') || !UUID.test(event_id || '')) {
    json(res, 400, { error: 'addressee_id ve event_id (uuid) gerekli' }); return;
  }
  if (addressee_id === user.id) { json(res, 400, { error: 'Kendine istek gönderemezsin' }); return; }

  const { data: meProf } = await db.from('profiles').select('birth_year').eq('id', user.id).maybeSingle();
  if (!is18(meProf?.birth_year)) { json(res, 403, { error: 'Bu özellik 18+ gerektirir.' }); return; }
  const { data: myAtt } = await db.from('event_attendance').select('want_company').eq('user_id', user.id).eq('event_id', event_id).maybeSingle();
  if (!myAtt?.want_company) { json(res, 403, { error: 'Önce bu etkinlikte "Eşlik arıyorum"u aç.' }); return; }

  const { data: themProf } = await db.from('profiles').select('birth_year').eq('id', addressee_id).maybeSingle();
  const { data: theirAtt } = await db.from('event_attendance').select('want_company').eq('user_id', addressee_id).eq('event_id', event_id).maybeSingle();
  if (!is18(themProf?.birth_year) || !theirAtt?.want_company) {
    json(res, 400, { error: 'Bu kişi bu etkinlikte eşlik aramıyor.' }); return;
  }

  const { data: mine } = await db.from('connections').select('*')
    .eq('event_id', event_id)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  const ex = (mine ?? []).find((c) => c.requester_id === addressee_id || c.addressee_id === addressee_id);
  if (ex) {
    if (ex.status === 'blocked') { json(res, 403, { error: 'Bu kullanıcıyla bağlantı kurulamaz.' }); return; }
    if (ex.status === 'accepted') { json(res, 200, { status: 'accepted', connection_id: ex.id }); return; }
    if (ex.status === 'pending') {
      if (ex.addressee_id === user.id) {
        await db.from('connections').update({ status: 'accepted' }).eq('id', ex.id);
        json(res, 200, { status: 'accepted', connection_id: ex.id }); return;
      }
      json(res, 200, { status: 'pending', connection_id: ex.id }); return;
    }
    await db.from('connections').update({ requester_id: user.id, addressee_id, status: 'pending' }).eq('id', ex.id);
    json(res, 200, { status: 'pending', connection_id: ex.id }); return;
  }

  const since = new Date(Date.now() - 3600000).toISOString();   // oran siniri: 20 istek/saat
  const { count } = await db.from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', user.id).gte('created_at', since);
  if ((count ?? 0) >= 20) { json(res, 429, { error: 'Çok fazla istek gönderdin, biraz sonra tekrar dene.' }); return; }

  const { data: created, error } = await db.from('connections')
    .insert({ requester_id: user.id, addressee_id, event_id, status: 'pending' })
    .select('id').single();
  if (error) throw error;
  json(res, 200, { status: 'pending', connection_id: created.id });
});
