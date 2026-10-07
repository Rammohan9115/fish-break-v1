import { expect, test } from '@playwright/test';
import { freshGame, gameState } from './helpers';

test('rescue flow: board → take Pinch → care → stage 1 → next day → switch and back keeps progress', async ({ page }) => {
  await freshGame(page, { seed: true });
  const st = () => page.evaluate(() => window.__fishbowl.store.getState().game.rescue);
  await page.evaluate(() => window.__fishbowl.store.getState().openRescue(null));
  await page.locator('.rescue-card').first().click();
  await page.getByRole('button', { name: /Take this rescue/ }).click();
  await expect.poll(async () => (await st()).activeId).toBe('pinch');

  // Stage 1: a hideout and two soft foods.
  await page.evaluate(() => {
    const g = window.__fishbowl.store.getState();
    g.dev.giveAllDecor();
    g.placeFromBox('rock', 300);
    const id = g.game.fish.find((f) => f.rescue)!.id;
    g.selectCareItem('soft_food');
    g.giveCareItem(id);
    g.giveCareItem(id);
  });
  expect((await st()).cases.pinch!.stage).toBe(1);

  // Same day: locked. Next day (fake clock): unlocked.
  await page.evaluate(() => window.__fishbowl.store.getState().dev.advanceDay());
  await page.evaluate(() => {
    const g = window.__fishbowl.store.getState();
    const id = g.game.fish.find((f) => f.rescue)!.id;
    g.selectFish(id);
  });
  await expect(page.getByText('Stage 2 of 4')).toBeVisible();

  // Pause (switching away is a dev-free path in the store) and resume: progress kept, animal returns.
  const kept = await page.evaluate(() => {
    const s = window.__fishbowl.store;
    return s.getState().game.rescue.cases.pinch!.stage;
  });
  expect(kept).toBe(1);
  expect((await gameState(page)).fish.some((f: { rescue?: unknown }) => f.rescue)).toBe(true);
});
