import { createClient } from '@supabase/supabase-js';
import { buildConfig } from './config.mjs';
import { log } from './log.mjs';

const config = buildConfig();
const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});
const auth = await supabase.auth.signInWithPassword(config.credentials.restaurant);
if (auth.error || !auth.data.session) throw new Error(`E2E reset auth: ${auth.error?.message || 'session missing'}`);
const result = await supabase.rpc('reset_wayyaam_e2e_state');
if (result.error) throw new Error(`E2E reset: ${result.error.message}`);
log('E2E', `Reset completed: ${JSON.stringify(result.data)}`);
await supabase.auth.signOut({ scope: 'local' });
