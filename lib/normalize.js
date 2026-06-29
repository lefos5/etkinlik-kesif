// Normalize: RawEvent (connector ciktisi) -> kanonik event nesnesi.
// Saf fonksiyon (DB/ag yok) — bu yuzden test edilebilir. Geocode ve venue_id
// cozumlemesi persist asamasinda yapilir (lib/persist.js).
import { enrich } from './enrich.js';
import { normTitle, dayKey, slugifyTr } from './text.js';

/** Dedup blocking key: normalize baslik | gun | mekan. */
export function buildDedupKey({ title, startAt, venueName }) {
  return [normTitle(title), dayKey(startAt), slugifyTr(venueName || '')].join('|');
}

/**
 * RawEvent -> kanonik nesne (DB events tablosu sekli, venue_id haric).
 * `venue` ayri dondurulur ki persist mekani upsert edip venue_id baglasin.
 */
export async function normalize(raw) {
  const en = await enrich(raw);
  const venueName = raw.venue?.name ?? null;

  const event = {
    title: raw.title.trim(),
    description: raw.description ?? null,
    category: en.category,
    tags: en.tags,
    start_at: new Date(raw.startAt).toISOString(),
    end_at: raw.endAt ? new Date(raw.endAt).toISOString() : null,
    city: raw.venue?.city || 'Istanbul',
    price_min: raw.priceMin ?? (en.isFree ? 0 : null),
    price_max: raw.priceMax ?? (en.isFree ? 0 : null),
    currency: raw.currency || 'TRY',
    is_free: en.isFree,
    image_url: raw.imageUrl ?? null,
    organizer: raw.organizer ?? null,
    status: raw.status || 'scheduled',   // kaynak iptal/erteleme bildirir (yoksa planli)
    dedup_key: buildDedupKey({ title: raw.title, startAt: raw.startAt, venueName }),
  };

  const venue = raw.venue ? {
    name: raw.venue.name,
    address: raw.venue.address ?? null,
    city: raw.venue.city || 'Istanbul',
    district: raw.venue.district ?? null,
    lat: raw.venue.lat ?? null,
    lng: raw.venue.lng ?? null,
  } : null;

  const sourceRef = {
    source_uid: raw.sourceUid,
    ticket_url: raw.ticketUrl ?? null,
  };

  return { event, venue, sourceRef };
}
