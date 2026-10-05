import { afterEach, describe, expect, it, vi } from 'vitest';

const storage = (keys: string[]) => ({ length: keys.length, key: (i: number) => keys[i] ?? null });
const loc = (hash = '', search = '') => ({ hash, search });

async function load(configured: boolean) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', configured ? 'https://x.supabase.co' : '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', configured ? 'anon' : '');
  return import('./supabase');
}

afterEach(() => vi.unstubAllEnvs());

describe('needsSupabaseAtStart', () => {
  it('is false when cloud saves are not configured, whatever the page holds', async () => {
    const { needsSupabaseAtStart, getSupabase } = await load(false);
    expect(needsSupabaseAtStart(storage(['sb-abc-auth-token']), loc('#access_token=x'))).toBe(false);
    expect(await getSupabase()).toBeNull();
  });

  it('guests never load it', async () => {
    const { needsSupabaseAtStart } = await load(true);
    expect(needsSupabaseAtStart(storage(['fishbowl-save']), loc())).toBe(false);
  });

  it('loads it for a stored session or a login redirect', async () => {
    const { needsSupabaseAtStart } = await load(true);
    expect(needsSupabaseAtStart(storage(['fishbowl-save', 'sb-abc-auth-token']), loc())).toBe(true);
    expect(needsSupabaseAtStart(storage([]), loc('#access_token=x&refresh_token=y'))).toBe(true);
    expect(needsSupabaseAtStart(storage([]), loc('#error_description=expired'))).toBe(true);
    expect(needsSupabaseAtStart(storage([]), loc('', '?code=abc'))).toBe(true);
  });
});
