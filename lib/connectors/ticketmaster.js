// Ticketmaster Discovery API connector — RESMI kaynak.
// Onemli: Biletix, Ticketmaster'in Turkiye markasi; bu API'nin etkinlik url'leri
// dogrudan biletix.com'a gider. Yani Biletix envanterini RESMI yoldan kapsar.
//
// Anahtar: developer.ticketmaster.com'dan ucretsiz alinir -> TICKETMASTER_API_KEY.
// Endpoint: https://app.ticketmaster.com/discovery/v2/events.json
// Kapsam: countryCode=TR, city=Istanbul.
import { assertRawEvent } from './base.js';

const BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';

// Discovery API en fazla ~1000 sonuc derinligine izin verir (size*page <= 1000).
const PAGE_SIZE = 199;
const MAX_PAGES = 5;

/** En uygun gorseli sec (genis, 16_9 tercih). */
function pickImage(images = []) {
  if (!images.length) return null;
  const wide = images.filter((i) => i.ratio === '16_9').sort((a, b) => (b.width || 0) - (a.width || 0));
  return (wide[0] || images[0]).url ?? null;
}

/** ISO start: dateTime varsa onu, yoksa localDate(+localTime) birlestir. */
function startIso(dates) {
  const s = dates?.start;
  if (!s) return null;
  if (s.dateTime) return s.dateTime;
  if (s.localDate) return new Date(`${s.localDate}T${s.localTime || '00:00:00'}`).toISOString();
  return null;
}

/** Bilet linkine affiliate parametresi ekle (varsa). */
function withAffiliate(url) {
  const aff = process.env.BILETIX_AFFILIATE_ID;
  if (!url || !aff) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('aff', aff);
    return u.toString();
  } catch { return url; }
}

/** Tek bir Discovery event nesnesini RawEvent'e cevirir. (Test edilebilir.) */
export function mapEvent(ev) {
  const venue = ev._embedded?.venues?.[0];
  const price = ev.priceRanges?.[0];
  const startAt = startIso(ev.dates);
  const seg = ev.classifications?.[0]?.segment?.name; // "Music" | "Arts & Theatre" | "Sports" ...
  const genre = ev.classifications?.[0]?.genre?.name;

  // Ticketmaster durum kodu -> kanonik status (iptal/erteleme bildirimi)
  const statusCode = ev.dates?.status?.code; // onsale | offsale | cancelled | postponed | rescheduled
  const status = statusCode === 'cancelled' ? 'cancelled'
    : (statusCode === 'postponed' || statusCode === 'rescheduled') ? 'postponed'
    : 'scheduled';

  return assertRawEvent({
    sourceUid: ev.id,
    title: ev.name,
    description: ev.info || ev.pleaseNote || null,
    startAt,
    endAt: ev.dates?.end?.dateTime ?? null,
    venue: venue ? {
      name: venue.name,
      address: venue.address?.line1 ?? null,
      city: 'Istanbul',
      district: null,                  // semt koordinattan reverse-geocode ile bulunur
      lat: venue.location?.latitude ? parseFloat(venue.location.latitude) : null,
      lng: venue.location?.longitude ? parseFloat(venue.location.longitude) : null,
    } : null,
    priceMin: price?.min ?? null,
    priceMax: price?.max ?? null,
    currency: price?.currency || 'TRY',
    isFree: price ? price.min === 0 : false,
    imageUrl: pickImage(ev.images),
    organizer: ev.promoter?.name || ev._embedded?.attractions?.[0]?.name || null,
    status,
    ticketUrl: withAffiliate(ev.url),
    // enrich CATEGORY_MAP TM segmentlerini tanir; genre'yi ipucu olarak ekle
    rawCategory: [seg, genre].filter(Boolean).join(' '),
    payload: ev,
  }, 'ticketmaster');
}

export default {
  id: 'ticketmaster',
  name: 'Ticketmaster / Biletix',
  kind: 'api',
  async fetchEvents({ since } = {}) {
    const key = process.env.TICKETMASTER_API_KEY;
    if (!key) {
      console.warn('[ticketmaster] TICKETMASTER_API_KEY yok — atlaniyor');
      return [];
    }
    const out = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        apikey: key,
        countryCode: 'TR',
        city: 'Istanbul',
        size: String(PAGE_SIZE),
        page: String(page),
        sort: 'date,asc',
      });
      if (since) params.set('startDateTime', new Date(since).toISOString().replace(/\.\d+Z$/, 'Z'));

      const res = await fetch(`${BASE}?${params}`);
      if (res.status === 429) { console.warn('[ticketmaster] rate limit; durduruluyor'); break; }
      if (!res.ok) throw new Error(`[ticketmaster] HTTP ${res.status}`);
      const json = await res.json();
      const events = json._embedded?.events ?? [];
      for (const ev of events) {
        try { out.push(mapEvent(ev)); }
        catch (e) { console.warn(`[ticketmaster] etkinlik atlandi: ${e.message}`); }
      }
      const totalPages = json.page?.totalPages ?? 1;
      if (page + 1 >= totalPages) break;
    }
    return out;
  },
};
