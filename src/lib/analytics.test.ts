import { describe, expect, it } from 'vitest';
import { ANALYTICS_ID_KEY, ANALYTICS_OPTOUT_KEY, createAnalytics, type AnalyticsEnv } from './analytics';
import { MemoryStorage } from '../store/testEnv';

function setup(over: Partial<AnalyticsEnv> = {}) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const storage = new MemoryStorage();
  let n = 0;
  const a = createAnalytics({
    key: 'phc_test',
    host: 'https://eu.i.posthog.com/',
    storage,
    send: (url, body) => sent.push({ url, body: JSON.parse(body) }),
    now: () => 1_700_000_000_000,
    randomId: () => `id-${++n}`,
    doNotTrack: () => false,
    ...over,
  });
  return { a, sent, storage };
}

describe('analytics', () => {
  it('sends an anonymous event to the capture endpoint', () => {
    const { a, sent } = setup();
    a.track('hatch', { shiny: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://eu.i.posthog.com/capture/');
    expect(sent[0]!.body).toMatchObject({
      api_key: 'phc_test',
      event: 'hatch',
      distinct_id: 'id-1',
      properties: { shiny: true, $process_person_profile: false },
    });
  });

  it('keeps one random id per device', () => {
    const { a, sent } = setup();
    a.track('feed');
    a.track('feed');
    expect(new Set(sent.map((s) => s.body.distinct_id)).size).toBe(1);
  });

  it('is off without a key', () => {
    const { a, sent } = setup({ key: '' });
    expect(a.configured).toBe(false);
    a.track('hatch');
    expect(sent).toHaveLength(0);
  });

  it('stops when the player opts out, forgets the id, and resumes when they opt back in', () => {
    const { a, sent, storage } = setup();
    a.track('feed');
    a.setOptOut(true);
    expect(storage.getItem(ANALYTICS_OPTOUT_KEY)).toBe('1');
    expect(storage.getItem(ANALYTICS_ID_KEY)).toBeNull();
    a.track('feed');
    expect(sent).toHaveLength(1);
    a.setOptOut(false);
    a.track('feed');
    expect(sent).toHaveLength(2);
  });

  it('respects Do Not Track', () => {
    const { a, sent } = setup({ doNotTrack: () => true });
    expect(a.active).toBe(false);
    a.track('feed');
    expect(sent).toHaveLength(0);
  });

  it("doesn't collect when the preference can't be read", () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => undefined, removeItem: () => undefined };
    const { a, sent } = setup({ storage });
    a.track('feed');
    expect(sent).toHaveLength(0);
  });
});
