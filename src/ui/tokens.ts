// Design tokens for the DOM UI: the single source for colors, spacing, radii, shadows, type, layers
// and motion. `applyTokens` writes them as CSS custom properties on :root (`--color-brand`, `--space-3`…),
// and every stylesheet reads those variables; no hex literals or ad-hoc z-indexes in component CSS.
// Text/background pairs used by components are listed in TEXT_PAIRS and checked for WCAG AA in tokens.test.ts.

export const color = {
  // Brand: the purple of panel headers, the HUD and the dock.
  brand: '#5a46c4',
  brandLight: '#8a76ec',
  brandInk: '#2a1f6a', // chunky drop edge under cards and buttons
  brandEdge: '#3e2f94', // card and button outlines
  brandSoft: '#ece8ff',

  // Surfaces
  surface: '#fbfdff',
  surfaceAlt: '#eef5fb',
  surfaceSunken: '#e2edf6',
  surfaceLove: '#fff0f5',
  surfaceGold: '#fff6dc',
  scrim: 'rgba(24, 30, 72, 0.38)',
  line: '#cfe0ec',

  // Text
  text: '#26323f',
  textMuted: '#4f5e6e',
  textOnBrand: '#ffffff',
  textLove: '#8f1d4c',
  textGood: '#1d6b3f',
  textWarn: '#7a4d00',

  // Buttons
  primary: '#8ee3c8',
  primaryHover: '#a6ecd6',
  primaryEdge: '#3fae8c',
  primaryText: '#0c4a39',
  secondary: '#ffffff',
  secondaryHover: '#f1f7fc',
  secondaryEdge: '#b9d3e6',
  secondaryText: '#26323f',
  danger: '#ffe1e1',
  dangerHover: '#ffd0d0',
  dangerEdge: '#d9626a',
  dangerText: '#8e1c24',
  love: '#ff8fb6',
  loveHover: '#ffa6c5',
  loveEdge: '#d9487d',
  loveText: '#5c0b2c',
  gold: '#ffd36e',
  goldHover: '#ffdd8a',
  goldEdge: '#d99a1e',
  goldText: '#4f3300',
  disabled: '#e6edf2',
  disabledEdge: '#d2dde6',
  disabledText: '#5d6b79',

  // Meters (always paired with an icon + word, never color alone)
  meterTrack: '#e2edf6',
  meterHunger: '#ffb46b',
  meterHappy: '#ff8fb1',
  meterGrowth: '#7cc8f2',
  meterXp: '#5ab8ff',

  focus: '#1e6fff',
  // Toasts, tips and other floating chips over the water
  float: 'rgba(255, 255, 255, 0.96)',
} as const;

/** 4px spacing scale. */
export const space = { 0: '0px', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px' } as const;

export const radius = { sm: '10px', md: '14px', lg: '20px', xl: '26px', pill: '999px' } as const;

export const shadow = {
  card: `0 5px 0 ${color.brandInk}, 0 14px 28px rgba(10, 20, 60, 0.35)`,
  float: '0 6px 18px rgba(20, 40, 90, 0.22)',
  press: '0 3px 0',
} as const;

export const font = {
  body: "'Nunito Variable', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif",
  display: "'Fredoka', 'Nunito Variable', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

/** Minimums: body 14px, labels 12px (mobile). */
export const fontSize = { label: '12px', small: '13px', body: '14px', md: '16px', lg: '19px', xl: '24px', hero: '34px' } as const;

/** Minimum touch target (px). */
export const TAP_MIN = 44;

/** Stacking layers, low to high. Every z-index in the CSS is one of these. */
export const layer = {
  tank: 0,
  giftBox: 5,
  frame: 10, // tank style bezel (decorative, never takes taps)
  hud: 20,
  dock: 22,
  card: 24, // FishCard / DecorCard / quick actions (non-modal)
  banner: 26, // mode pill, pairing banner, goal chip
  hint: 28, // the iOS install hint
  coachmark: 30,
  toast: 40,
  popover: 45, // anchored popovers (cards, quick actions)
  sheet: 50, // panels, sheets and dialogs
  celebrate: 55, // level-up
  confirm: 60, // confirm dialogs above sheets
  breakMode: 70,
  dev: 80,
  loading: 100,
} as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

/** Motion when the player (or the OS) asks for less: no travel, near-instant fades. */
export const reducedMotion = { fast: 0, base: 1, slow: 1 } as const;

/** Text/background pairs the components use. tokens.test.ts asserts each is ≥ 4.5:1 (WCAG AA body text). */
export const TEXT_PAIRS: [keyof typeof color, keyof typeof color][] = [
  ['text', 'surface'],
  ['text', 'surfaceAlt'],
  ['text', 'surfaceLove'],
  ['text', 'surfaceGold'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceAlt'],
  ['textMuted', 'surfaceLove'],
  ['textMuted', 'surfaceGold'],
  ['textMuted', 'surfaceSunken'],
  ['textOnBrand', 'brand'],
  ['textLove', 'surfaceLove'],
  ['textLove', 'surface'],
  ['textGood', 'surface'],
  ['textGood', 'surfaceLove'],
  ['textWarn', 'surfaceGold'],
  ['textWarn', 'surface'],
  ['brand', 'surface'],
  ['brand', 'brandSoft'],
  ['primaryText', 'primary'],
  ['primaryText', 'primaryHover'],
  ['secondaryText', 'secondary'],
  ['dangerText', 'danger'],
  ['loveText', 'love'],
  ['goldText', 'gold'],
  ['disabledText', 'disabled'],
];

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Every token as a CSS custom property. */
export function tokenCssVars(reduced = false): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(color)) vars[`--color-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(space)) vars[`--space-${k}`] = v;
  for (const [k, v] of Object.entries(radius)) vars[`--radius-${k}`] = v;
  for (const [k, v] of Object.entries(shadow)) vars[`--shadow-${k}`] = v;
  for (const [k, v] of Object.entries(font)) vars[`--font-${k}`] = v;
  for (const [k, v] of Object.entries(fontSize)) vars[`--text-${k}`] = v;
  for (const [k, v] of Object.entries(layer)) vars[`--z-${kebab(k)}`] = String(v);
  const d = reduced ? reducedMotion : motion;
  vars['--motion-fast'] = `${d.fast}ms`;
  vars['--motion-base'] = `${d.base}ms`;
  vars['--motion-slow'] = `${d.slow}ms`;
  vars['--ease'] = motion.ease;
  vars['--ease-bounce'] = reduced ? motion.ease : motion.bounce;
  vars['--tap-min'] = `${TAP_MIN}px`;
  return vars;
}

/** Writes the tokens onto :root. `reduced` swaps in the reduced-motion durations and sets `data-reduced-motion`. */
export function applyTokens(root: HTMLElement, reduced: boolean): void {
  for (const [k, v] of Object.entries(tokenCssVars(reduced))) root.style.setProperty(k, v);
  root.toggleAttribute('data-reduced-motion', reduced);
}

/** WCAG relative luminance of a #rrggbb color. */
export function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
