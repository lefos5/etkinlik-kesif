-- v5: kullanici raporlama (kotuye kullanim bildirimi). Onceki migration'lardan SONRA. Idempotent.
-- Iskelet: rapor toplanir; moderasyon/aksiyon ileride (admin paneli yok).

create table if not exists reports (
  id            bigint generated always as identity primary key,
  reporter_id   uuid not null references auth.users(id) on delete cascade,
  reported_id   uuid not null references auth.users(id) on delete cascade,
  connection_id bigint references connections(id) on delete set null,
  reason        text,
  created_at    timestamptz not null default now()
);
create index if not exists reports_reported on reports (reported_id);
