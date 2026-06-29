# Nereye? — v2 Teknik Planı (Sosyal Eşleştirme)

> Hedef: "Bu etkinliğe gidecek, **senin gibi biriyle** eşleş." v1 agregasyon/keşif üstüne
> sosyal katman ekler. Felsefe v1 ile aynı: **kural-tabanlı, AI yok** (embedding/pgvector
> sonraya bırakılan opsiyonel iyileştirme). Erişim kontrolü **sunucu API'sinde** (RLS yok,
> `admin()` service-role) — bu yüzden her uç noktada sahiplik/yetki kontrolü **zorunlu**.

## 0. Mevcut durum (bu plan yazıldığında)

**Hazır (şema):** `event_attendance`, `connections`, `messages` tabloları `db/v2.sql`'de tanımlı.
`profiles` eşleştirme alanları: `gender`, `birth_year`, `district`, `interests`, `nickname`, `avatar_url`, `bio`.

**Eksik:** Bu tablolara dokunan **hiçbir API veya UI yok**. Profil "Eşleştirme" sekmesi yalnızca
veri topluyor. Yani v2 fonksiyonel olarak sıfırdan başlıyor; altyapı tasarlanmış.

**Anahtar tasarım kararı (zaten verilmiş):** `nickname` = public handle. Eşleşme adaylarına
**gerçek ad-soyad değil, @nickname** gösterilir. Bağlanınca (accepted) bile mesajlaşma @nickname
üzerinden. Bu, gizliliğin temel taşı.

---

## 1. Güvenlik & gizlilik prensipleri (önce bunlar)

Sosyal eşleştirme = en yüksek risk yüzeyi. Tüm uçlar bu kurallara uyar:

1. **want_company kapısı:** Yalnızca bir etkinlik için `want_company=true` işaretleyen kullanıcılar
   aday havuzunda görünür. Opt-in olmayan kimse listelenmez.
2. **Ne paylaşılır (aday kartı):** `nickname`, `avatar_url`, `bio`, ortak ilgi alanları,
   `district`, **yaş aralığı** (kesin doğum yılı değil, ör. "25-29"), `gender` (opsiyonel göster).
   **Asla:** e-posta, gerçek ad-soyad, kesin doğum tarihi.
3. **Engelleme:** `connections.status='blocked'` iki yönlü görünmezlik sağlar; engellenen,
   adaylarda/bağlantılarda/mesajlarda hiç çıkmaz.
4. **Mesajlaşma yalnız `accepted` bağlantıda.** `pending`/`declined`/`blocked` → mesaj yok.
5. **Yaş alt sınırı: 18+ zorunlu** (karar verildi). Eşlik/bağlantı/mesaj uçları ve UI'sı
   yalnız 18 yaşını doldurmuşlara açık. `birth_year` yoksa veya 18'in altındaysa → 403 +
   UI'da "Bu özellik 18+ gerektirir; Eşleştirme sekmesinden doğum yılını gir." Sunucuda da kontrol.
6. **Raporlama:** Kötüye kullanım bildirimi → v2.1 (şema: `reports` tablosu ileride).
7. **Service-role uyarısı:** `admin()` RLS'i bypass eder. Her sorguda `eq('user_id', user.id)`
   veya bağlantı sahipliği elle doğrulanır. Tek bir eksik kontrol = veri sızıntısı.

---

## 2. Veri modeli — mevcut + gerekli eklemeler

### Mevcut (değişmez)
- `event_attendance(user_id, event_id, status['going'|'interested'], want_company, created_at)`
- `connections(id, requester_id, addressee_id, event_id, status, ...)` — unique(requester,addressee,event)
- `messages(id, connection_id, sender_id, body, created_at)`

### Eklemeler — **gerek yok** (karar verildi)
Cinsiyet tercihiyle filtreleme yok → `match_gender_pref` vb. kolonlar eklenmez. Skorlama yalnız
mevcut `interests` / `district` / `birth_year` alanlarını kullanır. Yaş, eşleşmede **yakınlık**
sinyali olarak kullanılır (sabit aralık tercihi değil), bu yüzden ek kolon gerekmez.
**Sonuç: M1-M4 için yeni migration yok.** (`db/v2.sql` tabloları yeterli.)

---

## 3. API uçları (adım adım)

Tüm uçlar `withErrors` + `getUser(req)` (401 yoksa) + `json(res, ...)` desenini kullanır.

### Adım 1 — Katılım (RSVP) `api/attendance.js`
| Method | Path | Gövde | Davranış |
|---|---|---|---|
| POST | `/api/attendance` | `{event_id, status, want_company}` | upsert (onConflict user_id,event_id). `status∈{going,interested}` doğrula. |
| DELETE | `/api/attendance` | `{event_id}` | kendi kaydını sil |
| GET | `/api/attendance?event_id=` | — | bu etkinlikteki kendi durumun |
| GET | `/api/me/attendance?status=going` | — | "Gideceklerim" listesi (events join) |

Edge: etkinlik var mı / status `scheduled` mı (geçmiş etkinliğe RSVP'yi engelle — opsiyonel).

### Adım 2 — Eşleşme adayları `api/events/[id]/companions.js`
- `GET /api/events/:id/companions`
- Ön koşul: çağıran **18+** olmalı + o etkinliğe **going/interested + want_company** olmalı
  (yoksa 403 "önce eşlik aramayı aç").
- Sorgu: aynı `event_id`'ye **`going` veya `interested`** + `want_company=true` olan **diğer**
  18+ kullanıcılar (aday kartında `status` rozet olarak gösterilir: "Gidecek" / "İlgileniyor").
- Engellenen/engelleyen çiftleri çıkar (`connections.status='blocked'`).
- Zaten bağlantı olanların durumunu işaretle (`pending`/`accepted`).
- Her aday için `lib/match.js`'ten uyumluluk skoru + sebepler.
- Yanıt: skora göre sıralı aday kartları (yalnız §1.2'deki güvenli alanlar).

### Adım 3 — Bağlantılar `api/connections.js` (+ `api/connections/[id].js`)
| Method | Path | Gövde | Kontrol |
|---|---|---|---|
| POST | `/api/connections` | `{addressee_id, event_id}` | kendine değil; ikisi de aynı etkinlikte going+want_company; çift istek engelle (unique); engellenmemiş |
| GET | `/api/connections` | — | gelen (`addressee=me, pending`), giden, kabul edilenler |
| PATCH | `/api/connections/:id` | `{action: accept\|decline\|block}` | yalnız `addressee` accept/decline; her iki taraf block |

### Adım 4 — Mesajlar `api/connections/[id]/messages.js`
| Method | Path | Kontrol |
|---|---|---|
| GET | `/api/connections/:id/messages` | çağıran bağlantının tarafı + `status='accepted'` |
| POST | `/api/connections/:id/messages` `{body}` | aynı + body 1..1000 char; engellenmemiş |

> Gerçek-zaman: v2.0'da **polling** (GET her N sn). Supabase Realtime → v2.1 iyileştirmesi.

---

## 4. Eşleştirme mantığı — `lib/match.js` (saf fonksiyon, AI yok)

`scoreCandidate(me, them, ctx)` → `{ score, reasons[] }`. Test edilebilir (v1'deki `lib/feed.js`
deseni gibi `node --test`). Kural ağırlıkları:

| Sinyal | Mantık | Ağırlık (öneri) |
|---|---|---|
| Ortak ilgi alanları | kesişim sayısı / Jaccard | en yüksek |
| Aynı semt | `district` eşit | orta |
| Yaş yakınlığı | `|age_me - age_them|` küçükse yüksek | orta |
| Profil doluluğu | bio/avatar var → küçük bonus (ciddi kullanıcı) | düşük |

> Cinsiyet filtresi **yok** (karar). Skorlama cinsiyetten bağımsız.

`reasons` UI'da "Neden?" rozetleri: "3 ortak ilgi · Aynı semt (Kadıköy) · Yaşıt".
İleride pgvector embedding skoru bu kuralların yanına eklenebilir (README'deki vizyon).

---

## 5. UI akışları (vanilla JS, build yok — mevcut desen)

1. **Etkinlik detayı:** "♥ Kaydet" yanına **"Gideceğim"** / **"İlgileniyorum"** + açıldığında
   **"Eşlik arıyorum"** anahtarı. Going+want_company ise → **"Etkinlik arkadaşı bul"** butonu.
2. **Etkinlik arkadaşı bul ekranı (modal/sayfa):** aday kartları (avatar, @nick, yaş aralığı, semt, ortak
   ilgi rozetleri, uyumluluk %, "Neden?"). "Eşlik isteği gönder" / durum etiketi.
3. **Profil → yeni "Bağlantılar" sekmesi:** Gelen istekler (kabul/reddet), kabul edilenler
   (→ sohbet), gönderilenler. Rozet: bekleyen istek sayısı topbar'da.
4. **Sohbet:** basit mesaj listesi + gönderme kutusu (accepted bağlantı).
5. **Profil → "Gideceklerim" sekmesi:** RSVP verdiğin etkinlikler.
6. **Eşleştirme sekmesi (mevcut):** cinsiyet/yaş/semt + (karar verilirse) eşleşme tercihleri.

---

## 6. İnşa sırası (milestone'lar)

- **M1 — RSVP temeli:** ✅ **TAMAM** (`api/attendance.js` + detay "Gideceğim/İlgileniyorum" + "Eşlik arıyorum" + profil "Gideceklerim"). `v2-rsvp` branch'inde, preview'de test edildi.
- **M2 — Adaylar + skorlama:** ✅ **TAMAM** — `lib/match.js` (+ testler) + `companions` API + "Etkinlik arkadaşı bul" ekranı. `v2-rsvp` branch'inde.
- **M3 — Bağlantılar:** `api/connections*` + "Bağlantılar" sekmesi + istek akışı.
- **M4 — Mesajlaşma:** messages API + sohbet UI (polling).
- **M5 — Cila/güvenlik:** engelleme UI, raporlama iskeleti, yaş kapısı, boş durumlar, oran sınırı.

Her milestone tek başına deploy edilebilir ve değer üretir.

---

## 7. Kararlar

**Verildi:**
1. ✅ **Cinsiyet filtresi YOK** — herkes eşleşebilir; skorlama yalnız ilgi/semt/yaş.
2. ✅ **18+ zorunlu** — eşlik/bağlantı/mesaj 18 yaş kapısı arkasında (sunucu + UI kontrolü).
3. ✅ **Aday havuzu = `going` + `interested`** (want_company=true olanlar).

**Sonraya / varsayılan:**
4. **Mesajlaşma:** v2.0 **polling** (varsayılan). Realtime → v2.1.
5. **Embedding/pgvector:** M5 sonrası iyileştirme (şimdilik kural-tabanlı).
6. **Oran sınırı:** M5'te basit sınır (istek/mesaj spam'ine karşı).

---

## 8. Test stratejisi

- `lib/match.js` → saf fonksiyon, `node --test` ile birim test (v1'deki `feed.test.js` gibi):
  ortak ilgi skoru, yaş yakınlığı, cinsiyet filtresi, sebep üretimi.
- API uçları → manuel/uçtan-uca (DB gerektirir); kritik yetki kontrolleri için checklist.
- Güvenlik checklist: her uçta "başkasının verisine erişebilir miyim?" senaryosu.
