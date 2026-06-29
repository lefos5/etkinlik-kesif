# Nereye? — Istanbul Etkinlik Kesif & Agregasyon (v1)

Sehirdeki **tum** etkinlikleri (ticketli konserler, ucretsiz buluşmalar, atolyeler,
yerel topluluk etkinlikleri) tek bir **kisisellestirilmis akista** toplayan platform.
Bilet satisina girmez — mevcut platformlara **affiliate/deep-link** ile yonlendirir.

> v1 kapsam: **agregasyon + kesif + kural-tabanli kisisellestirme**. Sosyal eslestirme
> ("kiminle gitsem") **v2**'ye birakildi. v1 servis yolunda **AI yok** (detay asagida).

## Mimari (8 katman)

```
connector → raw_events → normalize → enrich → dedup → events → feed(skor) → API → web
  (kaynak)   (staging)   (kanonik)  (kategori) (pg_trgm)         (kural)
```

| Katman | Dosya | Not |
|---|---|---|
| Connector | `lib/connectors/*.js` | Ortak `fetchEvents()` arayuzu; pluggable. Aktif: `ticketmaster`, `salt`, `goethe`, `kultur` (+ dev: `mock`). |
| Pipeline | `lib/pipeline.js` | connector→raw_events→normalize→persist orkestrasyonu. |
| Normalize | `lib/normalize.js` | RawEvent → kanonik; `dedup_key` uretir. Saf fonksiyon. |
| Enrich | `lib/enrich.js` | Kategori/tag/ucretsiz cikarimi. **Kural-tabanli, LLM opsiyonel.** |
| Dedup | `lib/dedup.js` + `lib/persist.js` | Blocking key + pg_trgm trigram benzerligi. |
| Feed | `lib/feed.js` | Kural-tabanli skorlama (ilgi/konum/recency/populerlik/ucretsiz). |
| API | `api/*.js` | Vercel serverless. |
| Web | `web/` | Vanilla JS SPA, build yok. |

## AI kullanimi — neden v1'de yok?

v1 = İstanbul'da resmi kaynaklardan toplama + kural-tabanli "bu hafta sana uygun N etkinlik".
Bu klasik veri muhendisligidir; embedding/LLM gerekmez. AI'in *opsiyonel* deger kattigi
tek yer **ingestion-ani zenginlestirme** (`lib/enrich.js`) — kategori normalizasyonu ve tag
cikarimi. Default **kapali ve kural-tabanli**; `ENRICH_PROVIDER` env'i set edilirse araya
LLM girer. Gercek embedding/oneri **v2**'de sosyal eslestirme ile gelir (`pgvector` semada hazir).

## Kurulum

```bash
npm install
cp .env.example .env        # SUPABASE_URL + SERVICE_ROLE + ANON doldur
# Supabase SQL editor'de db/schema.sql calistir (pg_trgm + tablolar + seed)
npm run dev                 # vercel dev → http://localhost:3000
```

## Kullanim

```bash
npm test                    # 17 birim testi (dedup + feed + enrich/normalize), DB'siz
npm run ingest:mock         # mock kaynagi DB'ye yaz (dedup'i canli gor: mock-1 + mock-2 → tek event)
```

API:
- `GET /api/events?category=konser&free=1&q=...` — gozat/filtre
- `GET /api/events/:id` — detay + kaynak/affiliate linkleri
- `GET /api/feed?interests=konser,atolye&free=1&lat=..&lng=..` — kisisellestirilmis akis
- `POST /api/track` `{event_id, kind}` — etkilesim logu (populerlik sinyali)
- `GET /api/cron/ingest/:source` — kaynak calistir (Cron + CRON_SECRET)

## Aktif kaynaklar

- ✅ **Ticketmaster / Biletix** (`lib/connectors/ticketmaster.js`) — **birincil/en buyuk kaynak.**
  Biletix = Ticketmaster TR markasi; Discovery API (`countryCode=TR`) Biletix envanterini RESMI kapsar
  (tiyatro dahil). Ucretsiz anahtar: developer.ticketmaster.com → `TICKETMASTER_API_KEY`.
- ✅ **SALT** (`ical-factory` ile) — ucretsiz kultur etkinlikleri (iCal). `SALT_ICAL_URL`.
- ✅ **Goethe-Institut** (`goethe.js`, RSS) — ucretsiz kultur etkinlikleri. Varsayilan URL.
- ✅ **kultur.istanbul** (`kultur.js` → `wp-event-factory`) — IBB kamu portali (WP REST `event_listing`).
- `mock` (`mock.js`) — yalniz yerel test/gelistirme.

Yeni WP Event Manager sitesi eklemek: `makeWpEventConnector({ id, name, baseUrl })` (tek satir).
Yeni iCal sitesi: `makeIcalConnector({ id, name, feedEnv })`.

> Not: Tiyatrolar (biletinial), muzeler, ilce belediyeleri makine-okunur feed sunmuyor; scraping'siz
> erisilemiyor. "Tum etkinlikler" hedefi scraping gerektirir — v1'de kapsam disi.

## Verification (uctan uca)

1. `npm test` → 17/17 gecmeli (dedup blocking + fuzzy, feed skor sirasi, enrich).
2. `db/schema.sql` calistir → `npm run ingest:mock` → ozet `inserted: 3, deduped: 1`
   (mock-1 ve mock-2 ayni etkinlik → tek `events` satiri, iki `event_sources`).
3. `npm run dev` → `/` feed'i acar. İlgi Alanlarim'dan kategori sec → feed yeniden siralanir.
4. Bir karta tikla → detay + affiliate "bilet al" linki dogru kaynaga gider (`ticket_click` loglanir).
```

## v2 (bu surumun disinda)
Sosyal eslestirme katmani: "bu etkinlige gidecek, senin gibi biriyle eslesş". Uyumluluk/
sosyal graf + `pgvector` embedding oneri. v1'in `user_interactions` + `user_preferences`
verisi bu motoru besler; sema bunu tasiyacak sekilde tasarlandi.
