// Supabase JWT'den kullaniciyi cozer. Authorization: Bearer <access_token>.
// Kullanici yoksa null doner (anonim akislar icin).
import { admin } from './supabase.js';

export async function getUser(req) {
  const h = req.headers.authorization || req.headers.Authorization;
  if (!h?.startsWith('Bearer ')) return null;
  const token = h.slice(7);
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user; // { id, email, ... }
}

/** Cron endpoint korumasi: Authorization: Bearer <CRON_SECRET>. */
export function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // secret tanimsizsa (yerel dev) gecir
  const h = req.headers.authorization || '';
  return h === `Bearer ${secret}`;
}
