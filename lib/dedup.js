// Dedup: ayni etkinligin farkli kaynaklardan gelen kayitlarini eslestirir.
// Iki asama:
//   1) Blocking: ayni dedup_key (normalize baslik|gun|mekan) -> kesin aday.
//   2) Fuzzy: baslik trigram benzerligi + ayni gun + ayni mekan -> esik ustu eslesme.
// Saf fonksiyonlar (DB yok) — test edilebilir. DB tarafinda pg_trgm ile ayni
// fuzzy mantik SQL'de uygulanir (lib/persist.js findDuplicate).
import { normTitle, dayKey, slugifyTr } from './text.js';

/** Iki string icin trigram Jaccard benzerligi (0..1). pg_trgm similarity ile uyumlu yaklasim. */
export function trigramSimilarity(a, b) {
  const tri = (s) => {
    const p = `  ${s} `;
    const set = new Set();
    for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
    return set;
  };
  const A = tri(normTitle(a));
  const B = tri(normTitle(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const TITLE_SIM_THRESHOLD = 0.45;

/**
 * Iki kanonik/normalize etkinlik ayni gercek etkinlik mi?
 * a, b: { title, start_at, dedup_key, venueName? } sekli yeterli.
 */
export function isDuplicate(a, b, { threshold = TITLE_SIM_THRESHOLD } = {}) {
  if (a.dedup_key && b.dedup_key && a.dedup_key === b.dedup_key) return true;
  const sameDay = dayKey(a.start_at) === dayKey(b.start_at);
  if (!sameDay) return false;
  const sameVenue = slugifyTr(a.venueName || '') === slugifyTr(b.venueName || '');
  if (!sameVenue) return false;
  return trigramSimilarity(a.title, b.title) >= threshold;
}

/**
 * Bir aday etkinligi mevcutlar listesinde eslestir; eslesen index'i veya -1 doner.
 * Tek-gecisli kümeleme icin yeterli (kucuk gunluk batch'ler).
 */
export function findMatchIndex(candidate, existing, opts) {
  for (let i = 0; i < existing.length; i++) {
    if (isDuplicate(candidate, existing[i], opts)) return i;
  }
  return -1;
}
