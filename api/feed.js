// GET /api/feed — kisisellestirilmis akis ("bu hafta sana uygun N etkinlik")
// Auth varsa profiles.interests yetkili (hesaba kayitli, cihazlar arasi); yoksa query'den
// (?interests=konser,atolye) anonim tercih kabul edilir. Skorlama lib/feed.js (kural-tabanli, AI yok).
import { admin } from '../lib/supabase.js';
import { getUser } from '../lib/auth.js';
import { rankEvents } from '../lib/feed.js';
import { json, withErrors } from '../lib/http.js';

export default withErrors(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams;
  const limit = Math.min(parseInt(p.get('limit') ?? '5', 10), 20);
  const horizonDays = Math.min(parseInt(p.get('days') ?? '14', 10), 60);

  // Tercihleri belirle: once giris yapan kullanici, sonra query fallback
  let prefs = {
    interests: (p.get('interests') || '').split(',').filter(Boolean),
    free_only: p.get('free') === '1',
    home_lat: p.get('lat') ? parseFloat(p.get('lat')) : null,
    home_lng: p.get('lng') ? parseFloat(p.get('lng')) : null,
    max_distance_km: p.get('km') ? parseInt(p.get('km'), 10) : 25,
  };
  const user = await getUser(req);
  if (user) {
    // Giris yapan kullanicida ilgi alanlari hesaptan gelir (tek kaynak); free/konum query'de kalir
    const { data: prof } = await admin()
      .from('profiles').select('interests').eq('id', user.id).maybeSingle();
    prefs.interests = prof?.interests ?? [];
  }

  // Aday havuzu: onumuzdeki `horizonDays` gun, planli etkinlikler
  const now = Date.now();
  const to = new Date(now + horizonDays * 86400000).toISOString();
  const { data: events, error } = await admin()
    .from('events')
    .select('id, title, category, tags, start_at, end_at, is_free, price_min, price_max, currency, image_url, organizer, popularity, venue:venues(id, name, district, lat, lng)')
    .eq('status', 'scheduled')
    .gte('start_at', new Date(now).toISOString())
    .lte('start_at', to)
    .limit(500);
  if (error) throw error;

  const ranked = rankEvents(events ?? [], prefs, { limit, now });
  json(res, 200, {
    personalized: Boolean(user || prefs.interests.length),
    feed: ranked.map((r) => ({ ...r.event, _score: Number(r.score.toFixed(2)), _reasons: r.reasons })),
  });
});
