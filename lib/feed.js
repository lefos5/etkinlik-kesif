// Feed skorlama — v1 KURAL-TABANLI (AI yok). Saf fonksiyon: bir etkinlik +
// kullanici tercihi -> skor. Sinyaller agirlikli toplanir. Cikti "bu hafta sana
// uygun N etkinlik". Agirliklar tek yerde; davranis verisiyle sonra ayarlanir.

export const WEIGHTS = {
  interest: 4.0,     // ilgi alani kategori eslesmesi
  proximity: 2.0,    // konum yakinligi
  recency: 1.5,      // yaklasan tarih (yakin = iyi)
  popularity: 1.0,   // kaynak/etkilesim sinyali
  free: 0.8,         // ucretsiz tercihi
  weekend: 0.5,      // hafta sonu kucuk bonus
};

const EARTH_KM = 111; // ~1 derece lat ≈ 111 km (kaba)

function haversineKm(a, b) {
  if (a?.lat == null || b?.lat == null) return null;
  const dLat = (b.lat - a.lat) * EARTH_KM;
  const dLng = (b.lng - a.lng) * EARTH_KM * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * scoreEvent(event, prefs, now) -> { score, reasons[] }
 * event: events satiri (+ venue {lat,lng})
 * prefs: { interests[], home_lat, home_lng, free_only, max_distance_km }
 */
export function scoreEvent(event, prefs = {}, now = Date.now()) {
  const reasons = [];
  let score = 0;

  // 1) Ilgi alani eslesmesi (kac kategori ortusuyor)
  const interests = new Set(prefs.interests ?? []);
  const overlap = (event.category ?? []).filter((c) => interests.has(c));
  if (overlap.length) {
    score += WEIGHTS.interest * Math.min(overlap.length, 2);
    reasons.push(`ilgi: ${overlap.join(', ')}`);
  }

  // 2) Konum yakinligi (mesafe arttikca dusen skor)
  if (prefs.home_lat != null && event.venue?.lat != null) {
    const km = haversineKm({ lat: prefs.home_lat, lng: prefs.home_lng }, event.venue);
    const maxKm = prefs.max_distance_km ?? 25;
    if (km != null) {
      const prox = Math.max(0, 1 - km / maxKm);
      score += WEIGHTS.proximity * prox;
      if (prox > 0.5) reasons.push(`yakin (~${km.toFixed(0)} km)`);
    }
  }

  // 3) Recency: 0-14 gun arasi yaklasan etkinlik daha yuksek
  const days = (new Date(event.start_at).getTime() - now) / 86400000;
  if (days >= 0) {
    score += WEIGHTS.recency * Math.max(0, 1 - days / 14);
  }

  // 4) Popularite (log oluk)
  score += WEIGHTS.popularity * Math.log10(1 + (event.popularity ?? 0));

  // 5) Ucretsiz
  if (event.is_free) {
    score += WEIGHTS.free;
    reasons.push('ucretsiz');
  }
  if (prefs.free_only && !event.is_free) return { score: -Infinity, reasons: ['ucretli (filtre)'] };

  // 6) Hafta sonu bonusu
  const dow = new Date(event.start_at).getUTCDay(); // 0=Paz, 6=Cmt
  if (dow === 0 || dow === 6) score += WEIGHTS.weekend;

  return { score, reasons };
}

/** Etkinlik listesini kullaniciya gore sirala; en iyi `limit` taneyi dondur. */
export function rankEvents(events, prefs, { limit = 5, now = Date.now() } = {}) {
  return events
    .map((e) => ({ event: e, ...scoreEvent(e, prefs, now) }))
    .filter((r) => Number.isFinite(r.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
