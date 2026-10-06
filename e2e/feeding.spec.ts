import { expect, test } from '@playwright/test';
import { freshGame, gameState, openTools } from './helpers';

test('Tools → Feed, then tapping the water drops pellets that fish eat', async ({ page }) => {
  await freshGame(page, { seed: true });
  await openTools(page);
  await page.getByRole('button', { name: /Feed/ }).first().click();
  await expect(page.getByText('Tap the water to feed')).toBeVisible();
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
  await page.mouse.click(box.x + box.width / 3, box.y + box.height * 0.3);
  await expect.poll(async () => (await gameState(page)).tanks[0].pellets.length).toBeGreaterThan(0);
  // Leaving the mode with the ✕ puts us back in look mode.
  await page.locator('.dock-pill-mode').click();
  await expect(page.getByText('Tap the water to feed')).toHaveCount(0);
});
