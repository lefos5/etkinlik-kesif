-- v4: profile nickname (benzersiz @handle). Onceki migration'lardan SONRA. Idempotent.
-- Adin altinda @kullaniciadi olarak gosterilir; v2 sosyal eslestirmede public handle olur.

alter table profiles add column if not exists nickname text;

-- Buyuk/kucuk harf duyarsiz benzersizlik. NULL nick'ler index'lenmez (cok kullanici nicksiz olabilir).
create unique index if not exists profiles_nickname_unique on profiles (lower(nickname));
