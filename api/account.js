// DELETE /api/account — giris yapan kullanici KENDI hesabini siler.
// Auth kullanicisini siler -> profiles/attendance/connections/messages CASCADE gider.
import { admin } from '../lib/supabase.js';
import { getUser } from '../lib/auth.js';
import { json, withErrors } from '../lib/http.js';

export default withErrors(async (req, res) => {
  if (req.method !== 'DELETE' && req.method !== 'POST') { json(res, 405, { error: 'DELETE gerekli' }); return; }
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }

  const { error } = await admin().auth.admin.deleteUser(user.id);
  if (error) throw error;
  json(res, 200, { ok: true });
});
