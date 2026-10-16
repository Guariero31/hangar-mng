import { SUPABASE_URL, SUPABASE_ANON_KEY, DEMO_MODE } from '../config.js';

// No modo demonstração, usa um banco simulado no navegador (js/demo-supabase.js)
const { createClient } = DEMO_MODE
  ? await import('./demo-supabase.js')
  : await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
