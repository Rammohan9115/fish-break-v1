import { expect, test } from '@playwright/test';
import { freshGame, gameState, openTools } from './helpers';

test('a Feed button stays one tap away while the dock is tucked in', async ({ page }) => {
  await freshGame(page, { seed: true });
  await page.getByRole('button', { name: 'Hide tools' }).click().catch(() => undefined);
  const feed = page.getByRole('button', { name: 'Feed', exact: true });
  await expect(feed).toBeVisible();
  await feed.click();
  await expect(page.getByText('Tap the water to feed')).toBeVisible();
});

test('selling a fish offers Undo, and Undo brings it back', async ({ page }) => {
  await freshGame(page, { seed: true });
  const before = (await gameState(page)).fish.length;
  const id = await page.evaluate(() => window.__fishbowl.store.getState().game.fish[0].id);
  await page.evaluate((fishId) => window.__fishbowl.store.getState().sellFish(fishId), id);
  expect((await gameState(page)).fish.length).toBe(before - 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await gameState(page)).fish.length).toBe(before);
});

test('arrow keys nudge the selected decor piece in Decorate mode', async ({ page }) => {
  await freshGame(page, { seed: true });
  await openTools(page);
  await page.getByRole('button', { name: /Decorate/ }).first().click();
  const x0 = await page.evaluate(() => {
    const s = window.__fishbowl.store;
    s.getState().selectDecor(s.getState().game.tanks[0].decor[0].id);
    return s.getState().game.tanks[0].decor[0].x;
  });
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await gameState(page)).tanks[0].decor[0].x).toBe(x0 + 10);
  await page.keyboard.press('Shift+ArrowLeft');
  await expect.poll(async () => (await gameState(page)).tanks[0].decor[0].x).toBe(x0 - 30);
});

test('the decor shop folds its extra filters into one button', async ({ page }) => {
  await freshGame(page, { seed: true });
  await page.evaluate(() => window.__fishbowl.store.getState().openPanel('shop', 'decor'));
  await expect(page.getByRole('radiogroup', { name: 'Collection' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Price' })).toHaveCount(0);
  await page.getByRole('button', { name: /More filters/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Price' })).toBeVisible();
});
