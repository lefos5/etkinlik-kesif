// Supabase istemcisi. Tum API/ingestion server tarafinda service-role kullanir.
// (v2 auth gelince frontend icin anon istemci ayrica eklenecek.)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
let _admin = null;

/** Yazma + okuma + ingestion icin (service-role). RLS'i bypass eder — yalniz server. */
export function admin() {
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tanimli degil');
  }
  if (!_admin) {
    _admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _admin;
}
