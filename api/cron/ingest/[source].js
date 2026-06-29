// GET/POST /api/cron/ingest/:source — bir kaynagi calistirir (Vercel Cron tetikler).
// source='all' verilirse tum aktif kaynaklar sirayla calisir (gunluk tek cron).
// CRON_SECRET ile korunur.
import { runSource } from '../../../lib/pipeline.js';
import { isAuthorizedCron } from '../../../lib/auth.js';
import { json, withErrors } from '../../../lib/http.js';

export const config = { maxDuration: 60 };           // kultur detay cekimleri icin pay

const ALL_SOURCES = ['ticketmaster', 'goethe', 'kultur'];

export default withErrors(async (req, res) => {
  if (!isAuthorizedCron(req)) { json(res, 401, { error: 'Yetkisiz' }); return; }

  const source = req.query?.source || new URL(req.url, 'http://localhost').pathname.split('/').pop();
  const since = new Date().toISOString();

  if (source === 'all') {
    const ran = [];
    for (const s of ALL_SOURCES) {
      try { ran.push(await runSource(s, { since })); }
      catch (e) { ran.push({ source: s, error: e.message }); }
    }
    json(res, 200, { ran });
    return;
  }

  const summary = await runSource(source, { since });
  json(res, 200, summary);
});
