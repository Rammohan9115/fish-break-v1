import { expect, test } from '@playwright/test';
import { freshGame } from './helpers';

test('a new player is walked through the four tips, and can skip them', async ({ page }) => {
  await freshGame(page);
  await expect(page.getByText('Tip 1 of 4')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Feed/ })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByText('Tip 2 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Skip tips' }).click();
  await expect(page.getByText(/Tip \d of 4/)).toHaveCount(0);
});

test('a returning player does not see the tips again', async ({ page }) => {
  await freshGame(page);
  await page.getByRole('button', { name: 'Skip tips' }).click();
  await page.reload();
  await expect(page.locator('.hud')).toBeVisible();
  await expect(page.getByText(/Tip \d of 4/)).toHaveCount(0);
});
