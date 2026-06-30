// Mesajlar — v2 M4. Yalniz status='accepted' baglantida, yalniz taraflar.
// GET  /api/connections/:id/messages            -> { messages:[{id, body, created_at, mine}] }
// POST /api/connections/:id/messages {body}      -> { message }  (oran siniri: 30/dk)
import { admin } from '../../../lib/supabase.js';
import { getUser } from '../../../lib/auth.js';
import { json, withErrors } from '../../../lib/http.js';

const MAX_LEN = 1000;

export default withErrors(async (req, res) => {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }
  const connId = req.query?.id
    || new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean).at(-2);
  const db = admin();

  const { data: c } = await db.from('connections')
    .select('id, requester_id, addressee_id, status').eq('id', connId).maybeSingle();
  if (!c) { json(res, 404, { error: 'Baglanti bulunamadi' }); return; }
  if (c.requester_id !== user.id && c.addressee_id !== user.id) { json(res, 403, { error: 'Yetkisiz' }); return; }
  if (c.status !== 'accepted') { json(res, 403, { error: 'Mesajlaşma yalnız kabul edilmiş bağlantıda' }); return; }

  if (req.method === 'GET') {
    // Okudum: bu taraf icin read_at = now (bildirimde okunmamis tespiti). Kolon yoksa sessiz gec.
    const col = c.requester_id === user.id ? 'requester_read_at' : 'addressee_read_at';
    await db.from('connections').update({ [col]: new Date().toISOString() }).eq('id', connId).then(() => {}, () => {});

    const { data: msgs, error } = await db.from('messages')
      .select('id, sender_id, body, created_at')
      .eq('connection_id', connId).order('created_at', { ascending: true }).limit(200);
    if (error) throw error;
    json(res, 200, { messages: (msgs ?? []).map((m) => ({ id: m.id, body: m.body, created_at: m.created_at, mine: m.sender_id === user.id })) });
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const text = (body?.body || '').trim();
    if (!text) { json(res, 400, { error: 'Mesaj boş olamaz' }); return; }
    if (text.length > MAX_LEN) { json(res, 400, { error: `En fazla ${MAX_LEN} karakter` }); return; }

    const since = new Date(Date.now() - 60000).toISOString();   // oran siniri: 30 msj/dk (spam korumasi)
    const { count } = await db.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', user.id).gte('created_at', since);
    if ((count ?? 0) >= 30) { json(res, 429, { error: 'Çok hızlı mesaj gönderiyorsun, biraz bekle.' }); return; }

    const { data: msg, error } = await db.from('messages')
      .insert({ connection_id: connId, sender_id: user.id, body: text })
      .select('id, body, created_at').single();
    if (error) throw error;
    json(res, 200, { message: { ...msg, mine: true } });
    return;
  }

  json(res, 405, { error: 'Desteklenmeyen method' });
});
