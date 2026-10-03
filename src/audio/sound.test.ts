import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUND_MIN_GAP_MS } from '../game/constants';
import { SoundEngine } from './sound';

/** Minimal stand-in for the Web Audio graph, counting what gets created. */
function fakeAudio() {
  const counts = { contexts: 0, oscillators: 0, sources: 0, resumes: 0, suspends: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({ connect: (x: unknown) => x, disconnect() {} });
  const createContext = () => {
    counts.contexts += 1;
    const ctx = {
      currentTime: 0,
      sampleRate: 8000,
      destination: {},
      state: 'suspended' as string,
      resume: async () => {
        counts.resumes += 1;
        ctx.state = 'running';
      },
      suspend: async () => {
        counts.suspends += 1;
        ctx.state = 'suspended';
      },
      createGain: () => ({ ...node(), gain: param() }),
      createOscillator: () => {
        counts.oscillators += 1;
        return { ...node(), type: 'sine', frequency: param(), start() {}, stop() {} };
      },
      createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param() }),
      createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
      createBufferSource: () => {
        counts.sources += 1;
        return { ...node(), buffer: null, loop: false, start() {}, stop() {} };
      },
    };
    created.push(ctx);
    return ctx as unknown as AudioContext;
  };
  const created: { state: string }[] = [];
  return { counts, createContext, created };
}

describe('SoundEngine', () => {
  let clock = 0;
  beforeEach(() => {
    clock = 1000;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const engine = (fake = fakeAudio()) => ({ fake, sfx: new SoundEngine({ createContext: fake.createContext, now: () => clock, random: () => 0.5 }) });

  it('starts muted and never creates an AudioContext while muted', () => {
    const { fake, sfx } = engine();
    expect(sfx.isMuted).toBe(true);
    expect(sfx.play('plop')).toBe(false);
    sfx.setAmbience(true);
    expect(sfx.ambiencePlaying).toBe(false);
    expect(fake.counts.contexts).toBe(0);
  });

  it('plays synthesized effects once unmuted, creating a single context', () => {
    const { fake, sfx } = engine();
    sfx.setMuted(false);
    for (const name of ['plop', 'coin', 'chime', 'squeak', 'bubble'] as const) {
      clock += 1000;
      expect(sfx.play(name)).toBe(true);
    }
    expect(fake.counts.contexts).toBe(1);
    expect(fake.counts.oscillators).toBeGreaterThan(5);
    expect(fake.counts.resumes).toBe(1);
  });

  it('rate-limits repeats of the same effect', () => {
    const { sfx } = engine();
    sfx.setMuted(false);
    expect(sfx.play('squeak')).toBe(true);
    clock += SOUND_MIN_GAP_MS.squeak - 1;
    expect(sfx.play('squeak')).toBe(false);
    clock += 1;
    expect(sfx.play('squeak')).toBe(true);
  });

  it('ambience follows the mute toggle and remembers the request', () => {
    const fake = fakeAudio();
    let i = 0;
    const sfx = new SoundEngine({ createContext: fake.createContext, now: () => clock, random: () => (i++ % 5) / 5 });
    sfx.setAmbience(true); // requested while muted: silent
    expect(sfx.ambiencePlaying).toBe(false);
    sfx.setMuted(false); // unmute → starts
    expect(sfx.ambiencePlaying).toBe(true);
    const before = fake.counts.oscillators;
    vi.advanceTimersByTime(5000);
    expect(fake.counts.oscillators).toBeGreaterThan(before); // bubble blips
    sfx.setMuted(true);
    expect(sfx.ambiencePlaying).toBe(false);
    expect(fake.counts.suspends).toBe(1);
    sfx.setMuted(false);
    expect(sfx.ambiencePlaying).toBe(true);
    sfx.setAmbience(false);
    expect(sfx.ambiencePlaying).toBe(false);
  });

  it('degrades quietly when Web Audio is unavailable', () => {
    const sfx = new SoundEngine({ createContext: () => null, now: () => clock });
    sfx.setMuted(false);
    expect(sfx.play('coin')).toBe(false);
    sfx.setAmbience(true);
    expect(sfx.ambiencePlaying).toBe(false);
  });
});

describe('levels', () => {
  it('master volume is loud enough to hear but leaves headroom', async () => {
    const { SOUND_MASTER_VOLUME } = await import('../game/constants');
    expect(SOUND_MASTER_VOLUME).toBeGreaterThanOrEqual(0.6);
    expect(SOUND_MASTER_VOLUME).toBeLessThanOrEqual(1);
  });
});

describe('unlocking (Safari/iOS quirks)', () => {
  const fresh = () => {
    const fake = fakeAudio();
    return { fake, sfx: new SoundEngine({ createContext: fake.createContext, now: () => 0, random: () => 0.5 }) };
  };

  it('primes iOS with a silent buffer once, inside the first gesture', () => {
    const { fake, sfx } = fresh();
    sfx.setMuted(false); // unmute click → unlock
    expect(fake.counts.sources).toBe(1);
    sfx.unlock();
    sfx.unlock();
    expect(fake.counts.sources).toBe(1);
  });

  it("resumes any non-running state, including Safari's 'interrupted'", async () => {
    const { fake, sfx } = fresh();
    sfx.setMuted(false);
    await Promise.resolve();
    expect(sfx.state).toBe('running');
    fake.created[0]!.state = 'interrupted';
    sfx.unlock();
    await Promise.resolve();
    expect(sfx.state).toBe('running');
  });

  it('a play() from a tap also resumes a suspended context', async () => {
    const { fake, sfx } = fresh();
    sfx.setMuted(false);
    await Promise.resolve();
    fake.created[0]!.state = 'suspended';
    expect(sfx.play('plop')).toBe(true);
    await Promise.resolve();
    expect(sfx.state).toBe('running');
  });

  it('asks iOS to ignore the silent switch when the Audio Session API exists', () => {
    const session = { type: 'auto' };
    vi.stubGlobal('navigator', { audioSession: session });
    const { sfx } = fresh();
    sfx.setMuted(false);
    expect(session.type).toBe('playback');
    vi.unstubAllGlobals();
  });

  it('reports state for diagnostics', () => {
    const { sfx } = fresh();
    expect(sfx.state).toBe('none');
  });
});
