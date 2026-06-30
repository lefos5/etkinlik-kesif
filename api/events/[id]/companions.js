// GET /api/events/:id/companions — bu etkinlige gidecek/ilgilenen, eslik arayan adaylar. v2 M2.
// Cagiran 18+ ve bu etkinlikte want_company olmali; adaylar da want_company=true + 18+; cinsiyet
// filtresi yok; skorlama lib/match.js. Gizlilik: kartta @nickname/avatar/bio/semt/yas BANDI — gercek ad ASLA.
import { admin } from '../../../lib/supabase.js';
import { getUser } from '../../../lib/auth.js';
import { json, withErrors } from '../../../lib/http.js';
import { scoreCandidate, ageBand } from '../../../lib/match.js';

const MIN_AGE = 18;

export default withErrors(async (req, res) => {
  const user = await getUser(req);
  if (!user) { json(res, 401, { error: 'Giris gerekli' }); return; }
  const eventId = req.query?.id
    || new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean).at(-2);
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

  const companions = (profs ?? [])
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

  json(res, 200, { companions });
});
