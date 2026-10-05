import { expect, test } from '@playwright/test';
import { freshGame, gameState } from './helpers';

test('holding Space on a focused fish pets it and builds bond', async ({ page }) => {
  await freshGame(page, { seed: true });
  const before = (await gameState(page)).fish[0].bondPoints;
  await page.locator('canvas').first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.down(' ');
  await page.waitForTimeout(3600); // a full 3s heart meter
  await page.keyboard.up(' ');
  await expect.poll(async () => (await gameState(page)).fish.reduce((n: number, f: { bondPoints: number }) => n + f.bondPoints, 0)).toBeGreaterThan(before);
});
