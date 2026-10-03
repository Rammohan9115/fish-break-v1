// Supabase client for auth + cloud saves, used directly from the browser (no custom backend).
// If the env vars are missing, `supabase` is null and the game runs in local-only (guest) mode.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Parses the magic-link tokens from the URL on load and cleans them up.
          detectSessionInUrl: true,
        },
      })
    : null;

export const cloudConfigured = supabase !== null;
