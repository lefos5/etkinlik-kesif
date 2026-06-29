// Bir kaynagin tum verisini siler: o kaynaga bagli etkinlik baglantilari,
// baska kaynagi kalmayan (oksuz) etkinlikler, ham kayitlar ve sources satiri.
// Baska bir kaynaktan da gelen (deduped) etkinlikler KORUNUR.
//
// Kullanim: node --env-file=.env scripts/purge-source.js mock
import { admin } from '../lib/supabase.js';

const sourceId = process.argv[2];
if (!sourceId) {
  console.error('Kullanim: node --env-file=.env scripts/purge-source.js <sourceId>');
  process.exit(1);
}

const db = admin();

const { data: linkRows, error: e1 } = await db
  .from('event_sources').select('event_id').eq('source_id', sourceId);
if (e1) throw e1;
const ids = [...new Set((linkRows ?? []).map((r) => r.event_id))];

// 1) Bu kaynagin baglantilarini sil
await db.from('event_sources').delete().eq('source_id', sourceId);

// 2) Artik hicbir kaynagi kalmayan etkinlikleri (oksuz) sil
let removed = 0;
for (const id of ids) {
  const { count } = await db.from('event_sources')
    .select('*', { count: 'exact', head: true }).eq('event_id', id);
  if (!count) {
    await db.from('events').delete().eq('id', id);
    removed++;
  }
}

// 3) Ham kayitlar + sources satiri
await db.from('raw_events').delete().eq('source_id', sourceId);
await db.from('sources').delete().eq('id', sourceId);

console.log(`'${sourceId}' temizlendi: ${ids.length} baglanti, ${removed} oksuz etkinlik silindi.`);
process.exit(0);
