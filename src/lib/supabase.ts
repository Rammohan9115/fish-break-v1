// Supabase client for auth + cloud saves, used directly from the browser (no custom backend).
// If the env vars are missing, cloud saves are off and the game runs in local-only (guest) mode.
// supabase-js is a separate chunk that guests never download: it's imported on first use (see needsSupabaseAtStart).
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudConfigured = Boolean(url && anonKey);

let client: Promise<SupabaseClient | null> | null = null;

/** The shared client (created on first call), or null when cloud saves aren't configured. */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!cloudConfigured) return Promise.resolve(null);
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Parses the magic-link tokens from the URL on load and cleans them up.
        detectSessionInUrl: true,
      },
    }),
  );
  return client;
}

/**
 * Whether the page must load the client right away: a stored session to restore, or a login redirect
 * (magic link / OAuth) in the URL. Anyone else is a guest and never loads supabase-js until they sign in.
 */
export function needsSupabaseAtStart(
  storage: Pick<Storage, 'length' | 'key'> = window.localStorage,
  loc: Pick<Location, 'hash' | 'search'> = window.location,
): boolean {
  if (!cloudConfigured) return false;
  if (/access_token=|error_description=|refresh_token=/.test(loc.hash) || /[?&]code=/.test(loc.search)) return true;
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch {
    // storage blocked: treat as a guest
  }
  return false;
}
