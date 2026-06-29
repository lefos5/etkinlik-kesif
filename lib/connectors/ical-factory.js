// Generic iCal connector fabrikasi. Herhangi bir kurumun .ics feed'ini
// connector'a cevirir. Yeni kurum eklemek = bir cagri (yeni kod degil).
//
// Kullanim (connectors/index.js icinde):
//   const salt = makeIcalConnector({
//     id: 'salt', name: 'SALT', feedEnv: 'SALT_ICAL_URL',
//     defaultVenue: 'SALT', defaultFree: true, defaultCategory: 'sergi',
//   });
import { parseICS } from '../ical.js';
import { assertRawEvent } from './base.js';

export function makeIcalConnector(opts) {
  const {
    id, name,
    feedEnv,                 // .ics URL'sini tutan env degisken adi
    defaultVenue = name,     // LOCATION bos gelirse kullanilacak mekan
    city = 'Istanbul',
    defaultFree = false,     // bu kurumun etkinlikleri varsayilan ucretsiz mi
    defaultCategory = null,  // CATEGORIES bos gelirse ipucu kategori
  } = opts;

  return {
    id,
    name,
    kind: 'feed',
    async fetchEvents({ since } = {}) {
      let url = process.env[feedEnv];
      if (!url) {
        console.warn(`[${id}] ${feedEnv} yok — atlaniyor`);
        return [];
      }
      // Takvim abonelik linkleri sik sik webcal:// ile gelir; fetch bunu tanimaz.
      if (url.startsWith('webcal://')) url = 'https://' + url.slice('webcal://'.length);
      const res = await fetch(url, { headers: { accept: 'text/calendar, text/plain, */*' } });
      if (!res.ok) throw new Error(`[${id}] HTTP ${res.status}`);
      const text = await res.text();
      const vevents = parseICS(text);

      const cutoff = since ? Date.parse(since) : 0;
      const out = [];
      for (const v of vevents) {
        if (!v.summary || !v.start) continue;
        if (Date.parse(v.start) < cutoff) continue;       // gecmis etkinlikleri atla
        try {
          out.push(assertRawEvent({
            sourceUid: v.uid || `${id}-${v.summary}-${v.start}`,
            title: v.summary,
            description: v.description ?? null,
            startAt: v.start,
            endAt: v.end ?? null,
            venue: { name: v.location || defaultVenue, city },
            priceMin: defaultFree ? 0 : null,
            priceMax: defaultFree ? 0 : null,
            currency: 'TRY',
            isFree: defaultFree,
            imageUrl: null,
            organizer: name,
            ticketUrl: v.url ?? null,
            rawCategory: v.categories || defaultCategory,
            payload: v,
          }, id));
        } catch (e) {
          console.warn(`[${id}] etkinlik atlandi: ${e.message}`);
        }
      }
      return out;
    },
  };
}
