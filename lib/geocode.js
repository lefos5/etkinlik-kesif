// Mekan geocode — yalniz lat/lng eksikse cagrilir. Nominatim (anahtarsiz, nazik
// kullanim: tek istek, User-Agent zorunlu). Sonuc venue satirinda cache'lenir,
// boylece ayni mekan tekrar geocode edilmez.
import { matchDistrict } from './istanbul-districts.js';

const BASE = process.env.GEOCODER_BASE_URL || 'https://nominatim.openstreetmap.org';

export async function geocode({ name, district, city = 'Istanbul' }) {
  const q = [name, district, city, 'Turkiye'].filter(Boolean).join(', ');
  const url = `${BASE}/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);   // Nominatim yavassa kilitlenme
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'nereye/0.1 (ingestion)', accept: 'application/json' },
    });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!arr?.length) return null;
    return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Koordinattan Istanbul ilcesi (reverse geocode). Bulunamazsa null. */
export async function reverseDistrict(lat, lng) {
  if (lat == null || lng == null) return null;
  const url = `${BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'nereye/0.1 (ingestion)', accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const addr = json.address || {};
    for (const v of Object.values(addr)) {
      const d = matchDistrict(v);
      if (d) return d;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
