// This file was generated but edited to read credentials from environment
// variables. For security, avoid committing service keys to source control.
// Set the following in your environment or .env (Vite will expose VITE_* to the client):
// VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // Fail-safe: warn developers that env vars are missing. In production, these
  // must be set (Vite exposes VITE_* vars to client builds). Avoid hardcoding
  // secrets in source control.
  // eslint-disable-next-line no-console
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Set them in your environment (.env) before running the app.'
  );
}

export const supabase = createClient<Database>(String(SUPABASE_URL ?? ''), String(SUPABASE_PUBLISHABLE_KEY ?? ''), {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});