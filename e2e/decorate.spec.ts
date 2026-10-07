import { expect, test } from '@playwright/test';
import { freshGame, gameState, openTools } from './helpers';

test('Decorate mode: banner, tray, selecting a piece and flipping it, then Done', async ({ page }) => {
  await freshGame(page, { seed: true });
  await openTools(page);
  await page.getByRole('button', { name: /Decorate/ }).first().click();
  await expect(page.getByText('Decorating')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Decor shelf' })).toBeVisible();
  await page.evaluate(() => {
    const s = window.__fishbowl.store;
    s.getState().selectDecor(s.getState().game.tanks[0].decor[0].id);
  });
  const flip = page.getByRole('button', { name: /Flip/ });
  await expect(flip).toBeVisible();
  await flip.click();
  await expect.poll(async () => (await gameState(page)).tanks[0].decor[0].flipped).toBe(true);
  await page.getByRole('button', { name: 'Done decorating' }).click();
  await expect(page.getByText('Decorating')).toHaveCount(0);
});

test('depth: Back / Mid / Front buttons and ↑/↓ move a piece into the sand', async ({ page }) => {
  await freshGame(page, { seed: true });
  await openTools(page);
  await page.getByRole('button', { name: /Decorate/ }).first().click();
  await page.evaluate(() => {
    const s = window.__fishbowl.store;
    s.getState().selectDecor(s.getState().game.tanks[0].decor[0].id);
  });
  const z = async () => (await gameState(page)).tanks[0].decor[0].z;
  expect(await z()).toBe(0.5);
  await page.getByRole('radio', { name: 'Back' }).click();
  await expect.poll(z).toBe(0.15);
  await page.getByRole('radio', { name: 'Front' }).click();
  await expect.poll(z).toBe(0.85);
  await expect(page.getByRole('radio', { name: 'Front' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowUp'); // farther
  await expect.poll(z).toBe(0.75);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(z).toBe(0.95);
});
