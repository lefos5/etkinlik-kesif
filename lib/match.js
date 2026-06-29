// Eslestirme uyumlulugu — saf fonksiyon, AI yok (kural-tabanli). v2 M2.
// Cinsiyet filtresi YOK (karar). Sinyaller: ortak ilgi + ayni semt + yas yakinligi.
//
// scoreCandidate(me, them, now?) -> { score: 0..100, reasons: string[], shared: string[] }
//   me/them: { interests: string[], district: string|null, birth_year: number|null }

const W_INTEREST = 50;   // ortak ilgi (Jaccard) agirligi
const W_DISTRICT = 30;   // ayni semt
const W_AGE = 20;        // yas yakinligi
const AGE_SPAN = 15;     // bu yil farkina kadar yas puani azalarak verilir

function ageOf(birthYear, now) {
  return birthYear ? now.getFullYear() - birthYear : null;
}

export function scoreCandidate(me, them, now = new Date()) {
  const reasons = [];
  let score = 0;

  // Ortak ilgi alanlari — Jaccard (kesisim / birlesim)
  const a = new Set(me.interests || []);
  const b = new Set(them.interests || []);
  const shared = [...a].filter((x) => b.has(x));
  const unionSize = new Set([...a, ...b]).size;
  if (unionSize > 0) score += W_INTEREST * (shared.length / unionSize);
  if (shared.length) reasons.push(`${shared.length} ortak ilgi`);

  // Ayni semt
  if (me.district && them.district && me.district === them.district) {
    score += W_DISTRICT;
    reasons.push(`Aynı semt (${them.district})`);
  }

  // Yas yakinligi — fark buyudukce puan dogrusal azalir, AGE_SPAN'da sifirlanir
  const am = ageOf(me.birth_year, now);
  const at = ageOf(them.birth_year, now);
  if (am != null && at != null) {
    const diff = Math.abs(am - at);
    score += W_AGE * Math.max(0, 1 - diff / AGE_SPAN);
    if (diff <= 3) reasons.push('Yaşıt');
    else if (diff <= 7) reasons.push('Yakın yaş');
  }

  return { score: Math.round(score), reasons, shared };
}

/** Gizlilik: kesin dogum yili yerine 5'lik yas bandi (alt sinir 18'e kenetli). */
export function ageBand(birthYear, now = new Date()) {
  if (!birthYear) return null;
  const age = now.getFullYear() - birthYear;
  const lo = Math.max(18, Math.floor(age / 5) * 5);
  return `${lo}-${lo + 4}`;
}
