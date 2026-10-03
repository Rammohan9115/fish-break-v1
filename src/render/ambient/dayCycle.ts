// Time-of-day light from the player's local clock: warm soft morning, bright midday, golden evening
// with long rays, dim blue night with glowing particles and decor lights on. Values blend smoothly
// between keyframes (a few hours apart), so the tank never visibly snaps. Pure apart from the clock.
import { smoothstep } from './noise';
import { mix } from '../paint';

export interface DayLight {
  /** Multiplied over the scene (white = no change) and its strength. */
  tint: string;
  tintAlpha: number;
  /** A soft additive warm haze (morning / evening) and its strength. */
  glow: string;
  glowAlpha: number;
  /** Light-ray strength, length and how many of the rays show (multipliers). */
  rays: number;
  rayLength: number;
  rayCount: number;
  /** 0..1: particles glow, decor lights (castle windows, lanterns) turn on. */
  particleGlow: number;
  lights: number;
  /** Where the light comes from, −1 (left, morning) .. 1 (right, evening); shadows slide the other way. */
  sunX: number;
}

const NIGHT: DayLight = { tint: '#3f52b0', tintAlpha: 0.58, glow: '#6f8cff', glowAlpha: 0, rays: 0.35, rayLength: 0.8, rayCount: 0.5, particleGlow: 1, lights: 1, sunX: 0 };
const MORNING: DayLight = { tint: '#ffd2a8', tintAlpha: 0.22, glow: '#ffcf9e', glowAlpha: 0.08, rays: 0.9, rayLength: 1, rayCount: 1, particleGlow: 0, lights: 0.1, sunX: -0.7 };
const MIDDAY: DayLight = { tint: '#ffffff', tintAlpha: 0, glow: '#fff6dc', glowAlpha: 0, rays: 1.1, rayLength: 1, rayCount: 1, particleGlow: 0, lights: 0, sunX: 0 };
const EVENING: DayLight = { tint: '#ffa85a', tintAlpha: 0.38, glow: '#ffb35c', glowAlpha: 0.12, rays: 1, rayLength: 1.4, rayCount: 0.85, particleGlow: 0.3, lights: 0.65, sunX: 0.8 };

/** [hour, light] keyframes over a local day (0..24); neighbours blend with an eased curve. */
const KEYS: [number, DayLight][] = [
  [0, NIGHT],
  [5, NIGHT],
  [7.5, MORNING],
  [10.5, MIDDAY],
  [15.5, MIDDAY],
  [18.5, EVENING],
  [21, NIGHT],
  [24, NIGHT],
];

function blend(a: DayLight, b: DayLight, t: number): DayLight {
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    tint: mix(a.tint, b.tint, t),
    tintAlpha: n(a.tintAlpha, b.tintAlpha),
    glow: mix(a.glow, b.glow, t),
    glowAlpha: n(a.glowAlpha, b.glowAlpha),
    rays: n(a.rays, b.rays),
    rayLength: n(a.rayLength, b.rayLength),
    rayCount: n(a.rayCount, b.rayCount),
    particleGlow: n(a.particleGlow, b.particleGlow),
    lights: n(a.lights, b.lights),
    sunX: n(a.sunX, b.sunX),
  };
}

/** The light at a local hour (fractional, wraps around midnight). */
export function dayLight(hour: number): DayLight {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, a] = KEYS[i]!;
    const [h1, b] = KEYS[i + 1]!;
    if (h >= h0 && h <= h1) return blend(a, b, smoothstep((h - h0) / (h1 - h0)));
  }
  return NIGHT;
}

let hourOverride: number | null = null;

/** Dev: scrub the time of day (null = follow the clock). */
export function setHourOverride(hour: number | null): void {
  hourOverride = hour;
}

export function getHourOverride(): number | null {
  return hourOverride;
}

/** The local hour now (or the dev override). */
export function currentHour(date: Date = new Date()): number {
  if (hourOverride !== null) return hourOverride;
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}
