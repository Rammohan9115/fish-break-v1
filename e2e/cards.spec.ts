import { expect, test } from '@playwright/test';
import { freshGame, gameState } from './helpers';

const selectFish = (page: import('@playwright/test').Page, index = 2) =>
  page.evaluate((i) => {
    const s = window.__fishbowl.store;
    s.setState({ selectedFishId: s.getState().game.fish[i].id });
  }, index);

test.describe('FishCard on a desktop (mouse): a popover next to the fish', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('floats next to the fish with an arrow, inside the free area', async ({ page }) => {
    await freshGame(page, { seed: true });
    await selectFish(page);
    const card = page.locator('.ov-popover-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.ov-arrow')).toBeAttached();
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1366);
    expect(box.y + box.height).toBeLessThanOrEqual(768);
    // It stays below the top row of the HUD (the XP bar and tank chip).
    const hudTop = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.app')!).getPropertyValue('--hud-top')));
    expect(box.y).toBeGreaterThanOrEqual(hudTop - 1);
  });

  test('Status / Bond / Breeding tabs, with Pair up pinned in the footer', async ({ page }) => {
    await freshGame(page, { seed: true });
    await selectFish(page);
    await expect(page.getByRole('progressbar', { name: 'Hunger' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pair up/ })).toBeVisible();
    await page.getByRole('tab', { name: /Bond/ }).click();
    await expect(page.getByRole('group', { name: 'Tricks' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pair up/ })).toBeVisible(); // still there
    await page.getByRole('tab', { name: /Breed/ }).click();
    await expect(page.getByRole('region', { name: 'Breeding' })).toBeVisible();
    // The card never scrolls: its body fits.
    const over = await page.evaluate(() => {
      const b = document.querySelector('.ov-popover-card .sheet-body')!;
      return b.scrollHeight - b.clientHeight;
    });
    expect(over).toBeLessThanOrEqual(0);
  });

  test('the ⋯ menu sells the fish after a confirm, and Undo brings it back', async ({ page }) => {
    await freshGame(page, { seed: true });
    const before = (await gameState(page)).fish.length;
    await selectFish(page);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('button', { name: /^Sell for/ }).click();
    await expect(page.locator('.confirm')).toBeVisible();
    await page.getByRole('button', { name: 'Sell', exact: true }).click();
    await expect.poll(async () => (await gameState(page)).fish.length).toBe(before - 1);
    await expect(page.locator('.ov-popover-card')).toHaveCount(0); // its fish is gone, so is the card
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await gameState(page)).fish.length).toBe(before);
  });

  test('Esc closes the card, and a DecorCard is a popover too', async ({ page }) => {
    await freshGame(page, { seed: true });
    await selectFish(page);
    await expect(page.locator('.fishcard')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.fishcard')).toHaveCount(0);
    await page.evaluate(() => {
      const s = window.__fishbowl.store;
      s.getState().selectDecor(s.getState().game.tanks[0].decor[0].id);
    });
    await expect(page.locator('.decorcard.ov-card')).toBeVisible();
    await expect(page.locator('.ov-popover-card')).toBeVisible();
    await expect(page.getByRole('button', { name: /Decorate/ }).last()).toBeVisible();
  });
});

test.describe('FishCard on a tablet (touch, wide): docked, the tank is not shifted', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

  test('docks right like a panel but leaves the tank full width', async ({ page }) => {
    await freshGame(page, { seed: true });
    await selectFish(page);
    const card = page.locator('.ov-sidepanel.ov-card');
    await expect(card).toBeVisible();
    const tank = (await page.locator('.app .tank').boundingBox())!;
    expect(tank.width).toBe(1180); // a card is not a panel: the scene doesn't resize
  });
});

test.describe('FishCard on a phone: a non-modal bottom sheet, the tank stays playable', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('sheet over the lower half, nothing inert', async ({ page }) => {
    await freshGame(page, { seed: true });
    await selectFish(page);
    await expect(page.locator('.ov-sheet.ov-card')).toBeVisible();
    expect(await page.evaluate("document.querySelector('.hud')?.hasAttribute('inert')")).toBe(false);
    const box = (await page.locator('.ov-sheet.ov-card').boundingBox())!;
    expect(box.y).toBeGreaterThan(844 * 0.3); // the upper part of the tank is still visible
  });
});
