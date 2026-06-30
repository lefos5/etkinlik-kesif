// POST /api/reports {connection_id, reason?} — kotuye kullanim bildirimi (v2 M5 iskelet).
// reported_id sunucuda baglantidan turetilir (raporlayanin karsi tarafi). Auth + taraf kontrolu.
import { admin } from '../lib/supabase.js';
import { getUser } from '../lib/auth.js';
import { json, withErrors } from '../lib/http.js';

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') { json(res, 405, { error: 'POST gerekli' }); return; }
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }

  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body || '{}');
  const connectionId = body?.connection_id;
  const reason = (body?.reason || '').trim().slice(0, 500) || null;
  if (!connectionId) { json(res, 400, { error: 'connection_id gerekli' }); return; }

  const db = admin();
  const { data: c } = await db.from('connections')
    .select('id, requester_id, addressee_id').eq('id', connectionId).maybeSingle();
  if (!c) { json(res, 404, { error: 'Baglanti bulunamadi' }); return; }
  if (c.requester_id !== user.id && c.addressee_id !== user.id) { json(res, 403, { error: 'Yetkisiz' }); return; }
  const reportedId = c.requester_id === user.id ? c.addressee_id : c.requester_id;

  const { error } = await db.from('reports')
    .insert({ reporter_id: user.id, reported_id: reportedId, connection_id: connectionId, reason });
  if (error) throw error;
  json(res, 200, { ok: true });
});
