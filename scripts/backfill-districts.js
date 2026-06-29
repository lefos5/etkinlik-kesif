// Mekanlarin semtini (district) duzeltir/doldurur.
// Isler: district NULL olanlar + GECERSIZ olanlar (or. yanlislikla "İstanbul" yazilmis sehir adi).
// Koordinat yoksa once isimden forward-geocode eder, sonra koordinattan reverse ile ilce bulur.
// Bulamazsa gecersiz degeri NULL'a ceker (dropdown'da "İstanbul" gozukmesin).
// Nominatim rate-limit'i (~1/sn) icin bekleme konur. Kullanim:
//   node --env-file=.env scripts/backfill-districts.js
import { admin } from '../lib/supabase.js';
import { geocode, reverseDistrict } from '../lib/geocode.js';
import { ISTANBUL_DISTRICTS } from '../lib/istanbul-districts.js';

const db = admin();
const VALID = new Set(ISTANBUL_DISTRICTS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: all, error } = await db.from('venues').select('id, name, address, city, district, lat, lng');
if (error) throw error;

// NULL ya da gecerli-ilce-olmayan (or. "İstanbul") district'ler yeniden islenir.
const venues = all.filter((v) => !v.district || !VALID.has(v.district));
console.log(`${all.length} mekan, ${venues.length} tanesi duzeltilecek...`);

let done = 0, geocoded = 0, filled = 0, cleared = 0;
for (const v of venues) {
  let { lat, lng } = v;
  if (lat == null || lng == null) {
    const g = await geocode(v);
    await sleep(1100);
    if (g) { lat = g.lat; lng = g.lng; await db.from('venues').update({ lat, lng }).eq('id', v.id); geocoded++; }
  }

  let district = null;
  if (lat != null && lng != null) {
    district = await reverseDistrict(lat, lng);
    await sleep(1100);
  }

  if (district) {
    await db.from('venues').update({ district }).eq('id', v.id);
    filled++;
  } else if (v.district && !VALID.has(v.district)) {
    await db.from('venues').update({ district: null }).eq('id', v.id);   // gecersiz degeri temizle
    cleared++;
  }

  if (++done % 15 === 0) console.log(`  ${done}/${venues.length} (semt:${filled}, temizlenen:${cleared})`);
}

console.log(`Bitti: ${venues.length} mekan -> ${filled} gercek ilce, ${cleared} gecersiz temizlendi (${geocoded} koordinat).`);
process.exit(0);
