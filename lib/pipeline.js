// Ingest pipeline orchestrator: connector -> raw_events -> normalize -> persist.
// Hem cron endpoint'i hem yerel runner bunu cagirir.
import { admin } from './supabase.js';
import { getConnector } from './connectors/index.js';
import { normalize } from './normalize.js';
import { persistOne } from './persist.js';

/**
 * Tek bir kaynagi calistir. Donus: ozet sayaclar.
 * opts.since: yalniz bu tarihten sonraki etkinlikleri iste (ISO).
 */
export async function runSource(sourceId, opts = {}) {
  const db = admin();
  const connector = getConnector(sourceId);

  // sources kaydini garanti et
  await db.from('sources').upsert(
    { id: connector.id, name: connector.name, kind: connector.kind },
    { onConflict: 'id' },
  );

  const since = opts.since ?? new Date().toISOString(); // gecmis etkinlikleri alma

  // Bu kaynakta zaten bilinen id'ler (connector gereksiz detay cekmesin diye).
  const { data: known } = await db.from('event_sources').select('source_uid').eq('source_id', sourceId);
  const knownUids = new Set((known || []).map((r) => r.source_uid));

  console.log(`[${sourceId}] kaynaktan cekiliyor...`);
  const raws = await connector.fetchEvents({ since, city: 'Istanbul', knownUids });
  console.log(`[${sourceId}] ${raws.length} etkinlik cekildi, isleniyor...`);

  const summary = { source: sourceId, fetched: raws.length, inserted: 0, deduped: 0, errors: 0 };

  let i = 0;
  for (const raw of raws) {
    if (++i % 20 === 0) console.log(`[${sourceId}] ${i}/${raws.length}...`);
    try {
      // 1) Ham kaydi stage'le (denetim + yeniden isleme icin)
      const { data: rawRow } = await db.from('raw_events').upsert(
        { source_id: sourceId, source_uid: raw.sourceUid, payload: raw.payload ?? raw },
        { onConflict: 'source_id,source_uid' },
      ).select('id').single();

      // 2) Normalize + 3) persist (dedup dahil)
      const norm = await normalize(raw);
      const { deduped } = await persistOne(db, sourceId, norm, rawRow?.id ?? null);

      if (deduped) summary.deduped++; else summary.inserted++;
      if (rawRow?.id) await db.from('raw_events').update({ processed_at: new Date().toISOString() }).eq('id', rawRow.id);
    } catch (e) {
      summary.errors++;
      console.error(`[${sourceId}] etkinlik islenemedi (${raw.sourceUid}): ${e.message}`);
    }
  }

  await db.from('sources').update({ last_run_at: new Date().toISOString() }).eq('id', sourceId);
  return summary;
}
