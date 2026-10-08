import { expect, test } from '@playwright/test';
import { freshGame, openTools } from './helpers';

// Proof that rescue tasks complete from real UI actions (no store shortcuts): Pinch stage 1 = place a rock + give soft food ×2.
test('Pinch stage 1 completes from the UI: buy a rock, give soft food twice', async ({ page }) => {
  await freshGame(page);
  const pinch = () =>
    page.evaluate(() => {
      const c = (window.__fishbowl.store.getState().game as { rescue: { cases: Record<string, { stage: number; progress: number[] }> } }).rescue.cases.pinch;
      return c ? { stage: c.stage, progress: c.progress } : null;
    });

  await openTools(page);
  await page.getByRole('button', { name: 'Rescue' }).click();
  await page.locator('.rescue-card', { hasText: 'Pinch' }).click();
  await page.getByRole('button', { name: /Take this rescue/ }).click();
  await expect.poll(pinch).toEqual({ stage: 0, progress: [] });

  // Care item twice via the Care tab (My Fish → Pinch → Care).
  await openTools(page);
  await page.getByRole('button', { name: 'My Fish' }).click();
  await page.getByText('Pinch').first().click();
  await page.getByRole('button', { name: /Soft food/ }).click();
  await page.getByRole('button', { name: /Give soft food to Pinch/i }).click();
  await expect.poll(pinch).toMatchObject({ stage: 0, progress: [0, 1] });
  await page.getByRole('button', { name: /Give soft food to Pinch/i }).click();
  await expect.poll(pinch).toMatchObject({ stage: 0, progress: [0, 2] });

  // Hideout: buy a rock in the shop (a state task: it completes the moment the rock is in the tank).
  await page.keyboard.press('Escape');
  await openTools(page);
  await page.getByRole('button', { name: 'Shop' }).click();
  await page.getByRole('tab', { name: /Decor/ }).click();
  const rock = page.locator('li,div,article').filter({ hasText: /Smooth Rock/ }).filter({ has: page.getByRole('button', { name: 'Buy', exact: true }) }).last();
  await rock.getByRole('button', { name: 'Buy', exact: true }).click();

  await expect.poll(pinch).toEqual({ stage: 1, progress: [] });
});
