-- Istanbul Etkinlik Kesif & Agregasyon — v1 semasi
-- Supabase Postgres. Idempotent calismaya yakin: IF NOT EXISTS kullanir.
-- Calistirma: Supabase SQL editor'e yapistir, ya da `psql < db/schema.sql`.

-- ---------------------------------------------------------------------------
-- Eklentiler
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;      -- dedup: trigram benzerligi
create extension if not exists "uuid-ossp";  -- uuid uretimi
-- v2 (embedding tabanli oneri) icin hazir; v1'de KULLANILMAZ:
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Kaynaklar (connector kaydi)
-- ---------------------------------------------------------------------------
create table if not exists sources (
  id          text primary key,            -- 'ticketmaster', 'salt', 'goethe', 'kultur', 'mock'
  name        text not null,
  kind        text not null default 'api', -- api | feed | affiliate | manual
  enabled     boolean not null default true,
  last_run_at timestamptz,
  config      jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Mekanlar (bir kez geocode edilip cache'lenir)
-- ---------------------------------------------------------------------------
create table if not exists venues (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  address     text,
  city        text not null default 'Istanbul',
  district    text,
  lat         double precision,
  lng         double precision,
  -- ayni mekanin tekrar yaratilmamasi icin normalize anahtar
  norm_key    text generated always as (lower(trim(name)) || '|' || lower(coalesce(city,''))) stored,
  created_at  timestamptz not null default now()
);
create unique index if not exists venues_norm_key_uniq on venues (norm_key);
create index if not exists venues_name_trgm on venues using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Ham etkinlikler (staging) — connector ciktisi normalize edilmeden once
-- ---------------------------------------------------------------------------
create table if not exists raw_events (
  id            bigint generated always as identity primary key,
  source_id     text not null references sources(id),
  source_uid    text not null,             -- kaynagin kendi etkinlik id'si
  payload       jsonb not null,            -- ham JSON
  fetched_at    timestamptz not null default now(),
  processed_at  timestamptz,               -- normalize edildiyse dolar
  unique (source_id, source_uid)
);
create index if not exists raw_events_unprocessed on raw_events (source_id) where processed_at is null;

-- ---------------------------------------------------------------------------
-- Kanonik etkinlikler (dedup edilmis, servise giden tablo)
-- ---------------------------------------------------------------------------
create table if not exists events (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  description   text,
  category      text[] not null default '{}',   -- normalize kategoriler
  tags          text[] not null default '{}',
  start_at      timestamptz not null,
  end_at        timestamptz,
  venue_id      uuid references venues(id),
  city          text not null default 'Istanbul',
  price_min     numeric,
  price_max     numeric,
  currency      text default 'TRY',
  is_free       boolean not null default false,
  image_url     text,
  organizer     text,
  status        text not null default 'scheduled',   -- scheduled | postponed | cancelled
  popularity    integer not null default 0,          -- kaynak/etkilesim sinyali
  og_checked    boolean not null default false,      -- detayda og:description bir kez denendi mi
  -- dedup blocking key: normalize baslik + gun + mekan
  dedup_key     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
  -- v2: embedding vector(768)  -- simdilik eklenmedi
);
create index if not exists events_start_at on events (start_at);
create index if not exists events_city on events (city);
create index if not exists events_category_gin on events using gin (category);
create index if not exists events_tags_gin on events using gin (tags);
create index if not exists events_title_trgm on events using gin (title gin_trgm_ops);
create index if not exists events_dedup_key on events (dedup_key);

-- ---------------------------------------------------------------------------
-- Etkinlik <-> kaynak (cok-cok). Bir etkinlik birden cok kaynaktan gelebilir;
-- her kaynagin kendi (affiliate) bilet linki burada saklanir.
-- ---------------------------------------------------------------------------
create table if not exists event_sources (
  event_id    uuid not null references events(id) on delete cascade,
  source_id   text not null references sources(id),
  source_uid  text not null,
  ticket_url  text,                        -- affiliate deep-link
  raw_event_id bigint references raw_events(id),
  primary key (event_id, source_id, source_uid)
);
create index if not exists event_sources_event on event_sources (event_id);

-- ---------------------------------------------------------------------------
-- Kategori & tag sozlukleri (kural-tabanli enrich icin referans)
-- ---------------------------------------------------------------------------
create table if not exists categories (
  slug    text primary key,               -- 'konser', 'tiyatro', 'atolye', 'ucretsiz'...
  label   text not null
);
create table if not exists tags (
  slug    text primary key,
  label   text not null
);

-- ---------------------------------------------------------------------------
-- Kullanicilar (Supabase auth.users'a baglanir) + tercihler
-- ---------------------------------------------------------------------------
create table if not exists users (
  id          uuid primary key,            -- = auth.users.id
  email       text,
  created_at  timestamptz not null default now()
);

create table if not exists user_preferences (
  user_id        uuid primary key references users(id) on delete cascade,
  interests      text[] not null default '{}',  -- onboarding'de secilen kategoriler
  home_lat       double precision,
  home_lng       double precision,
  free_only      boolean not null default false,
  max_distance_km integer default 25,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Etkilesimler (feed agirliklarini ayarlamak + v2 davranissal oneri icin)
-- ---------------------------------------------------------------------------
create table if not exists user_interactions (
  id          bigint generated always as identity primary key,
  user_id     uuid references users(id) on delete cascade,
  event_id    uuid references events(id) on delete cascade,
  kind        text not null,               -- view | click | save | unsave | ticket_click
  created_at  timestamptz not null default now()
);
create index if not exists user_interactions_user on user_interactions (user_id, created_at desc);
create index if not exists user_interactions_event on user_interactions (event_id);

-- ---------------------------------------------------------------------------
-- updated_at otomatik guncelleme
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists events_set_updated_at on events;
create trigger events_set_updated_at before update on events
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Popularite artirma (track endpoint'i cagirir)
-- ---------------------------------------------------------------------------
create or replace function increment_popularity(p_event_id uuid)
returns void as $$
  update events set popularity = popularity + 1 where id = p_event_id;
$$ language sql;

-- ---------------------------------------------------------------------------
-- Seed: temel kategoriler
-- ---------------------------------------------------------------------------
insert into categories (slug, label) values
  ('konser', 'Konser'),
  ('tiyatro', 'Tiyatro'),
  ('sahne', 'Sahne / Performans'),
  ('atolye', 'Atolye / Workshop'),
  ('bulusma', 'Bulusma / Meetup'),
  ('sergi', 'Sergi'),
  ('film', 'Film / Sinema'),
  ('spor', 'Spor'),
  ('aile', 'Aile / Cocuk'),
  ('teknoloji', 'Teknoloji'),
  ('diger', 'Diger')
on conflict (slug) do nothing;
