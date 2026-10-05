import { expect, test } from '@playwright/test';
import { freshGame, gameState } from './helpers';

test('two ready adults of one species can be paired and start a courtship', async ({ page }) => {
  await freshGame(page, { seed: true });
  await page.evaluate(() => {
    const s = window.__fishbowl.store;
    s.setState({ guideOpen: false });
    s.getState().openBreeding('pairs');
  });
  await expect(page.getByRole('heading', { name: /Breeding/ })).toBeVisible();
  await expect(page.getByText(/Goldfish/).first()).toBeVisible();
  await page.getByRole('button', { name: /Pair up/ }).first().click();
  // Pairing mode: pick the partner by id (the canvas tap is covered by the unit tests for gestures).
  const ids: string[] = await page.evaluate(() => {
    const g = window.__fishbowl.store.getState();
    return g.game.fish.filter((f: { speciesId: string }) => f.speciesId === 'goldfish').map((f: { id: string }) => f.id);
  });
  await page.evaluate((partner) => window.__fishbowl.store.getState().pickPartner(partner), ids[1]!);
  await page.getByRole('button', { name: /Start courtship/ }).click();
  await expect.poll(async () => (await gameState(page)).courtships.length).toBe(1);
});
