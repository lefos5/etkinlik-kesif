// Mesajlar — v2 M4. Yalniz status='accepted' baglantida, yalniz taraflar.
// GET  /api/connections/:id/messages            -> { messages:[{id, body, created_at, mine}] }
// POST /api/connections/:id/messages {body}      -> { message }
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

  // Baglanti: taraf miyim + kabul edilmis mi?
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
    const { data: msg, error } = await db.from('messages')
      .insert({ connection_id: connId, sender_id: user.id, body: text })
      .select('id, body, created_at').single();
    if (error) throw error;
    json(res, 200, { message: { ...msg, mine: true } });
    return;
  }

  json(res, 405, { error: 'Desteklenmeyen method' });
});
