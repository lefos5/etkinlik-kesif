// Kucuk metin yardimcilari (normalize + dedup paylasir).

/** Turkce karakterleri sadeleştirip kucuk harfe indirir, noktalama atar. */
export function slugifyTr(s = '') {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i', I: 'i' };
  return String(s)
    .replace(/[çğıöşüİI]/g, (m) => map[m] ?? m)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // aksanlari at
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Baslik karsilastirmasi icin durak kelimeleri atilmis normalize biçim. */
const STOP = new Set(['ve', 'ile', 'the', 'a', 'an', 'feat', 'ft', 'live', 'concert', 'konseri', 'konser']);
export function normTitle(s = '') {
  return slugifyTr(s).split(' ').filter((w) => w && !STOP.has(w)).join(' ');
}

/** ISO tarihten YYYY-MM-DD (gun bazli dedup blok anahtari). */
export function dayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}
