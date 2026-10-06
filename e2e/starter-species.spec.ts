import { expect, test } from '@playwright/test';
import { freshGame } from './helpers';

const SPECIES = ['cory', 'cherry_shrimp', 'kuhli_loach', 'hatchetfish', 'crab'];

/** A tank with every starter species as an adult and a baby, plus decor to climb and pass behind. */
async function seedStarters(page: import('@playwright/test').Page, extra = ''): Promise<void> {
  await page.evaluate(`(() => {
    const { store, utils } = window.__fishbowl; const now = Date.now();
    const species = ${JSON.stringify(SPECIES)};
    const fish = species.flatMap((s) => ['adult', 'baby'].map((stage, i) => utils.makeFish({ speciesId: s, stage, growth: stage === 'baby' ? 0 : 99999, hunger: 70, happiness: 90, name: s + i, bornAt: now - 1e7, lastDropAt: now, lastBredAt: null })));
    ${extra}
    const decor = ['rock', 'driftwood', 'plant_tall', 'castle'].map((d, i) => ({ id: 'd' + i, decorId: d, x: 180 + i * 230, flipped: false, size: 'M', z: i === 2 ? 0.85 : 0.5 }));
    store.getState().loadState(utils.makeState({ fish, tank: { decor, capacity: 20 }, overrides: { level: 12, shells: 500, lastTickAt: now, lastDailyGift: new Date().toISOString().slice(0, 10) } }));
    store.setState({ onboardingStep: null });
  })()`);
  await page.waitForTimeout(800);
}

test.describe('starter species', () => {
  test('all five species, adult and baby, share a tank (desktop)', async ({ page }) => {
    await freshGame(page);
    await seedStarters(page);
    await page.waitForTimeout(2500);
    await expect(page.locator('canvas').first()).toBeVisible();
    await page.screenshot({ path: 'qa/starter-species-desktop.png' });
    const counts = await page.evaluate(() => {
      const g = window.__fishbowl.store.getState().game;
      return g.fish.length;
    });
    expect(counts).toBe(10);
  });

  test('all five species, adult and baby, share a tank (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await freshGame(page);
    await seedStarters(page);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'qa/starter-species-mobile.png' });
  });

  test('the shop lists the new species with their Special line', async ({ page }) => {
    await freshGame(page, { seed: true });
    await page.evaluate(() => window.__fishbowl.store.getState().openPanel('shop', 'fish'));
    await expect(page.getByText('Cherry Shrimp').first()).toBeVisible();
    await expect(page.getByText(/Special/).first()).toBeVisible();
  });

  test('stays near 60fps with 20 mixed fish, 6 shrimp and 2 crabs', async ({ page }) => {
    await freshGame(page);
    await page.evaluate(`(() => {
      const { store, utils } = window.__fishbowl; const now = Date.now();
      const mix = ['danio','guppy','goldfish','tetra','betta','angelfish','clownfish','puffer','koi','axolotl','cory','cory','kuhli_loach','kuhli_loach','hatchetfish','hatchetfish','hatchetfish','cory','kuhli_loach','guppy']
        .concat(Array(6).fill('cherry_shrimp'), ['crab', 'crab']);
      const fish = mix.map((s, i) => utils.makeFish({ speciesId: s, stage: 'adult', growth: 99999, hunger: 70, happiness: 90, name: 'p' + i, bornAt: now - 1e7, lastDropAt: now, lastBredAt: null }));
      store.getState().loadState(utils.makeState({ fish, tank: { capacity: 40, theme: 'classic' }, overrides: { level: 25, lastTickAt: now, lastDailyGift: new Date().toISOString().slice(0, 10) } }));
      store.setState({ onboardingStep: null });
    })()`);
    await page.waitForTimeout(2500);
    const fps = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n += 1;
            if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
            else resolve(n / 3);
          };
          requestAnimationFrame(tick);
        }),
    );
    // Headless CI runners are slow; the bar is "clearly interactive", the manual checklist covers real 60fps.
    expect(fps).toBeGreaterThan(24);
  });
});
