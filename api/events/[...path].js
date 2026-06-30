// /api/events/:id  ve  /api/events/:id/companions — tek fonksiyonda (Hobby plan 12-fonksiyon limiti).
// detail: etkinlik + kaynak linkleri (+ og-meta cache). companions: eslesme adaylari (v2 M2).
import { admin } from '../../lib/supabase.js';
import { fetchOgMeta } from '../../lib/ogmeta.js';
import { getUser } from '../../lib/auth.js';
import { scoreCandidate, ageBand } from '../../lib/match.js';
import { json, withErrors } from '../../lib/http.js';

const MIN_AGE = 18;

function pathSegs(req) {                       // catch-all: req.query.path (dizi) | URL fallback
  const p = req.query?.path;
  if (Array.isArray(p)) return p;
  if (typeof p === 'string' && p) return [p];
  const parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean);
  const i = parts.indexOf('events');
  return i >= 0 ? parts.slice(i + 1) : [];
}

export default withErrors(async (req, res) => {
  const seg = pathSegs(req);
  const id = seg[0];
  if (!id) { json(res, 404, { error: 'Etkinlik bulunamadi' }); return; }
  if (seg[1] === 'companions') { await companions(req, res, id); return; }
  await detail(req, res, id);
});

// GET /api/events/:id — detay + kaynak/affiliate linkleri (aciklama bossa og-meta cache)
async function detail(req, res, id) {
  const { data: event, error } = await admin()
    .from('events').select('*, venue:venues(*)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!event) { json(res, 404, { error: 'Etkinlik bulunamadi' }); return; }

  const { data: sources } = await admin()
    .from('event_sources').select('source_id, ticket_url').eq('event_id', id);

  const needsDesc = !event.description || event.description.trim().length < 20;
  const link = (sources ?? []).find((s) => s.ticket_url);
  if (!event.og_checked && (needsDesc || !event.image_url) && link) {
    const meta = await fetchOgMeta(link.ticket_url);
    const patch = { og_checked: true };
    if (needsDesc && meta.description && meta.description.length >= 20
        && meta.description.toLowerCase() !== (event.title || '').toLowerCase()) {
      patch.description = meta.description;
    }
    if (!event.image_url && meta.image) patch.image_url = meta.image;
    await admin().from('events').update(patch).eq('id', id);
    Object.assign(event, patch);
  }

  json(res, 200, { event, sources: sources ?? [] });
}

// GET /api/events/:id/companions — eslik arayan adaylar (18+, want_company, skorlu)
async function companions(req, res, eventId) {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }
  const db = admin();
  const now = new Date();

  const { data: me } = await db.from('profiles')
    .select('interests, district, birth_year').eq('id', user.id).maybeSingle();
  const myAge = me?.birth_year ? now.getFullYear() - me.birth_year : null;
  if (myAge == null || myAge < MIN_AGE) {
    json(res, 403, { error: 'Bu özellik 18+ gerektirir. Eşleştirme sekmesinden doğum yılını gir.' });
    return;
  }

  const { data: myAtt } = await db.from('event_attendance')
    .select('want_company').eq('user_id', user.id).eq('event_id', eventId).maybeSingle();
  if (!myAtt || !myAtt.want_company) {
    json(res, 403, { error: 'Önce bu etkinlikte "Eşlik arıyorum"u aç.' });
    return;
  }

  const { data: atts, error } = await db.from('event_attendance')
    .select('user_id, status')
    .eq('event_id', eventId).eq('want_company', true).neq('user_id', user.id);
  if (error) throw error;
  const ids = (atts ?? []).map((a) => a.user_id);
  if (!ids.length) { json(res, 200, { companions: [] }); return; }

  const statusByUser = Object.fromEntries((atts ?? []).map((a) => [a.user_id, a.status]));
  const { data: profs, error: pErr } = await db.from('profiles')
    .select('id, nickname, avatar_url, bio, interests, district, birth_year').in('id', ids);
  if (pErr) throw pErr;

  const { data: conns } = await db.from('connections')
    .select('id, requester_id, addressee_id, status')
    .eq('event_id', eventId)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  const connByOther = {};
  for (const c of conns ?? []) {
    const other = c.requester_id === user.id ? c.addressee_id : c.requester_id;
    connByOther[other] = { id: c.id, status: c.status, direction: c.requester_id === user.id ? 'outgoing' : 'incoming' };
  }

  const companionsList = (profs ?? [])
    .filter((p) => p.birth_year && now.getFullYear() - p.birth_year >= MIN_AGE)
    .filter((p) => connByOther[p.id]?.status !== 'blocked')
    .map((p) => {
      const { score, reasons, shared } = scoreCandidate(me, p, now);
      return {
        id: p.id, nickname: p.nickname, avatar_url: p.avatar_url, bio: p.bio,
        district: p.district, age_band: ageBand(p.birth_year, now),
        status: statusByUser[p.id], shared_interests: shared,
        connection: connByOther[p.id] || null, score, reasons,
      };
    })
    .sort((a, b) => b.score - a.score);

  json(res, 200, { companions: companionsList });
}
