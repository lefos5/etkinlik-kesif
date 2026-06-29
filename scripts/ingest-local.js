// Yerel ingestion runner. Kullanim:
//   node scripts/ingest-local.js mock
//   node scripts/ingest-local.js meetup
// .env yuklenmesi icin Node 20+ --env-file ya da `vercel env pull`.
import { runSource } from '../lib/pipeline.js';

const sourceId = process.argv[2] || 'mock';

// mock disindaki kaynaklar Supabase ister. mock da DB'ye yazar; SUPABASE_* gerekli.
runSource(sourceId, { since: new Date().toISOString() })
  .then((s) => {
    console.log('Ingest ozeti:', JSON.stringify(s, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error('Ingest hatasi:', e.message);
    process.exit(1);
  });
