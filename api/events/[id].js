// GET /api/events/:id — detay + kaynak/affiliate linkleri
// Aciklama bossa: resmi etkinlik sayfasinin og:description'ini cekip (RESMI metin)
// gosterir ve DB'ye cache'ler — bir daha cekmez, feed/gozat da faydalanir.
import { admin } from '../../lib/supabase.js';
import { fetchOgMeta } from '../../lib/ogmeta.js';
import { json, withErrors } from '../../lib/http.js';

export default withErrors(async (req, res) => {
  const id = req.query?.id || new URL(req.url, 'http://localhost').pathname.split('/').pop();

  const { data: event, error } = await admin()
    .from('events')
    .select('*, venue:venues(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!event) { json(res, 404, { error: 'Etkinlik bulunamadi' }); return; }

  // Tum kaynaklar (cok-kaynak bilet linkleri)
  const { data: sources } = await admin()
    .from('event_sources')
    .select('source_id, ticket_url')
    .eq('event_id', id);

  // Aciklama/gorsel eksikse resmi sayfadan doldurmayi dene — ama YALNIZ BIR KEZ.
  // og_checked ile isaretlenir; sonraki acilislar fetch yapmaz (detay aninda acilir).
  const needsDesc = !event.description || event.description.trim().length < 20;
  const link = (sources ?? []).find((s) => s.ticket_url);
  if (!event.og_checked && (needsDesc || !event.image_url) && link) {
    const meta = await fetchOgMeta(link.ticket_url);
    const patch = { og_checked: true };          // denendi: bir daha cekme
    if (needsDesc && meta.description && meta.description.length >= 20
        && meta.description.toLowerCase() !== (event.title || '').toLowerCase()) {
      patch.description = meta.description;
    }
    if (!event.image_url && meta.image) patch.image_url = meta.image;
    await admin().from('events').update(patch).eq('id', id);
    Object.assign(event, patch);
  }

  json(res, 200, { event, sources: sources ?? [] });
});
