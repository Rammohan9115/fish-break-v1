import { expect, test } from '@playwright/test';
import { freshGame, gameState } from './helpers';

const openShop = (page: import('@playwright/test').Page, tab = 'fish') => page.evaluate((t) => window.__fishbowl.store.getState().openPanel('shop', t), tab);

test.describe('density modes', () => {
  for (const [name, w, h, density] of [
    ['small phone', 375, 667, 'compact'],
    ['laptop', 1366, 768, 'regular'],
    ['zoomed-in laptop (150%)', 911, 512, 'compact'],
    ['big desktop', 1920, 1080, 'spacious'],
  ] as const) {
    test(`${name}: ${density}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await freshGame(page, { seed: true });
      await expect(page.locator('.app')).toHaveAttribute('data-density', density);
      const bodyPx = await page.evaluate("parseFloat(getComputedStyle(document.querySelector('.app')).getPropertyValue('--text-body'))");
      expect(bodyPx as number).toBeGreaterThanOrEqual(14);
      expect(bodyPx as number).toBeLessThanOrEqual(18);
    });
  }

  test('on a big desktop the HUD and dock grow so they are not tiny', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 });
    await freshGame(page, { seed: true });
    const zoom = await page.evaluate("parseFloat(getComputedStyle(document.querySelector('.app')).getPropertyValue('--ui-zoom'))");
    expect(zoom as number).toBeGreaterThan(1.2);
    const tank = (await page.locator('.hud-tank').boundingBox())!;
    expect(tank.x + tank.width).toBeLessThanOrEqual(2560); // still inside the screen after scaling
  });
});

test.describe('shop', () => {
  test('items are an auto-fill grid, and Details opens a dialog with the facts and a Buy button', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await freshGame(page, { seed: true });
    await openShop(page);
    const cols = await page.evaluate("getComputedStyle(document.querySelector('.shop-grid')).gridTemplateColumns.split(' ').length");
    expect(cols as number).toBeGreaterThanOrEqual(2);
    const before = (await gameState(page)).fish.length;
    await page.getByRole('button', { name: 'Details' }).first().click();
    const dialog = page.locator('.shop-details');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Grows up in')).toBeVisible();
    await dialog.getByRole('button', { name: /Buy/ }).click();
    await expect.poll(async () => (await gameState(page)).fish.length).toBe(before + 1);
    await expect(dialog).toHaveCount(0);
  });

  test('a phone shows two columns', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await freshGame(page, { seed: true });
    await openShop(page);
    const cols = await page.evaluate("getComputedStyle(document.querySelector('.shop-grid')).gridTemplateColumns.split(' ').length");
    expect(cols).toBe(2);
  });
});

test.describe('toasts', () => {
  test('bottom-left on a desktop, in the margin under the window', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await freshGame(page, { seed: true });
    await openShop(page);
    await page.evaluate("window.__fishbowl.store.getState().addToast('Hello there')");
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    const box = (await toast.boundingBox())!;
    expect(box.x).toBeLessThan(40);
    expect(box.y + box.height).toBeGreaterThan(768 - 60);
    // It sits in the margin below the big window, not on top of it.
    const win = (await page.locator('.ov-window').boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(win.y + win.height - 8);
  });

  test('on a phone with a sheet open, the toast is visible at the top (not hidden behind the sheet)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await freshGame(page, { seed: true });
    await openShop(page);
    await page.evaluate("window.__fishbowl.store.getState().addToast('Bought!')");
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    const box = (await toast.boundingBox())!;
    expect(box.y).toBeLessThan(60);
    // Nothing is covering it: the element at its centre is the toast.
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.toast') !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(hit).toBe(true);
  });
});

test('icon-only buttons have a tooltip (their label)', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await freshGame(page, { seed: true });
  await page.evaluate("window.__fishbowl.store.getState().openPanel('settings')");
  await expect(page.locator('.settings .btn-close')).toHaveAttribute('title', 'Close');
});
