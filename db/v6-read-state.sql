-- v6: sohbet okundu durumu (cihazlar arasi). Onceki migration'lardan SONRA. Idempotent.
-- Her taraf icin "bu baglantida en son ne zaman okudum" — bildirimde okunmamis mesaji tespit eder.

alter table connections add column if not exists requester_read_at timestamptz;
alter table connections add column if not exists addressee_read_at  timestamptz;
