-- v3: sanatci takip ozelligini kaldir. Onceki migration'lardan SONRA. Idempotent.
-- Daha once db/v2-follows.sql calistirilmis kurulumlari temizler;
-- temiz kurulumlarda "if exists" sayesinde guvenle no-op.

drop table if exists artist_follows;

drop index if exists events_artist;
alter table events drop column if exists artist;
