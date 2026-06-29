// Goethe-Institut Istanbul connector — RESMI RSS feed'i. Cogunlukla UCRETSIZ
// kultur etkinlikleri (konser, atolye, soylesi, film, sergi).
// Feed: https://www.goethe.de/ins/tr/tr/rss/ist/ver.rss (env ile override edilebilir).
//
// Baslik formati yapisaldir: "Konser : 25.06.2026-25.06.2026, Kaan Bulak Konseri"
//   -> kategori | baslangic[-bitis] tarih | baslik.  pubDate de etkinlik tarihiyle eslesir.
import { parseRSS } from '../rss.js';
import { assertRawEvent } from './base.js';

const DEFAULT_FEED = 'https://www.goethe.de/ins/tr/tr/rss/ist/ver.rss';
const TR = '+03:00';

// "25.06.2026" -> ISO (verilen saatle, yoksa 00:00)
function dmyToIso(dmy, time = '00:00:00') {
  const m = dmy.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${time}${TR}`;
}

// Aciklamadan saat yakala: "saat 19:00", "19.00'da"
function timeFromDesc(desc = '') {
  const m = desc.match(/saat\s*(\d{1,2})[.:](\d{2})/i) || desc.match(/\b(\d{1,2})[.:](\d{2})['’]?\s*(?:da|de)\b/i);
  if (!m) return '00:00:00';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}:00`;
}

/** Bir RSS item'ini RawEvent'e cevirir. (Test edilebilir.) */
export function mapItem(item) {
  const titleRe = /^\s*(.+?)\s*:\s*(\d{2}\.\d{2}\.\d{4})(?:\s*-\s*(\d{2}\.\d{2}\.\d{4}))?\s*,\s*(.+)$/;
  const tm = (item.title || '').match(titleRe);

  let rawCategory = null, title = item.title, startAt = null, endAt = null;
  const time = timeFromDesc(item.description);
  if (tm) {
    rawCategory = tm[1].trim();
    startAt = dmyToIso(tm[2], time);
    endAt = tm[3] ? dmyToIso(tm[3], '23:59:00') : null;
    title = tm[4].trim();
  }
  // Yedek: baslik formati tutmazsa pubDate'i kullan
  if (!startAt && item.pubDate && !Number.isNaN(Date.parse(item.pubDate))) {
    startAt = new Date(item.pubDate).toISOString();
  }
  if (!startAt) return null;

  const online = /online|youtube|canlı yayın|canli yayin/i.test(item.description || '');
  const eventId = (item.link || '').match(/event_id=(\d+)/)?.[1];

  return assertRawEvent({
    sourceUid: eventId || item.link || `${title}-${startAt}`,
    title,
    description: item.description || null,
    startAt,
    endAt,
    venue: { name: online ? 'Online' : 'Goethe-Institut İstanbul', city: 'Istanbul' },
    priceMin: 0, priceMax: 0, currency: 'TRY',
    isFree: true,                         // Goethe etkinlikleri agirlikli ucretsiz
    imageUrl: null,
    organizer: 'Goethe-Institut İstanbul',
    ticketUrl: item.link || null,         // etkinlik/kayit sayfasi
    rawCategory,
    payload: item,
  }, 'goethe');
}

export default {
  id: 'goethe',
  name: 'Goethe-Institut',
  kind: 'feed',
  async fetchEvents({ since } = {}) {
    const url = process.env.GOETHE_RSS_URL || DEFAULT_FEED;
    const res = await fetch(url, { headers: { accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!res.ok) throw new Error(`[goethe] HTTP ${res.status}`);
    const xml = await res.text();
    const cutoff = since ? Date.parse(since) : 0;
    const out = [];
    for (const item of parseRSS(xml)) {
      try {
        const ev = mapItem(item);
        if (ev && Date.parse(ev.startAt) >= cutoff) out.push(ev);
      } catch (e) {
        console.warn(`[goethe] item atlandi: ${e.message}`);
      }
    }
    return out;
  },
};
