// GET /api/events — gozat / ara / filtre
// Query: ?category=konser&free=1&from=ISO&to=ISO&q=metin&limit=50&offset=0
//        ?ids=uuid,uuid  -> belirli etkinlikler (Kaydettiklerim icin; tarih/status filtresiz)
import { admin } from '../../lib/supabase.js';
import { json, withErrors } from '../../lib/http.js';

const FIELDS = 'id, title, category, tags, start_at, end_at, is_free, price_min, price_max, currency, image_url, organizer, status, popularity';
const SELECT = `${FIELDS}, venue:venues(id, name, district, lat, lng)`;
// Semt filtresi icin inner join (sadece o semtteki mekanlar)
const SELECT_DISTRICT = `${FIELDS}, venue:venues!inner(id, name, district, lat, lng)`;

export default withErrors(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams;
  const limit = Math.min(parseInt(p.get('limit') ?? '50', 10), 100);
  const offset = parseInt(p.get('offset') ?? '0', 10);

  // id-listesi modu (Kaydettiklerim): tarih/status suzgeci uygulanmaz.
  if (p.get('ids')) {
    const ids = p.get('ids').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
    if (!ids.length) { json(res, 200, { events: [], count: 0 }); return; }
    const { data, error } = await admin()
      .from('events').select(SELECT).in('id', ids).order('start_at', { ascending: true });
    if (error) throw error;
    json(res, 200, { events: data, count: data.length });
    return;
  }

  const district = p.get('district');
  let q = admin()
    .from('events')
    .select(district ? SELECT_DISTRICT : SELECT)
    .eq('status', 'scheduled')
    .gte('start_at', p.get('from') || new Date().toISOString())
    .order('start_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (p.get('to')) q = q.lte('start_at', p.get('to'));
  if (p.get('free') === '1') q = q.eq('is_free', true);
  if (p.get('category')) q = q.contains('category', [p.get('category')]);
  if (p.get('q')) q = q.ilike('title', `%${p.get('q')}%`);
  if (district) q = q.eq('venues.district', district);

  const { data, error } = await q;
  if (error) throw error;
  json(res, 200, { events: data, count: data.length });
});
