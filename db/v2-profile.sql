-- v2 profil genisletme: eslestirme alanlari + avatar storage. db/v2.sql'den SONRA. Idempotent.

-- Eslestirme bilgileri (cinsiyet zaten profiles'ta var)
alter table profiles add column if not exists birth_year int;
alter table profiles add column if not exists district  text;

-- Avatar fotograflari icin public storage bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage politikalari: herkes okur; kullanici yalniz KENDI klasorune yazar
-- (yol: "<user_id>/avatar.jpg" -> ilk klasor = auth.uid()).
drop policy if exists "avatars_read"   on storage.objects;
drop policy if exists "avatars_insert" on storage.objects;
drop policy if exists "avatars_update" on storage.objects;

create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
