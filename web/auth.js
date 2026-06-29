// Supabase Auth (frontend) — e-posta + sifre, ilk kayitta e-posta dogrulama.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** API cagrilarina eklenecek JWT (oturum yoksa null). */
export async function getToken() {
  const { data } = await supa.auth.getSession();
  return data.session?.access_token || null;
}

/** Oturum degisimi: (user, event). event 'PASSWORD_RECOVERY' = sifre sifirlama linki. */
export function onAuth(cb) {
  supa.auth.onAuthStateChange((event, session) => cb(session?.user ?? null, event));
}

/** Sifre sifirlama e-postasi gonder. */
export function resetPassword(email) {
  return supa.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
}

/** Yeni sifre belirle (recovery oturumunda veya giris yapmisken). */
export function updatePassword(password) {
  return supa.auth.updateUser({ password });
}

/** Avatar yukle (avatars bucket, "<uid>/avatar.<ext>") -> public URL doner. */
export async function uploadAvatar(file) {
  const { data: { user } } = await supa.auth.getUser();
  if (!user) throw new Error('Giriş gerekli');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${user.id}/avatar.${ext}`;
  const { error } = await supa.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supa.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;   // cache-bust
}

/** Kayit ol — dogrulama e-postasi gonderilir (link uygulamaya geri doner). */
export function signUp(email, password, displayName) {
  return supa.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: window.location.origin,
      data: displayName ? { display_name: displayName } : undefined,
    },
  });
}

/** Giris — e-posta + sifre. */
export function signIn(email, password) {
  return supa.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  await supa.auth.signOut();
}
