// Privacy-friendly product analytics. Off unless VITE_ANALYTICS_KEY is set (it is not in local dev or tests).
//  - PostHog's capture endpoint (EU cloud by default) over plain fetch: no SDK, no cookies, no autocapture,
//    no IP-based profiles (`$process_person_profile: false`).
//  - The only identifier is a random id kept in localStorage (never the account, email or fish names).
//  - Respects Do Not Track / Global Privacy Control, and the player can opt out in Settings.
//  - Events are the fixed list below, with small non-identifying properties.

export type AnalyticsEvent =
  | 'session_start'
  | 'onboarding_step'
  | 'feed'
  | 'pet_complete'
  | 'bond_level'
  | 'buy_fish'
  | 'buy_decor'
  | 'buy_tank'
  | 'buy_theme'
  | 'buy_style'
  | 'buy_upgrade'
  | 'decorate_open'
  | 'breed_start'
  | 'hatch'
  | 'level_up'
  | 'login'
  | 'cloud_conflict';

export type AnalyticsProps = Record<string, string | number | boolean>;

export const ANALYTICS_OPTOUT_KEY = 'fishbowl-analytics-optout';
export const ANALYTICS_ID_KEY = 'fishbowl-analytics-id';

export interface AnalyticsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AnalyticsEnv {
  /** Project API key; empty means analytics is off. */
  key: string;
  host: string;
  storage: AnalyticsStorage;
  /** Posts one JSON body. Failures are ignored. */
  send: (url: string, body: string) => void;
  now: () => number;
  randomId: () => string;
  /** Do Not Track / Global Privacy Control is on. */
  doNotTrack: () => boolean;
}

export interface Analytics {
  /** True when a key is configured (so the Settings switch is worth showing). */
  readonly configured: boolean;
  /** Analytics is actually collecting (configured, not opted out, no Do Not Track). */
  readonly active: boolean;
  isOptedOut(): boolean;
  setOptOut(optOut: boolean): void;
  track(event: AnalyticsEvent, props?: AnalyticsProps): void;
}

export function createAnalytics(env: AnalyticsEnv): Analytics {
  const optedOut = () => {
    try {
      return env.storage.getItem(ANALYTICS_OPTOUT_KEY) === '1';
    } catch {
      return true; // can't read the preference: don't collect
    }
  };
  const distinctId = (): string => {
    try {
      const existing = env.storage.getItem(ANALYTICS_ID_KEY);
      if (existing) return existing;
      const fresh = env.randomId();
      env.storage.setItem(ANALYTICS_ID_KEY, fresh);
      return fresh;
    } catch {
      return env.randomId();
    }
  };
  const active = () => env.key !== '' && !optedOut() && !env.doNotTrack();

  return {
    get configured() {
      return env.key !== '';
    },
    get active() {
      return active();
    },
    isOptedOut: optedOut,
    setOptOut(optOut) {
      try {
        if (optOut) {
          env.storage.setItem(ANALYTICS_OPTOUT_KEY, '1');
          // Opting out also forgets the random id.
          env.storage.removeItem(ANALYTICS_ID_KEY);
        } else env.storage.removeItem(ANALYTICS_OPTOUT_KEY);
      } catch {
        // ignore
      }
    },
    track(event, props = {}) {
      if (!active()) return;
      env.send(
        `${env.host.replace(/\/$/, '')}/capture/`,
        JSON.stringify({
          api_key: env.key,
          event,
          distinct_id: distinctId(),
          properties: { ...props, $process_person_profile: false, $lib: 'fishbowl' },
          timestamp: new Date(env.now()).toISOString(),
        }),
      );
    },
  };
}

function browserAnalytics(): Analytics {
  return createAnalytics({
    key: (import.meta.env.VITE_ANALYTICS_KEY as string | undefined) ?? '',
    host: (import.meta.env.VITE_ANALYTICS_HOST as string | undefined) ?? 'https://eu.i.posthog.com',
    storage: window.localStorage,
    // text/plain keeps this a "simple" request (no CORS preflight); keepalive lets it finish as the page closes.
    send: (url, body) => {
      void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => undefined);
    },
    now: () => Date.now(),
    randomId: () => crypto.randomUUID(),
    doNotTrack: () => navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true,
  });
}

let instance: Analytics | null = null;
/** The app-wide instance (created on first use, so tests that never touch it never need `window`). */
export function analytics(): Analytics {
  instance ??= browserAnalytics();
  return instance;
}
