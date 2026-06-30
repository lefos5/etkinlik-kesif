// /api/connections/:id (PATCH) + /:id/messages (GET/POST) + /:id/report (POST) — tek fonksiyonda
// (Hobby plan 12-fonksiyon limiti). Liste/olusturma /api/connections.js'de (bare route).
import { admin } from '../../lib/supabase.js';
import { getUser } from '../../lib/auth.js';
import { json, withErrors } from '../../lib/http.js';

const ACTIONS = new Set(['accept', 'decline', 'block']);
const MAX_LEN = 1000;

function pathSegs(req) {
  const p = req.query?.path;
  if (Array.isArray(p)) return p;
  if (typeof p === 'string' && p) return [p];
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const i = parts.indexOf('connections');
  return i >= 0 ? parts.slice(i + 1) : [];
}

export default withErrors(async (req, res) => {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }
  const seg = pathSegs(req);
  const id = seg[0];
  if (!id) { json(res, 404, { error: 'Baglanti bulunamadi' }); return; }
  if (seg[1] === 'messages') { await messages(req, res, user, id); return; }
  if (seg[1] === 'report') { await report(req, res, user, id); return; }
  await patchConnection(req, res, user, id);
});

// PATCH /api/connections/:id {action} — accept/decline (addressee, pending) | block (her iki taraf)
async function patchConnection(req, res, user, id) {
  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body || '{}');
  const action = body?.action;
  if (!ACTIONS.has(action)) { json(res, 400, { error: 'gecerli action gerekli (accept|decline|block)' }); return; }

  const db = admin();
  const { data: c } = await db.from('connections').select('*').eq('id', id).maybeSingle();
  if (!c) { json(res, 404, { error: 'Baglanti bulunamadi' }); return; }
  const isAddressee = c.addressee_id === user.id;
  const isRequester = c.requester_id === user.id;
  if (!isAddressee && !isRequester) { json(res, 403, { error: 'Yetkisiz' }); return; }

  if (action === 'block') {
    await db.from('connections').update({ status: 'blocked' }).eq('id', id);
    json(res, 200, { ok: true, status: 'blocked' }); return;
  }
  if (!isAddressee) { json(res, 403, { error: 'Yalnız isteği alan kabul/ret edebilir' }); return; }
  if (c.status !== 'pending') { json(res, 400, { error: 'İstek beklemede değil' }); return; }
  const status = action === 'accept' ? 'accepted' : 'declined';
  await db.from('connections').update({ status }).eq('id', id);
  json(res, 200, { ok: true, status });
}

// /api/connections/:id/messages — yalniz accepted baglantida, yalniz taraflar
async function messages(req, res, user, connId) {
  const db = admin();
  const { data: c } = await db.from('connections')
    .select('id, requester_id, addressee_id, status').eq('id', connId).maybeSingle();
  if (!c) { json(res, 404, { error: 'Baglanti bulunamadi' }); return; }
  if (c.requester_id !== user.id && c.addressee_id !== user.id) { json(res, 403, { error: 'Yetkisiz' }); return; }
  if (c.status !== 'accepted') { json(res, 403, { error: 'Mesajlaşma yalnız kabul edilmiş bağlantıda' }); return; }

  if (req.method === 'GET') {
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

    const since = new Date(Date.now() - 60000).toISOString();   // oran siniri: 30 msj/dk
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
}

// POST /api/connections/:id/report {reason?} — reported_id sunucuda baglantidan turetilir
async function report(req, res, user, connId) {
  if (req.method !== 'POST') { json(res, 405, { error: 'POST gerekli' }); return; }
  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body || '{}');
  const reason = (body?.reason || '').trim().slice(0, 500) || null;

  const db = admin();
  const { data: c } = await db.from('connections')
    .select('id, requester_id, addressee_id').eq('id', connId).maybeSingle();
  if (!c) { json(res, 404, { error: 'Baglanti bulunamadi' }); return; }
  if (c.requester_id !== user.id && c.addressee_id !== user.id) { json(res, 403, { error: 'Yetkisiz' }); return; }
  const reportedId = c.requester_id === user.id ? c.addressee_id : c.requester_id;

  const { error } = await db.from('reports')
    .insert({ reporter_id: user.id, reported_id: reportedId, connection_id: connId, reason });
  if (error) throw error;
  json(res, 200, { ok: true });
}
