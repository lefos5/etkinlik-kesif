// Enrichment: ham kategoriyi kanonik kategoriye + tag'lere cevirir, ucretsiz/ucretli
// tahmin eder. v1'de DEFAULT KURAL-TABANLI ve deterministik. LLM opsiyonel ve
// takilip-cikarilabilir: ENRICH_PROVIDER set edilirse enrichWithLLM devreye girer.
import { slugifyTr } from './text.js';

// Kaynaklarin ham kategori etiketleri -> kanonik slug
const CATEGORY_MAP = {
  'live music': 'konser', 'music': 'konser', 'muzik': 'konser', 'konser': 'konser', 'dinleti': 'konser',
  'tiyatro': 'tiyatro', 'theatre': 'tiyatro', 'theater': 'tiyatro', 'arts theatre': 'tiyatro', 'drama': 'tiyatro',
  'performans': 'sahne', 'performance': 'sahne', 'dans': 'sahne', 'stand up': 'sahne', 'comedy': 'sahne', 'bale': 'sahne', 'muzikal': 'sahne',
  'workshop': 'atolye', 'atolye': 'atolye', 'egitim': 'atolye', 'kurs': 'atolye',
  'meetup': 'bulusma', 'bulusma': 'bulusma', 'networking': 'bulusma',
  'sergi': 'sergi', 'exhibition': 'sergi', 'sergi turu': 'sergi',
  'konusma': 'bulusma', 'soylesi': 'bulusma', 'panel': 'bulusma', 'talk': 'bulusma',
  'tartisma': 'bulusma', 'okuma': 'bulusma', 'seminer': 'bulusma',
  'gosterim': 'film', 'screening': 'film',
  'film': 'film', 'sinema': 'film', 'cinema': 'film', 'film gosterimi': 'film',
  'masal': 'aile', 'cocuklar icin': 'aile',
  'atolye egitim': 'atolye', 'imza gunu': 'bulusma', 'okur yazar bulusmasi': 'bulusma',
  'spor': 'spor', 'sports': 'spor',
  'aile': 'aile', 'cocuk': 'aile', 'kids': 'aile', 'family': 'aile',
  'tech': 'teknoloji', 'teknoloji': 'teknoloji', 'yazilim': 'teknoloji',
  'miscellaneous': 'diger',
};

// Metinde gecerse eklenecek tag'ler (anahtar kelime -> tag)
const TAG_KEYWORDS = {
  ucretsiz: ['ucretsiz', 'free', 'bedava'],
  acikhava: ['acik hava', 'open air', 'bahce'],
  baslangic: ['baslangic', 'beginner', 'giris'],
  kayitgerekli: ['kayit gerekli', 'rsvp', 'kayit'],
  caz: ['caz', 'jazz'],
  elektronik: ['elektronik', 'techno', 'house', 'dj'],
};

function ruleEnrich(ev) {
  const rawCat = slugifyTr(ev.rawCategory || '');
  const category = new Set();
  if (CATEGORY_MAP[rawCat]) category.add(CATEGORY_MAP[rawCat]);
  // Kategori icin YALNIZ rawCategory + baslik taranir (kisa ve guvenilir sinyal).
  // Aciklama BILEREK haric: uzun metinde gecen "film", "teknoloji" gibi kelimeler
  // yanlis kategori kirliligine yol aciyordu. Boylece "Music Pop" -> konser tutar
  // ama bir konusmanin aciklamasi 5 kategoriye dagilmaz.
  const catHay = slugifyTr(`${ev.rawCategory ?? ''} ${ev.title}`);
  for (const [needle, slug] of Object.entries(CATEGORY_MAP)) {
    if (catHay.includes(slugifyTr(needle))) category.add(slug);
  }
  if (category.size === 0) category.add('diger');

  // Tag + ucretsiz tespiti aciklamadan da faydalanir ( "bedava", "kayit gerekli").
  const textHay = slugifyTr(`${ev.title} ${ev.description ?? ''}`);
  const tags = new Set();
  for (const [tag, needles] of Object.entries(TAG_KEYWORDS)) {
    if (needles.some((n) => textHay.includes(slugifyTr(n)))) tags.add(tag);
  }

  // ucretsiz tahmini: connector dediyse ona guven, yoksa metin/fiyat ipucu
  let isFree = ev.isFree;
  if (isFree == null) {
    isFree = (ev.priceMin === 0 && ev.priceMax === 0) || tags.has('ucretsiz');
  }
  if (isFree) tags.add('ucretsiz');

  return {
    category: [...category],
    tags: [...tags],
    isFree: Boolean(isFree),
  };
}

/**
 * enrich(rawEvent) -> { category, tags, isFree }
 * Default: kural-tabanli. ENRICH_PROVIDER set ise LLM ile zenginlestirir
 * (kural ciktisini taban alir, uzerine yazabilir).
 */
export async function enrich(ev) {
  const base = ruleEnrich(ev);
  const provider = process.env.ENRICH_PROVIDER;
  if (!provider) return base;
  try {
    return await enrichWithLLM(ev, base, provider);
  } catch (e) {
    console.warn(`[enrich] LLM basarisiz, kural ciktisi kullaniliyor: ${e.message}`);
    return base;
  }
}

// Pluggable LLM adimi. v1'de cagrilmaz (ENRICH_PROVIDER bos). Iskelet birakildi
// ki gurultü cok olursa tek dosyada devreye alinabilsin.
async function enrichWithLLM(ev, base /*, provider */) {
  // Implementasyon kasitli olarak bos: v1 kapsam disinda. Kural ciktisini doner.
  // Gerceklemede: saglayiciya {title, description, rawCategory} gonder,
  // izinli kanonik kategori listesinden secim iste, base ile birlestir.
  return base;
}
