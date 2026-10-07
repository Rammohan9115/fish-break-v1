// Trailer shot list. Each scene says what the tank looks like (`spec`), and a timeline of cues that script the camera, the pointer
// and game events in *virtual* milliseconds from the scene's first frame. Cue functions are serialized into the page, so they
// must be self-contained (use only their `c` = window.__fishbowl.capture and `L` = layout arguments).
import type { CaptureApi, SceneSpec } from '../../src/dev/capture';

export const GAME_NAME = 'Tankquility'; // index.html <title>; CLAUDE.md still says "Fishbowl Break"
export const GAME_URL = 'https://fishbowl-break.vercel.app';
export const URL_TEXT = 'fishbowl-break.vercel.app';

/** Frames recorded past a scene's end so a crossfade/whip has pictures to blend (edit.sh and plan.ts use the same number). */
export const OVERLAP_FRAMES = 8;

export type Layout = 'wide' | 'tall';
export type CueFn = (c: CaptureApi, L: Layout) => void;
export interface Cue {
  at: number;
  run: CueFn;
}
export interface Sfx {
  at: number;
  name: 'plop' | 'coin' | 'chime' | 'crack' | 'pop' | 'whoosh' | 'sparkle';
  gain?: number;
}
export interface Scene {
  id: string;
  /** Length in the final cut (seconds). */
  dur: number;
  caption?: string;
  captionPos?: 'bottom' | 'top';
  /** Virtual ms to run before frame 0 so fish are already swimming. */
  warmup?: number;
  spec: (L: Layout) => SceneSpec;
  cues: Cue[];
  sfx: Sfx[];
  /** Transition into the NEXT scene. */
  out?: 'fade' | 'whip';
  /** Recorded for stills only (thumbnail); not part of the cut. */
  extra?: boolean;
}

/** The lively day tank used by several scenes. */
const heroFish = [
  { species: 'goldfish', name: 'Bubbles', bond: 20 },
  { species: 'guppy', name: 'Pip' },
  { species: 'guppy', name: 'Dot' },
  { species: 'danio', name: 'Zip' },
  { species: 'danio', name: 'Zap' },
  { species: 'tetra', name: 'Neo' },
  { species: 'tetra', name: 'Nia' },
  { species: 'tetra', name: 'Nox' },
  { species: 'betta', name: 'Ruby' },
  { species: 'angelfish', name: 'Angel' },
  { species: 'jellyfish', name: 'Jelly' },
  { species: 'jellyfish', name: 'Mochi', variant: 'sky' },
  { species: 'crab', name: 'Sidestep' },
  { species: 'cory', name: 'Snuffles' },
  { species: 'kuhli_loach', name: 'Noodle2' },
  { species: 'cherry_shrimp', name: 'Cherry2' },
] as SceneSpec['fish'];
const heroDecor = [
  { id: 'plant_tall', x: 90, z: 0.35 },
  { id: 'tiny_cottage', x: 330, z: 0.5 },
  { id: 'rock', x: 560, z: 0.6 },
  { id: 'plant_small', x: 700, z: 0.45 },
  { id: 'lantern', x: 850, z: 0.5 },
  { id: 'coral_branch', x: 960, z: 0.3 },
] as SceneSpec['decor'];

export const scenes: Scene[] = [
  // 0–2.5 HOOK: petting close-up
  {
    id: 'hook',
    dur: 2.5,
    caption: 'Need a break?',
    warmup: 1200,
    out: 'fade',
    spec: () => ({
      fish: [
        { species: 'goldfish', name: 'Bubbles', bond: 20, x: 500, y: 330 },
        { species: 'guppy', name: 'Pip', x: 250, y: 200 },
        { species: 'danio', name: 'Zip', x: 760, y: 150 },
        { species: 'jellyfish', name: 'Jelly', x: 860, y: 280 },
      ],
      decor: [
        { id: 'plant_tall', x: 160, z: 0.4 },
        { id: 'plant_small', x: 800, z: 0.45 },
      ],
    }),
    cues: [
      {
        at: 0,
        run: (c, L) => {
          c.ui.hud(false);
          c.ui.dock(false);
          if (L === 'tall') c.pan.to(500);
          c.camera.focusFish('Bubbles', 1.6, 1);
          c.pointer.jumpTo({ fish: 'Bubbles' });
          c.pointer.hold({ fish: 'Bubbles' }, 2150, 1, L === 'tall' ? 6 : 70);
        },
      },
      { at: 100, run: (c) => c.camera.to(1.75, c.camera.state.fx, c.camera.state.fy, 2600, 'out') },
    ],
    sfx: [
      { at: 300, name: 'pop', gain: 0.5 },
      { at: 2250, name: 'chime' },
    ],
  },

  // 2.5–5 TANK REVEAL
  {
    id: 'reveal',
    dur: 2.5,
    caption: 'Visit your little fish tank 🐠',
    warmup: 4000,
    out: 'fade',
    spec: () => ({ fish: heroFish, decor: heroDecor, hour: 12 }),
    cues: [
      {
        at: 0,
        run: (c, L) => {
          c.ui.hud(false);
          c.ui.dock(false);
          if (L === 'tall') c.pan.to(300);
          c.camera.set(1.5, 0.45, 0.6);
          c.camera.to(1.0, 0.5, 0.5, 1500, 'out');
        },
      },
      {
        at: 700,
        run: (c, L) => {
          c.ui.hud(true);
          c.ui.dock(true);
          if (L === 'tall') c.pan.to(700, 1800);
        },
      },
      { at: 1500, run: (c) => c.camera.to(1.06, 0.5, 0.55, 1200, 'inOut') },
    ],
    sfx: [{ at: 0, name: 'whoosh', gain: 0.5 }],
  },

  // 5–8 FEEDING
  {
    id: 'feed',
    dur: 3,
    caption: 'Feed them',
    warmup: 2500,
    out: 'fade',
    spec: () => ({
      fish: [
        ...(heroFish ?? []).filter((f) => ['Pip', 'Dot', 'Zip', 'Zap', 'Neo', 'Nia', 'Nox', 'Ruby', 'Jelly', 'Bubbles', 'Angel'].includes(f.name ?? '')).map((f) => ({ ...f, hunger: 38 })),
        { species: 'cory', name: 'Snuffles', hunger: 30, x: 470, y: 548 },
      ],
      decor: heroDecor,
    }),
    cues: [
      { at: 0, run: (c) => { c.events.mode('feed'); c.pointer.jumpTo({ x: 700, y: 60 }); c.camera.set(1.04, 0.5, 0.5); c.camera.to(1.14, 0.5, 0.4, 3300, 'inOut'); } },
      { at: 150, run: (c) => c.pointer.tap({ x: 470, y: 70 }, 350) },
      { at: 900, run: (c) => c.pointer.tap({ x: 330, y: 80 }, 280) },
      { at: 1400, run: (c) => c.pointer.tap({ x: 560, y: 60 }, 280) },
      { at: 1900, run: (c) => c.pointer.tap({ x: 650, y: 90 }, 280) },
      { at: 2300, run: (c) => c.pointer.tap({ x: 420, y: 60 }, 280) },
    ],
    sfx: [
      { at: 500, name: 'plop' },
      { at: 1200, name: 'plop' },
      { at: 1700, name: 'plop' },
      { at: 2200, name: 'plop' },
      { at: 2600, name: 'plop' },
    ],
  },

  // 8–11 COLLECT + LEVEL UP
  {
    id: 'collect',
    dur: 3,
    caption: 'Earn shells & level up',
    warmup: 2600,
    out: 'whip',
    spec: () => ({ fish: heroFish, decor: heroDecor!.filter((d) => d.id !== 'rock'), level: 12, xp: 1180, shells: 840 }),
    cues: [
      { at: -2300, run: (c) => c.events.shellDrop([150, 330, 480, 640, 790], ['back', 'mid', 'front', 'mid', 'back'], 2) },
      { at: 0, run: (c) => { c.pointer.jumpTo({ x: 520, y: 380 }); c.camera.set(1.0, 0.5, 0.6); c.camera.to(1.09, 0.5, 0.78, 3200, 'inOut'); } },
      { at: 200, run: (c) => { for (const n of [0, 1, 2, 3, 4]) { const p = c.dropTarget(n); if (p) c.pointer.tap(p, n === 0 ? 420 : 250); } } },
      { at: 2250, run: (c) => c.events.levelUp(13) },
    ],
    sfx: [
      { at: 650, name: 'coin' },
      { at: 1030, name: 'coin' },
      { at: 1400, name: 'coin' },
      { at: 1770, name: 'coin' },
      { at: 2140, name: 'coin' },
      { at: 2300, name: 'chime' },
    ],
  },

  // 11–14.5 DECORATING
  {
    id: 'decor',
    dur: 3.5,
    caption: 'Decorate your dream tank',
    captionPos: 'top',
    warmup: 2000,
    out: 'fade',
    spec: () => ({
      fish: (heroFish ?? []).filter((f) => !['Neo', 'Nia', 'Nox', 'Dot', 'Zap', 'Cherry2', 'Noodle2'].includes(f.name ?? '')),
      decor: [
        { id: 'plant_tall', x: 90, z: 0.35 },
        { id: 'plant_small', x: 560, z: 0.45 },
        { id: 'tiny_cottage', x: 880, z: 0.5 },
        { id: 'coral_branch', x: 960, z: 0.3 },
        { id: 'lantern', x: 450, z: 0.5 },
      ],
      box: ['bench'],
      hour: 20.5,
      level: 12,
    }),
    cues: [
      { at: 0, run: (c, L) => { c.events.mode('decorate'); if (L === 'tall') c.pan.to(520); c.pointer.jumpTo({ x: 880, y: 470 }); c.camera.set(1.0, 0.5, 0.6); c.camera.to(1.07, 0.5, 0.7, 3800, 'inOut'); } },
      // drag the cottage into the middle
      { at: 250, run: (c) => c.pointer.drag({ x: 880, y: 500 }, { x: 330, y: 520 }, 1000, 350, 450) },
      // box pieces dropped in
      { at: 1750, run: (c) => { c.events.placeFromBox('bench', 640, 0.55); } },
    ],
    sfx: [
      { at: 750, name: 'pop' },
      { at: 1750, name: 'pop' },
      { at: 1950, name: 'sparkle' },
    ],
  },

  // 14.5–18 BREEDING
  {
    id: 'breed',
    dur: 3.5,
    caption: 'Breed new babies',
    captionPos: 'top',
    warmup: 1800,
    out: 'fade',
    spec: () => ({
      fish: [
        { species: 'goldfish', name: 'Gem', x: 430, y: 430 },
        { species: 'goldfish', name: 'Gil', variant: 'orange', x: 570, y: 430 },
        { species: 'guppy', name: 'Pip', x: 200, y: 200 },
        { species: 'danio', name: 'Zip', x: 800, y: 180 },
        { species: 'tetra', name: 'Neo', x: 860, y: 260 },
        { species: 'tetra', name: 'Nia', x: 820, y: 300 },
      ],
      decor: heroDecor!.filter((d) => d.id !== 'rock'),
    }),
    cues: [
      { at: 0, run: (c, L) => { if (L === 'tall') c.pan.to(500); c.camera.set(1.0, 0.5, 0.55); c.camera.to(1.7, 0.5, 0.92, 3800, 'inOut'); c.events.courtship('Gem', 'Gil', 500, 60000); } },
      { at: 1200, run: (c) => c.events.layEggs() },
      { at: 1950, run: (c) => { c.lucky(1500); c.events.hatchEggsNow(); } },
    ],
    sfx: [
      { at: 1250, name: 'chime', gain: 0.6 },
      { at: 2000, name: 'crack' },
      { at: 2250, name: 'sparkle' },
    ],
  },

  // 18–21.5 RESCUE
  {
    id: 'rescue',
    dur: 3.5,
    caption: 'Rescue animals in need 💚',
    captionPos: 'top',
    warmup: 2600,
    out: 'fade',
    spec: () => ({ fish: heroFish!.filter((f) => !['Sidestep', 'Snuffles'].includes(f.name ?? '')), decor: heroDecor, level: 12 }),
    cues: [
      { at: -2000, run: (c) => c.events.rescueTake('pinch') },
      { at: 0, run: (c, L) => { if (L === 'tall') c.pan.to(450); c.camera.set(1.0, 0.5, 0.5); } },
      { at: 900, run: (c) => { c.camera.focusFish('Pinch', 1.55, 1500, 'inOut'); } },
      { at: 1500, run: (c) => c.events.careItem('soft_food') },
      { at: 1900, run: (c) => c.pointer.hold({ fish: 'Pinch', dy: -20 }, 650, 450, 0) },
      { at: 2800, run: (c) => { c.events.rescueStageComplete(); c.events.rescueStageComplete(); c.events.rescueStageComplete(); c.events.rescueStageComplete(); } },
    ],
    sfx: [
      { at: 0, name: 'whoosh', gain: 0.5 },
      { at: 1550, name: 'plop' },
      { at: 2850, name: 'sparkle' },
      { at: 2950, name: 'chime' },
    ],
  },

  // 21.5–24.5 NIGHT MAGIC
  {
    id: 'night',
    dur: 3,
    caption: 'Relax day or night',
    warmup: 2500,
    out: 'fade',
    spec: () => ({
      fish: heroFish!.filter((f) => !['Nox', 'Dot', 'Zap', 'Cherry2'].includes(f.name ?? '')).map((f) => (f.name === 'Bubbles' ? { ...f, bond: 120 } : f)),
      decor: [...heroDecor!, { id: 'bench', x: 200, z: 0.55 }],
      hour: 12,
    }),
    cues: [
      { at: 0, run: (c, L) => { if (L === 'tall') c.pan.toCrowd(); c.hour.to(22.5, 1700, 'inOut'); c.dip(700, () => c.setTheme('night')); c.camera.set(1.0, 0.5, 0.55); c.camera.to(1.1, 0.5, 0.6, 3200, 'inOut'); } },
      { at: 1200, run: (c, L) => { if (L === 'tall') c.pan.toCrowd(1200); } },
      { at: 1500, run: (c) => c.events.playTrick('Bubbles', 'spin') },
      { at: 2050, run: (c) => c.events.playTrick('Pip', 'hoop') },
    ],
    sfx: [{ at: 1400, name: 'sparkle', gain: 0.6 }, { at: 1600, name: 'pop' }, { at: 2150, name: 'pop' }],
  },

  // 24.5–27 WORK BREAK
  {
    id: 'work',
    dur: 2.5,
    caption: 'Keep them while you work',
    captionPos: 'top',
    warmup: 2500,
    out: 'fade',
    spec: () => ({ fish: heroFish!.filter((f) => !['Sidestep', 'Angel', 'Mochi', 'Noodle2', 'Cherry2'].includes(f.name ?? '')), decor: heroDecor, hour: 12 }),
    cues: [{ at: -400, run: (c, L) => { c.workScreen.show(L); } }],
    sfx: [{ at: 100, name: 'whoosh', gain: 0.4 }],
  },

  // 27–30 END CARD
  {
    id: 'end',
    dur: 3,
    warmup: 2500,
    spec: () => ({
      fish: [
        { species: 'goldfish', name: 'Bubbles', x: -40, y: 360 },
        { species: 'guppy', name: 'Pip' },
        { species: 'jellyfish', name: 'Jelly' },
        { species: 'tetra', name: 'Neo' },
        { species: 'tetra', name: 'Nia' },
        { species: 'angelfish', name: 'Angel' },
      ],
      decor: heroDecor,
      hour: 12,
    }),
    cues: [
      { at: 0, run: (c, L) => { if (L === 'tall') c.pan.to(500); c.swimTo('Bubbles', 1100, 330); c.ui.all(false); c.endCard.show({ name: '__NAME__', url: '__URL__', tagline: 'Free · Play in your browser' }); } },
    ],
    sfx: [{ at: 300, name: 'chime', gain: 0.7 }],
  },

  // Thumbnail still (not part of the cut): frame 50 of this scene is trailer/out/thumbnail.png
  {
    id: 'thumb',
    dur: 1,
    extra: true,
    caption: '__NAME__ 🐠',
    warmup: 5000,
    spec: () => ({ fish: heroFish, decor: heroDecor, hour: 12 }),
    cues: [{ at: 0, run: (c) => { c.ui.hud(false); c.ui.dock(false); c.camera.set(1.0, 0.5, 0.5); c.camera.to(1.06, 0.5, 0.6, 1000, 'out'); } }],
    sfx: [],
  },
];
