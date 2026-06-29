// GET /api/districts — yaklasan etkinligi olan semtlerin listesi (dropdown icin).
import { admin } from '../lib/supabase.js';
import { json, withErrors } from '../lib/http.js';

export default withErrors(async (req, res) => {
  const { data, error } = await admin()
    .from('events')
    .select('venue:venues!inner(district)')
    .eq('status', 'scheduled')
    .gte('start_at', new Date().toISOString())
    .not('venues.district', 'is', null)
    .limit(1000);
  if (error) throw error;

  const districts = [...new Set((data ?? []).map((r) => r.venue?.district).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'tr'));
  json(res, 200, { districts });
});
