// Synthesized sounds via Web Audio (no audio files). Muted by default; nothing is created
// until the player unmutes, so a muted game never touches the AudioContext.
import { AMBIENCE_BED_VOLUME, AMBIENCE_BLIPS_PER_SEC, SOUND_MASTER_VOLUME, SOUND_MIN_GAP_MS } from '../game/constants';

export type SoundName = keyof typeof SOUND_MIN_GAP_MS;

export interface SoundEngineOptions {
  /** Creates the AudioContext (injectable for tests). Return null if unsupported. */
  createContext?: () => AudioContext | null;
  /** Clock for rate limiting (ms). */
  now?: () => number;
  random?: () => number;
}

function defaultContext(): AudioContext | null {
  const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  return Ctor ? new Ctor() : null;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = true;
  private readonly lastPlayed = new Map<SoundName, number>();
  private ambienceWanted = false;
  private ambience: { stop: () => void } | null = null;
  /** iOS needs a sound started inside a gesture once before Web Audio is truly unlocked. */
  private primed = false;
  private readonly createContext: () => AudioContext | null;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(opts: SoundEngineOptions = {}) {
    this.createContext = opts.createContext ?? defaultContext;
    this.now = opts.now ?? (() => performance.now());
    this.random = opts.random ?? Math.random;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Lazily creates the context and master gain (only ever called while unmuted). */
  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = this.createContext();
    if (!ctx) return null;
    const master = ctx.createGain();
    // No compressor: it squashed these short blips by ~10 dB. Effect peaks are tuned to stay
    // below full scale on their own (roughly -3 to -10 dBFS), and repeats are rate-limited.
    master.gain.value = SOUND_MASTER_VOLUME;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopAmbienceNodes();
      void this.ctx?.suspend().catch(() => undefined);
      return;
    }
    this.unlock();
    if (this.ambienceWanted) this.startAmbienceNodes();
  }

  /**
   * Call from user-gesture handlers. Browsers start contexts 'suspended'; Safari can also be
   * 'interrupted' (app switch, call). Anything other than 'running' gets resumed.
   */
  unlock(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    allowPlaybackWhenSilentSwitchIsOn();
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    if (!this.primed) {
      // Classic iOS unlock: start a 1-sample silent buffer inside the gesture.
      this.primed = true;
      try {
        const source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        source.connect(ctx.destination);
        source.start();
      } catch {
        this.primed = false;
      }
    }
  }

  /** The AudioContext state ('none' before creation), for diagnostics. */
  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  /** Plays a one-shot effect. Returns false if muted, rate-limited, or audio is unavailable. */
  play(name: SoundName): boolean {
    if (this.muted) return false;
    const t = this.now();
    const last = this.lastPlayed.get(name);
    if (last !== undefined && t - last < SOUND_MIN_GAP_MS[name]) return false;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return false;
    // Most plays come from click/tap handlers, so this doubles as a late unlock.
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    this.lastPlayed.set(name, t);
    SYNTHS[name](ctx, this.master, this.random);
    return true;
  }

  /** Soft bubble ambience (Break Mode). Plays only while unmuted; remembers the request. */
  setAmbience(on: boolean): void {
    this.ambienceWanted = on;
    if (on && !this.muted) this.startAmbienceNodes();
    else this.stopAmbienceNodes();
  }

  get ambiencePlaying(): boolean {
    return this.ambience !== null;
  }

  private startAmbienceNodes(): void {
    if (this.ambience) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const master = this.master;

    // Quiet low-passed noise bed, like a gentle filter hum.
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = this.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const bed = ctx.createGain();
    bed.gain.value = AMBIENCE_BED_VOLUME;
    noise.connect(filter);
    filter.connect(bed);
    bed.connect(master);
    noise.start();

    // Random soft bubble blips.
    const tickMs = 100;
    const handle = setInterval(() => {
      if (this.random() < (AMBIENCE_BLIPS_PER_SEC * tickMs) / 1000) bubble(ctx, master, this.random, 0.12);
    }, tickMs);

    this.ambience = {
      stop: () => {
        clearInterval(handle);
        try {
          noise.stop();
        } catch {
          // already stopped
        }
        bed.disconnect();
      },
    };
  }

  private stopAmbienceNodes(): void {
    this.ambience?.stop();
    this.ambience = null;
  }
}

/** iOS/iPadOS 16.4+: play Web Audio even when the ring/silent switch is set to silent. */
function allowPlaybackWhenSilentSwitchIsOn(): void {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { audioSession?: { type: string } }) : undefined;
  if (nav?.audioSession && nav.audioSession.type !== 'playback') {
    try {
      nav.audioSession.type = 'playback';
    } catch {
      // Not supported here; fine.
    }
  }
}

// ---------------------------------------------------------------------------
// Synths
// ---------------------------------------------------------------------------

type Synth = (ctx: AudioContext, out: AudioNode, random: () => number) => void;

/** A single enveloped oscillator tone. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  opts: { type: OscillatorType; from: number; to?: number; start?: number; attack?: number; decay: number; peak: number },
): void {
  const t0 = ctx.currentTime + (opts.start ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, t0);
  if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.decay);
  const attack = opts.attack ?? 0.005;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(opts.peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + opts.decay);
  osc.connect(gain);
  gain.connect(out);
  osc.start(t0);
  osc.stop(t0 + attack + opts.decay + 0.05);
}

/** Pellet plop: a quick downward "bloop". */
const plop: Synth = (ctx, out) => {
  tone(ctx, out, { type: 'sine', from: 620, to: 170, decay: 0.14, peak: 0.55 });
  tone(ctx, out, { type: 'sine', from: 1200, to: 500, decay: 0.05, peak: 0.12 });
};

/** Coin pop: two bright, soft triangle notes going up. */
const coin: Synth = (ctx, out) => {
  tone(ctx, out, { type: 'triangle', from: 988, decay: 0.09, peak: 0.6 });
  tone(ctx, out, { type: 'triangle', from: 1319, start: 0.07, decay: 0.22, peak: 0.6 });
};

/** Level-up chime: a gentle C major arpeggio. */
const chime: Synth = (ctx, out) => {
  [1047, 1319, 1568, 2093].forEach((f, i) => {
    tone(ctx, out, { type: 'sine', from: f, start: i * 0.09, attack: 0.01, decay: 0.7, peak: 0.35 });
    tone(ctx, out, { type: 'sine', from: f * 2, start: i * 0.09, attack: 0.01, decay: 0.35, peak: 0.07 });
  });
};

/** Wipe squeak: a short, wobbly high sweep (like a clean glass). */
const squeak: Synth = (ctx, out, random) => {
  const t0 = ctx.currentTime;
  const base = 1700 + random() * 400;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(base, t0);
  osc.frequency.linearRampToValueAtTime(base * 1.45, t0 + 0.05);
  osc.frequency.linearRampToValueAtTime(base * 1.15, t0 + 0.11);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
  osc.connect(gain);
  gain.connect(out);
  osc.start(t0);
  osc.stop(t0 + 0.16);
};

/** One soft bubble blip: a short upward sweep. */
function bubble(ctx: AudioContext, out: AudioNode, random: () => number, peak = 0.45): void {
  const from = 280 + random() * 420;
  tone(ctx, out, { type: 'sine', from, to: from * 2.2, attack: 0.004, decay: 0.07, peak });
}

const SYNTHS: Record<SoundName, Synth> = {
  plop,
  coin,
  chime,
  squeak,
  bubble: (ctx, out, random) => bubble(ctx, out, random),
};

/** App-wide engine. Starts muted (quiet by default). */
export const sound = new SoundEngine();
