// Minimal iCalendar (.ics) ayristirici. Bagimlilik yok. VEVENT bloklarini
// alan haritasina cevirir; tarih cozumlemesi Istanbul baglamina gore yapilir
// (Turkiye 2016'dan beri sabit UTC+3, DST yok).
//
// Kapsanan: satir katlama (line folding), parametreli alanlar (DTSTART;TZID=...),
// Z/UTC, TZID, tarih-sadece (VALUE=DATE), kacis dizileri (\n \, \; \\).
// Kapsanmayan: RRULE (tekrar eden etkinlik genisletme) — v1 disi.

const TR_OFFSET = '+03:00';

/** Katlanmis satirlari ac: bir sonraki satir bosluk/tab ile basliyorsa onceye eklenir. */
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

/** Deger kacis dizilerini coz. */
function unescape(v = '') {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/**
 * iCal tarih degerini ISO 8601'e cevir.
 * params: alan parametreleri ( or. { TZID: 'Europe/Istanbul', VALUE: 'DATE' })
 */
function parseDate(value, params = {}) {
  if (!value) return null;
  // Tarih-sadece: 20260626
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(value)) {
    const d = value.slice(0, 8);
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00${TR_OFFSET}`;
  }
  // 20260626T190000Z (UTC) veya 20260626T190000 (yerel/TZID)
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, da, h, mi, s, z] = m;
  const base = `${y}-${mo}-${da}T${h}:${mi}:${s}`;
  if (z) return `${base}Z`;
  // TZID Istanbul/Turkey ise veya hic tz yoksa (Istanbul baglami) +03:00 varsay.
  return `${base}${TR_OFFSET}`;
}

/** Bir "ANAHTAR;param=val:deger" satirini parcalara ayir. */
function parseLine(line) {
  const ci = line.indexOf(':');
  if (ci === -1) return null;
  const left = line.slice(0, ci);
  const value = line.slice(ci + 1);
  const [name, ...paramParts] = left.split(';');
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * .ics metnini ayristir -> VEVENT nesneleri:
 *   { uid, summary, description, location, url, start, end, categories }
 */
export function parseICS(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value; break;
      case 'SUMMARY': cur.summary = unescape(p.value); break;
      case 'DESCRIPTION': cur.description = unescape(p.value); break;
      case 'LOCATION': cur.location = unescape(p.value); break;
      case 'URL': cur.url = p.value; break;
      case 'CATEGORIES': cur.categories = p.value; break;
      case 'DTSTART': cur.start = parseDate(p.value, p.params); break;
      case 'DTEND': cur.end = parseDate(p.value, p.params); break;
      default: break;
    }
  }
  return events;
}
