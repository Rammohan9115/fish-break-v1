/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
// The overlay matrix: every overlay in e2e/overlays/registry.js is opened on every screen in viewports.js (phones, tablets,
// desktops, and 125/150/200 % browser zoom) and judged by e2e/overlays/judge.js. Overlays listed in enforced.js must
// pass; the rest are reported by `node scripts/audit/overlays.mjs` until they are migrated. EVERY NEW OVERLAY must be added
// to registry.js (and to enforced.js once it passes).
import { expect, test, type Page } from '@playwright/test';

const { OVERLAYS, SEED, RESET, settle } = require('./overlays/registry.js');
const { VIEWPORTS } = require('./overlays/viewports.js');
const { measureOverlay } = require('./overlays/measure.js');
const { judge } = require('./overlays/judge.js');
const { ENFORCED } = require('./overlays/enforced.js');

async function start(browserPage: Page, vp: { w: number; h: number }) {
  await browserPage.setViewportSize({ width: vp.w, height: vp.h });
  await browserPage.route('http://localhost:54321/**', (route) => route.abort());
  await browserPage.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-cleared')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-cleared', '1');
    }
  });
  await browserPage.goto('/');
  await browserPage.waitForFunction(() => '__fishbowl' in window, null, { timeout: 30_000 });
  await browserPage.waitForSelector('.hud');
  await browserPage.evaluate(SEED);
}

for (const vp of VIEWPORTS) {
  test.describe(`overlays @ ${vp.id}`, () => {
    test.use({ deviceScaleFactor: vp.zoom ?? 1, hasTouch: !!vp.touch });

    test('every enforced overlay fits and is usable', async ({ page }) => {
      test.setTimeout(180_000);
      await start(page, vp);
      const failures: string[] = [];
      for (const o of OVERLAYS.filter((x: any) => ENFORCED.includes(x.id))) {
        await page.evaluate(RESET);
        await o.open(page);
        await page.waitForTimeout(300);
        await settle(page);
        const m = await page.evaluate(measureOverlay, { selector: o.selector ?? '.sheet', touch: !!vp.touch });
        const fails = judge({ ...m, kind: o.kind, fit: !!o.fit });
        if (fails.length) failures.push(`${o.id}: ${fails.join(', ')} ${JSON.stringify({ over: m.scrollOverflow, small: m.smallTargets?.slice(0, 2), clipped: m.clippedSamples })}`);
      }
      expect(failures, `\n${failures.join('\n')}`).toEqual([]);
    });
  });
}

// ---- closing: ✕, Esc and backdrop (and swipe on phones) -------------------------------------------------------------

test.describe('closing overlays', () => {
  for (const [name, w, h] of [['phone', 390, 844], ['desktop', 1366, 768]] as const) {
    test.describe(name, () => {
      test.use({ hasTouch: name === 'phone' });

      test('a panel closes with ✕ and with Esc', async ({ page }) => {
        await start(page, { w, h });
        await page.evaluate(RESET);
        await page.evaluate("window.__fishbowl.store.getState().openPanel('settings')");
        await expect(page.locator('.settings')).toBeVisible();
        await page.locator('.settings .btn-close, .settings [aria-label="Close"]').first().click();
        await expect(page.locator('.settings')).toHaveCount(0);
        await page.evaluate("window.__fishbowl.store.getState().openPanel('shop', 'fish')");
        await expect(page.locator('.shop')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('.shop')).toHaveCount(0);
      });

      test('a dialog closes with ✕, Esc and a tap outside, and Esc closes only the topmost layer', async ({ page }) => {
        await start(page, { w, h });
        await page.evaluate(RESET);
        await page.evaluate("window.__fishbowl.store.setState({ pendingLevelUps: [13] })");
        await expect(page.locator('.levelup')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('.levelup')).toHaveCount(0);
        // A confirm dialog above a panel: Esc closes the dialog first, the panel stays.
        await page.evaluate("window.__fishbowl.store.getState().openPanel('settings')");
        await page.getByRole('button', { name: /Reset game/ }).click();
        await expect(page.locator('.confirm')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('.confirm')).toHaveCount(0);
        await expect(page.locator('.settings')).toBeVisible();
        // Tap outside closes a dismissible dialog.
        await page.getByRole('button', { name: /Reset game/ }).click();
        await page.mouse.click(4, 4);
        await expect(page.locator('.confirm')).toHaveCount(0);
      });

      test('a modal overlay makes the rest of the app inert', async ({ page }) => {
        await start(page, { w, h });
        await page.evaluate(RESET);
        await page.evaluate("window.__fishbowl.store.setState({ pendingLevelUps: [13] })");
        await expect(page.locator('.levelup')).toBeVisible();
        expect(await page.evaluate("document.querySelector('.hud')?.hasAttribute('inert')")).toBe(true);
        await page.keyboard.press('Escape');
        expect(await page.evaluate("document.querySelector('.hud')?.hasAttribute('inert')")).toBe(false);
      });
    });
  }
});

// ---- the variant follows the screen live, without a reload ------------------------------------------------------------

test('resizing from desktop to phone with a panel open switches side panel → bottom sheet (and back) without a reload', async ({ page }) => {
  await start(page, { w: 1440, h: 900 });
  await page.evaluate(RESET);
  await page.evaluate("window.__fishbowl.store.getState().openPanel('shop', 'fish')");
  await expect(page.locator('.ov-sidepanel')).toBeVisible();
  expect(await page.evaluate("getComputedStyle(document.querySelector('.app')).getPropertyValue('--panel-w').trim()")).toMatch(/^4\d\dpx$|^3\d\dpx$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.ov-sheet')).toBeVisible();
  await expect(page.locator('.ov-sidepanel')).toHaveCount(0);
  expect(await page.evaluate("getComputedStyle(document.querySelector('.app')).getPropertyValue('--panel-w').trim()")).toBe('0px');
  await expect(page.locator('.shop')).toBeVisible(); // still the same Shop, same tab
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.ov-sidepanel')).toBeVisible();
});

test('a docked side panel leaves the tank usable beside it (≥ 55 % of the width on a desktop)', async ({ page }) => {
  await start(page, { w: 1366, h: 768 });
  await page.evaluate(RESET);
  await page.evaluate("window.__fishbowl.store.getState().openPanel('shop', 'fish')");
  const box = await page.locator('.ov-sidepanel').boundingBox();
  expect(box!.width / 1366).toBeLessThan(0.45);
  const tank = await page.locator('.app .tank').boundingBox();
  expect(tank!.width / 1366).toBeGreaterThanOrEqual(0.55);
  // The renderer fitted itself to the smaller area: a click in the visible tank still works (toTank / tankToClient agree).
  const p = await page.evaluate("(() => { const r = window.__fishbowl.renderer(); const c = r.tankToClient(500, 300); return r.toTank(c.x, c.y); })()");
  expect(Math.round((p as any).x)).toBe(500);
});
