import { expect, test } from '@playwright/test';
import { freshGame, gameState, openTools } from './helpers';

test('the Tools pill slides the tray out, Feed turns it into a mode pill, and Esc/tank-tap/T close it', async ({ page }) => {
  await freshGame(page, { seed: true });
  await expect(page.getByRole('button', { name: 'Show tools' })).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.getByRole('button', { name: 'Hide tools' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Show tools' })).toBeVisible();
  await openTools(page);
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  await expect(page.getByText('Tap the water to feed')).toBeVisible();
  const stop = page.locator('.dock-pill-mode');
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(page.getByRole('button', { name: 'Show tools' })).toBeVisible();
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
