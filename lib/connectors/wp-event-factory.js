// Generic WordPress "WP Event Manager" (event_listing CPT) connector fabrikasi.
// Ayni yapidaki (WordPress + WP Event Manager + acik WP REST) herhangi bir
// belediye/kultur sitesi tek cagri ile connector'a cevrilir.
//
// Veri modeli (kultur.istanbul'da dogrulandi):
//   - /wp-json/wp/v2/event_listing -> baslik, link, gorsel, taksonomiler
//   - venueTaxonomy terimi = MEKAN ; typeTaxonomy terimi = TUR + DURUM
//   - Etkinlik TARIHI REST'te yok; tek sayfada "DD-MM-YYYY HH:MM" -> oradan parse
//   - knownUids cache: yalniz YENI etkinligin detay sayfasi cekilir
//
// Kullanim:
//   makeWpEventConnector({ id:'kultur', name:'Kültür İstanbul', baseUrl:'https://kultur.istanbul' })
import { assertRawEvent } from './base.js';

const TR = '+03:00';
const STATUS_TYPES = ['İptal', 'Ertelendi', 'Satışta'];

const DATE_RE = /(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/g;
// Tek sayfa HTML'inden tarih(ler)i cikar: "26-06-2026 20:00" (saat opsiyonel).
export function parseDates(html) {
  const out = [];
  let m;
  DATE_RE.lastIndex = 0;
  while ((m = DATE_RE.exec(html)) && out.length < 2) {
    const [, dd, mm, yyyy, hh, mi] = m;
    out.push(`${yyyy}-${mm}-${dd}T${String(hh ?? '00').padStart(2, '0')}:${mi ?? '00'}:00${TR}`);
  }
  return out;
}

function decodeTitle(s = '') {
  return s.replace(/&#8217;|&#039;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

export function makeWpEventConnector(opts) {
  const {
    id, name,
    baseUrl,
    venueTaxonomy = 'event_listing_category',
    typeTaxonomy = 'event_listing_type',
    defaultFree = true,
    organizer = name,
    maxPages = 3,
  } = opts;
  const API = `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2`;

  async function getJson(url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function termMap(taxonomy) {
    const map = new Map();
    for (let page = 1; page <= 3; page++) {
      let arr;
      try { arr = await getJson(`${API}/${taxonomy}?per_page=100&page=${page}&_fields=id,name`); }
      catch { break; }
      if (!Array.isArray(arr) || !arr.length) break;
      arr.forEach((t) => map.set(t.id, t.name));
      if (arr.length < 100) break;
    }
    return map;
  }

  return {
    id,
    name,
    kind: 'feed',
    async fetchEvents({ since, knownUids } = {}) {
      const [venues, types] = await Promise.all([termMap(venueTaxonomy), termMap(typeTaxonomy)]);
      const known = knownUids || new Set();
      const cutoff = since ? Date.parse(since) : 0;

      const items = [];
      for (let page = 1; page <= maxPages; page++) {
        let arr;
        try { arr = await getJson(`${API}/event_listing?per_page=100&page=${page}&_embed=wp:featuredmedia`); }
        catch { break; }
        if (!Array.isArray(arr) || !arr.length) break;
        items.push(...arr);
        if (arr.length < 100) break;
      }

      const toFetch = items.filter((it) => !known.has(String(it.id)));
      const stats = { rest: items.length, attempted: toFetch.length, httpFail: 0, noDate: 0, past: 0 };
      if (toFetch.length) console.log(`[${id}] REST ${items.length} etkinlik, ${toFetch.length} yeni -> detay cekiliyor...`);
      const out = [];
      const BATCH = 4;
      for (let i = 0; i < toFetch.length; i += BATCH) {
        if (i && i % 40 === 0) console.log(`[${id}] detay ${i}/${toFetch.length}...`);
        const results = await Promise.all(toFetch.slice(i, i + BATCH).map(async (it) => {
          try {
            const res = await fetch(it.link, {
              headers: { 'User-Agent': 'Mozilla/5.0 nereye/0.1', 'Accept-Language': 'tr-TR' },
            });
            if (!res.ok) { stats.httpFail++; return null; }
            const dates = parseDates(await res.text());
            if (!dates.length) { stats.noDate++; return null; }
            if (Date.parse(dates[0]) < cutoff) { stats.past++; return null; }

            const venueName = (it[venueTaxonomy] || []).map((tid) => venues.get(tid)).filter(Boolean)[0] || null;
            const typeNames = (it[typeTaxonomy] || []).map((tid) => types.get(tid)).filter(Boolean);
            const lower = typeNames.map((t) => t.toLocaleLowerCase('tr'));
            const status = lower.includes('iptal') ? 'cancelled'
              : lower.includes('ertelendi') ? 'postponed' : 'scheduled';
            const isFree = defaultFree && !lower.includes('satışta');
            const genres = typeNames.filter((t) => !STATUS_TYPES.includes(t));
            const img = it._embedded?.['wp:featuredmedia']?.[0]?.source_url || null;

            return assertRawEvent({
              sourceUid: String(it.id),
              title: decodeTitle(it.title?.rendered || ''),
              description: null,
              startAt: dates[0],
              endAt: dates[1] || null,
              venue: venueName ? { name: venueName, city: 'Istanbul' } : null,
              priceMin: isFree ? 0 : null,
              priceMax: isFree ? 0 : null,
              currency: 'TRY',
              isFree,
              imageUrl: img,
              organizer,
              ticketUrl: it.link,
              rawCategory: genres.join(' '),
              status,
              payload: { id: it.id, types: typeNames, venue: venueName },
            }, id);
          } catch { stats.httpFail++; return null; }
        }));
        out.push(...results.filter(Boolean));
        await new Promise((r) => setTimeout(r, 150));
      }
      if (stats.attempted) {
        console.log(`[${id}] kirilim -> uretilen:${out.length} | gecmis:${stats.past} tarihsiz:${stats.noDate} http-hata:${stats.httpFail} (REST toplam:${stats.rest})`);
      }
      return out;
    },
  };
}
