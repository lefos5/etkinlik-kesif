// GET /api/events/:id/companions — bu etkinlige gidecek/ilgilenen, eslik arayan adaylar.
// v2 M2. Kurallar (docs/v2-plan.md): cagiran 18+ ve bu etkinlikte want_company olmali;
// adaylar da want_company=true + 18+; cinsiyet filtresi yok; skorlama lib/match.js.
// Gizlilik: aday kartinda @nickname/avatar/bio/semt/yas BANDI verilir — gercek ad/e-posta ASLA.
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

  // Cagiran profili — 18+ kapisi
  const { data: me } = await db.from('profiles')
    .select('interests, district, birth_year').eq('id', user.id).maybeSingle();
  const myAge = me?.birth_year ? now.getFullYear() - me.birth_year : null;
  if (myAge == null || myAge < MIN_AGE) {
    json(res, 403, { error: 'Bu özellik 18+ gerektirir. Eşleştirme sekmesinden doğum yılını gir.' });
    return;
  }

  // Cagiran bu etkinlikte eslik aramayi acmis olmali
  const { data: myAtt } = await db.from('event_attendance')
    .select('want_company').eq('user_id', user.id).eq('event_id', eventId).maybeSingle();
  if (!myAtt || !myAtt.want_company) {
    json(res, 403, { error: 'Önce bu etkinlikte "Eşlik arıyorum"u aç.' });
    return;
  }

  // Adaylar: ayni etkinlikte want_company olan DIGER kullanicilar
  const { data: atts, error } = await db.from('event_attendance')
    .select('user_id, status')
    .eq('event_id', eventId).eq('want_company', true).neq('user_id', user.id);
  if (error) throw error;
  const ids = (atts ?? []).map((a) => a.user_id);
  if (!ids.length) { json(res, 200, { companions: [] }); return; }

  const statusByUser = Object.fromEntries((atts ?? []).map((a) => [a.user_id, a.status]));
  const { data: profs, error: pErr } = await db.from('profiles')
    .select('id, nickname, avatar_url, bio, interests, district, birth_year')
    .in('id', ids);
  if (pErr) throw pErr;

  const companions = (profs ?? [])
    .filter((p) => p.birth_year && now.getFullYear() - p.birth_year >= MIN_AGE)   // 18+ filtre
    .map((p) => {
      const { score, reasons, shared } = scoreCandidate(me, p, now);
      return {
        id: p.id,                          // M3'te eslik istegi icin gerekli (uuid, hassas degil)
        nickname: p.nickname,
        avatar_url: p.avatar_url,
        bio: p.bio,
        district: p.district,
        age_band: ageBand(p.birth_year, now),
        status: statusByUser[p.id],        // going | interested
        shared_interests: shared,
        score, reasons,
      };
    })
    .sort((a, b) => b.score - a.score);

  json(res, 200, { companions });
});
