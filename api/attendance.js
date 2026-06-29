// Etkinlik katilimi (RSVP) — v2 M1.
// GET    /api/attendance?event_id=  -> bu etkinlikteki kendi durumum { status, want_company } | null
// GET    /api/attendance            -> RSVP verdigim etkinlikler (Gideceklerim) { events:[...] }
// POST   /api/attendance {event_id, status, want_company}  -> ekle/guncelle (upsert)
// DELETE /api/attendance {event_id}                        -> kaldir
// Tum uclar giris ister. Erisim kontrolu burada (RLS yok): her sorgu eq('user_id', user.id).
import { admin } from '../lib/supabase.js';
import { getUser } from '../lib/auth.js';
import { json, withErrors } from '../lib/http.js';

const STATUSES = new Set(['going', 'interested']);
const EVENT_FIELDS = 'id, title, category, tags, start_at, end_at, is_free, price_min, price_max, currency, image_url, organizer, status, popularity';

export default withErrors(async (req, res) => {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }
  const db = admin();

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const eventId = url.searchParams.get('event_id');
    if (eventId) {                                    // tek etkinlik durumu
      const { data, error } = await db.from('event_attendance')
        .select('status, want_company').eq('user_id', user.id).eq('event_id', eventId).maybeSingle();
      if (error) throw error;
      json(res, 200, { attendance: data ?? null });
      return;
    }
    // Liste (Gideceklerim): going + interested, etkinlik bilgileriyle, tarihe gore sirali
    const { data, error } = await db.from('event_attendance')
      .select(`status, want_company, event:events(${EVENT_FIELDS}, venue:venues(id, name, district, lat, lng))`)
      .eq('user_id', user.id);
    if (error) throw error;
    const events = (data ?? [])
      .filter((r) => r.event)
      .map((r) => ({ ...r.event, _rsvp: r.status, _want_company: r.want_company }))
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    json(res, 200, { events });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') body = JSON.parse(body || '{}');
  const eventId = body?.event_id;
  if (!eventId) { json(res, 400, { error: 'event_id gerekli' }); return; }

  if (req.method === 'POST') {
    const status = body.status;
    if (!STATUSES.has(status)) { json(res, 400, { error: 'gecerli status gerekli (going|interested)' }); return; }
    const want_company = body.want_company !== false;        // varsayilan true
    const { error } = await db.from('event_attendance').upsert(
      { user_id: user.id, event_id: eventId, status, want_company },
      { onConflict: 'user_id,event_id' },
    );
    if (error) throw error;
    json(res, 200, { ok: true, attendance: { status, want_company } });
    return;
  }

  if (req.method === 'DELETE') {
    const { error } = await db.from('event_attendance').delete().eq('user_id', user.id).eq('event_id', eventId);
    if (error) throw error;
    json(res, 200, { ok: true, attendance: null });
    return;
  }

  json(res, 405, { error: 'Desteklenmeyen method' });
});
