-- v2 — Sosyal katman semasi. db/schema.sql'den SONRA calistir. Idempotent.
-- Erisim kontrolu sunucu API'sinde (getUser + sahiplik kontrolu) yapilir; RLS yok.

-- Kullanici profili (auth.users'a baglanir)
create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  bio           text,
  interests     text[] not null default '{}',   -- eslestirme + feed icin
  gender        text,                            -- opsiyonel (ileride guvenlik filtreleri)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Etkinlik katilimi: "gidecegim" / "ilgileniyorum" (+ eslik ariyor mu)
create table if not exists event_attendance (
  user_id       uuid references auth.users(id) on delete cascade,
  event_id      uuid references events(id) on delete cascade,
  status        text not null check (status in ('going', 'interested')),
  want_company  boolean not null default true,
  created_at    timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index if not exists event_attendance_event on event_attendance (event_id);

-- Baglantilar (eslik istekleri / eslesmeler)
create table if not exists connections (
  id            bigint generated always as identity primary key,
  requester_id  uuid not null references auth.users(id) on delete cascade,
  addressee_id  uuid not null references auth.users(id) on delete cascade,
  event_id      uuid references events(id) on delete set null,   -- hangi etkinlik baglaminda
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (requester_id, addressee_id, event_id)
);
create index if not exists connections_addressee on connections (addressee_id, status);
create index if not exists connections_requester on connections (requester_id, status);
drop trigger if exists connections_set_updated_at on connections;
create trigger connections_set_updated_at before update on connections
  for each row execute function set_updated_at();

-- Uygulama ici mesajlar (yalniz status='accepted' baglantida)
create table if not exists messages (
  id            bigint generated always as identity primary key,
  connection_id bigint not null references connections(id) on delete cascade,
  sender_id     uuid not null references auth.users(id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists messages_conn on messages (connection_id, created_at);
