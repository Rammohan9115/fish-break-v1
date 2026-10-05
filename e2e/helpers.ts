import { expect, type Page } from '@playwright/test';

/** Every test starts from a clean browser with the (fake) cloud backend blocked. */
export async function freshGame(page: Page, opts: { seed?: boolean } = {}): Promise<void> {
  await page.route('http://localhost:54321/**', (route) => route.abort());
  // Clear storage once, before the app's first script runs (a clear + reload would let the old page autosave again).
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-cleared')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-cleared', '1');
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => '__fishbowl' in window, null, { timeout: 20_000 });
  await expect(page.locator('.hud')).toBeVisible();
  if (opts.seed) await seedMidGame(page);
}

/** A mid-game tank (level 12, seven adults, a few decor pieces), onboarding finished. */
export async function seedMidGame(page: Page, extra = ''): Promise<void> {
  await page.evaluate(`(() => {
    const { store, utils } = window.__fishbowl; const now = Date.now();
    const fish = ['danio','guppy','goldfish','goldfish','tetra'].map((s, i) => utils.makeFish({ speciesId: s, stage: 'adult', growth: 99999, hunger: 60, happiness: 90, name: 'Fish' + i, bornAt: now - 1e7, lastDropAt: now, lastBredAt: null }));
    const decor = ['plant_tall','castle','rock'].map((d, i) => ({ id: 'd' + i, decorId: d, x: 200 + i * 250, flipped: false, size: 'M', depth: 'back' }));
    store.getState().loadState(utils.makeState({ fish, tank: { decor }, overrides: { level: 12, shells: 2000, pearls: 7, lastTickAt: now, lastDailyGift: new Date().toISOString().slice(0, 10) } }));
    store.setState({ onboardingStep: null });
    ${extra}
  })()`);
  await page.waitForTimeout(300);
}

/** Opens the tool dock if it is tucked away (it starts open during the first tip). */
export async function openTools(page: Page): Promise<void> {
  const show = page.getByRole('button', { name: 'Show tools' });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole('button', { name: 'Hide tools' })).toBeVisible();
}

export const gameState = (page: Page) =>
  page.evaluate(() => window.__fishbowl.store.getState().game) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Dev-only hooks (src/main.tsx). The app's own types aren't imported so the e2e suite stays independent of it.
interface FishbowlStore {
  getState(): Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  setState(s: unknown): void;
}
declare global {
  interface Window {
    __fishbowl: { store: FishbowlStore; utils: Record<string, unknown> };
  }
}
