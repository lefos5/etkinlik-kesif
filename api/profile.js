// GET    /api/profile  -> giris yapan kullanicinin profili (yoksa olusturur)
// PUT    /api/profile  -> profili gunceller { display_name, nickname, bio, interests }
// DELETE /api/profile  -> KENDI hesabini siler (auth user -> profiles/attendance/connections CASCADE)
import { admin } from '../lib/supabase.js';
import { getUser } from '../lib/auth.js';
import { json, withErrors } from '../lib/http.js';

export default withErrors(async (req, res) => {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }
  const db = admin();

  if (req.method === 'DELETE') {
    const { error } = await admin().auth.admin.deleteUser(user.id);
    if (error) throw error;
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'PUT') {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const patch = { id: user.id };
    if (typeof body.display_name === 'string') patch.display_name = body.display_name.trim().slice(0, 60);
    if (body.nickname === null || body.nickname === '') {
      patch.nickname = null;
    } else if (typeof body.nickname === 'string') {
      const nick = body.nickname.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(nick)) {
        json(res, 400, { error: 'Kullanıcı adı 3-20 karakter olmalı; küçük harf, rakam ve _ içerebilir.' });
        return;
      }
      patch.nickname = nick;
    }
    if (typeof body.bio === 'string') patch.bio = body.bio.trim().slice(0, 280);
    if (Array.isArray(body.interests)) patch.interests = body.interests.filter((s) => typeof s === 'string').slice(0, 20);
    if (typeof body.avatar_url === 'string') patch.avatar_url = body.avatar_url.slice(0, 500);
    if (body.gender === null || ['kadın', 'erkek', 'diğer'].includes(body.gender)) patch.gender = body.gender || null;
    if (body.district === null || typeof body.district === 'string') patch.district = body.district || null;
    if (body.birth_year === null || Number.isInteger(body.birth_year)) {
      const y = body.birth_year;
      patch.birth_year = (y && y >= 1925 && y <= new Date().getFullYear() - 13) ? y : null;
    }
    const { data, error } = await db.from('profiles').upsert(patch, { onConflict: 'id' }).select('*').single();
    if (error) {
      if (error.code === '23505') { json(res, 409, { error: 'Bu kullanıcı adı alınmış.' }); return; }
      throw error;
    }
    json(res, 200, { profile: data });
    return;
  }

  // GET — yoksa bos profili olustur (e-postadan varsayilan ad)
  let { data: profile, error } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!profile) {
    const md = user.user_metadata || {};
    const fallbackName = md.display_name || (user.email || '').split('@')[0] || 'Kullanıcı';
    const insert = { id: user.id, display_name: fallbackName };           // kayit formundan gelen meta'yi tasi
    if (['kadın', 'erkek', 'diğer'].includes(md.gender)) insert.gender = md.gender;
    const by = Number(md.birth_year);
    if (Number.isInteger(by) && by >= 1925 && by <= new Date().getFullYear() - 13) insert.birth_year = by;
    ({ data: profile, error } = await db.from('profiles')
      .insert(insert).select('*').single());
    if (error) throw error;
  }
  json(res, 200, { profile });
});
