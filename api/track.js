// POST /api/track — etkilesim logu (view | click | save | unsave | ticket_click)
// Body: { event_id, kind }. Auth varsa user_id baglanir, yoksa anonim (null user).
// ticket_click ayrica events.popularity'i artirir (basit populerlik sinyali).
import { admin } from '../lib/supabase.js';
import { getUser } from '../lib/auth.js';
import { json, withErrors } from '../lib/http.js';

const KINDS = new Set(['view', 'click', 'save', 'unsave', 'ticket_click']);

export default withErrors(async (req, res) => {
  if (req.method !== 'POST') { json(res, 405, { error: 'POST gerekli' }); return; }

  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body || '{}');
  const { event_id, kind } = body ?? {};
  if (!event_id || !KINDS.has(kind)) { json(res, 400, { error: 'event_id ve gecerli kind gerekli' }); return; }

  const user = await getUser(req);
  const db = admin();
  await db.from('user_interactions').insert({ user_id: user?.id ?? null, event_id, kind });

  if (kind === 'ticket_click' || kind === 'save') {
    // populerlik sinyali; RPC hata verirse sessiz gec (etkilesim logu zaten yazildi)
    await db.rpc('increment_popularity', { p_event_id: event_id }).then(() => {}, () => {});
  }
  json(res, 200, { ok: true });
});
