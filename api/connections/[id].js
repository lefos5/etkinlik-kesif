// PATCH /api/connections/:id {action: accept|decline|block} — v2 M3.
// accept/decline: yalniz istegi ALAN (addressee), istek 'pending' iken.
// block: her iki taraf da yapabilir.
import { admin } from '../../lib/supabase.js';
import { getUser } from '../../lib/auth.js';
import { json, withErrors } from '../../lib/http.js';

const ACTIONS = new Set(['accept', 'decline', 'block']);

export default withErrors(async (req, res) => {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }
  const id = req.query?.id || new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean).at(-1);

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

  // accept / decline
  if (!isAddressee) { json(res, 403, { error: 'Yalnız isteği alan kabul/ret edebilir' }); return; }
  if (c.status !== 'pending') { json(res, 400, { error: 'İstek beklemede değil' }); return; }
  const status = action === 'accept' ? 'accepted' : 'declined';
  await db.from('connections').update({ status }).eq('id', id);
  json(res, 200, { ok: true, status });
});
