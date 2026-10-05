import { expect, test } from '@playwright/test';
import { freshGame, gameState, openTools } from './helpers';

test('Decorate mode: banner, tray, selecting a piece and flipping it, then Done', async ({ page }) => {
  await freshGame(page, { seed: true });
  await openTools(page);
  await page.getByRole('button', { name: /Decorate/ }).first().click();
  await expect(page.getByText('Decorating')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Decorate/ })).toBeVisible(); // the tray
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
