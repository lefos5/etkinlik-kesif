// Persist: normalize edilmis etkinligi DB'ye yazar. Dedup'i pg_trgm ile DB
// tarafinda yapar (blocking key once, sonra fuzzy). Mekani upsert eder,
// gerekirse geocode eder ve cache'ler. event_sources ile cok-kaynak baglar.
import { admin } from './supabase.js';
import { geocode, reverseDistrict } from './geocode.js';
import { TITLE_SIM_THRESHOLD } from './dedup.js';
import { dayKey } from './text.js';

/** Mekan upsert (norm_key uzerinden tekil) + lat/lng eksikse geocode. */
async function upsertVenue(db, venue) {
  if (!venue) return null;
  const { data: existing } = await db
    .from('venues').select('id, lat, lng')
    .eq('norm_key', `${venue.name.trim().toLowerCase()}|${(venue.city || '').toLowerCase()}`)
    .maybeSingle();

  if (existing) {
    if (existing.lat == null && (venue.lat != null)) {
      await db.from('venues').update({ lat: venue.lat, lng: venue.lng }).eq('id', existing.id);
    }
    return existing.id;
  }

  let { lat, lng } = venue;
  if (lat == null || lng == null) {
    const g = await geocode(venue);
    if (g) { lat = g.lat; lng = g.lng; }
  }
  // Semt: kaynak verdiyse onu, yoksa koordinattan reverse-geocode et.
  let district = venue.district || null;
  if (!district && lat != null && lng != null) {
    district = await reverseDistrict(lat, lng);
  }
  const { data, error } = await db
    .from('venues')
    .insert({ name: venue.name, address: venue.address, city: venue.city, district, lat, lng })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

/**
 * Dedup eslesmesi bul. Once dedup_key (kesin), sonra ayni gun + ayni mekan +
 * baslik trigram benzerligi (pg_trgm). Eslesen event id'si veya null.
 */
async function findDuplicate(db, event, venueId) {
  // 1) Kesin: ayni dedup_key
  const { data: exact } = await db
    .from('events').select('id').eq('dedup_key', event.dedup_key).limit(1).maybeSingle();
  if (exact) return exact.id;

  // 2) Fuzzy: ayni gun penceresinde, ayni mekan adaylarini cek, baslik
  //    benzerligini JS tarafinda esikle. Mekan + gun ile kume kucuk oldugu icin
  //    ucuz; pg_trgm similarity() filtresi RPC gerektirdiginden bu yol tercih edildi.
  const day = dayKey(event.start_at);
  const dayStart = `${day}T00:00:00Z`;
  const dayEnd = `${day}T23:59:59Z`;
  let q = db
    .from('events').select('id, title')
    .gte('start_at', dayStart).lte('start_at', dayEnd);
  if (venueId) q = q.eq('venue_id', venueId);
  const { data: cands } = await q;
  if (cands?.length) {
    const { trigramSimilarity } = await import('./dedup.js');
    for (const c of cands) {
      if (trigramSimilarity(c.title, event.title) >= TITLE_SIM_THRESHOLD) return c.id;
    }
  }
  return null;
}

/**
 * Bir normalize sonucu ({ event, venue, sourceRef }) DB'ye yazar.
 * Donus: { eventId, deduped: boolean }
 */
export async function persistOne(db, sourceId, { event, venue, sourceRef }, rawEventId = null) {
  const venueId = await upsertVenue(db, venue);
  const ev = { ...event, venue_id: venueId };

  let eventId = await findDuplicate(db, ev, venueId);
  let deduped = true;
  if (!eventId) {
    deduped = false;
    const { data, error } = await db.from('events').insert(ev).select('id').single();
    if (error) throw error;
    eventId = data.id;
  } else {
    // Mevcut etkinligi tazele. Kategori/tag/fiyat deterministik turetildigi icin
    // her ingest'te guncellenir (enrich kurallari gelisince eski kayitlar da duzelir).
    // Gorsel/aciklama yalniz yeni kaynak doluysa yazilir (null ile ezme).
    const patch = {
      category: ev.category,
      tags: ev.tags,
      is_free: ev.is_free,
      price_min: ev.price_min,
      price_max: ev.price_max,
      status: ev.status,            // iptal/erteleme guncellemesi
    };
    if (ev.image_url != null) patch.image_url = ev.image_url;
    if (ev.description != null) patch.description = ev.description;
    await db.from('events').update(patch).eq('id', eventId);
  }

  // Kaynak baglantisi (cok-kaynak). Ayni (event,source,uid) tekrar gelirse upsert.
  await db.from('event_sources').upsert({
    event_id: eventId,
    source_id: sourceId,
    source_uid: sourceRef.source_uid,
    ticket_url: sourceRef.ticket_url,
    raw_event_id: rawEventId,
  }, { onConflict: 'event_id,source_id,source_uid' });

  return { eventId, deduped };
}

export { upsertVenue };
