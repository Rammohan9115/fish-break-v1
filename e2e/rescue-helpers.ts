import { expect, type Page } from '@playwright/test';
import { openTools, seedMidGame } from './helpers';

// Helpers that play rescues the way a player does: only visible UI plus the fake clock.
// (State is read through window.__fishbowl for assertions and to find where an animal is on screen.)

/** A fresh mid-game (shells for shopping) with the fake clock at 21:00 local so "night" tasks are possible. */
export async function startRescueGame(page: Page): Promise<void> {
  await page.route('http://localhost:54321/**', (route) => route.abort());
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e-cleared')) {
      localStorage.clear();
      sessionStorage.setItem('e2e-cleared', '1');
    }
  });
  const t = new Date();
  t.setHours(21, 0, 0, 0);
  await page.clock.install({ time: t });
  await page.goto('/');
  await page.waitForFunction(() => '__fishbowl' in window, null, { timeout: 20_000 });
  await seedMidGame(page);
  await run(page, 1000);
}

/** Moves the fake clock forward in ≤5 s steps (the game counts live play in 5 s slices). */
export async function run(page: Page, ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= 5000) await page.clock.runFor(Math.min(5000, left));
}

type Rescue = { activeId: string | null; cases: Record<string, { stage: number; progress: number[]; status: string; stageDoneOn: string | null }>; careItems: Record<string, number> };
export const rescueState = (page: Page) => page.evaluate(() => (window.__fishbowl.store.getState().game as { rescue: unknown }).rescue) as Promise<Rescue>;
export const caseOf = async (page: Page, id: string) => (await rescueState(page)).cases[id];

/** The "Next stage tomorrow" rule: skip a day (fake clock). */
export async function nextDay(page: Page): Promise<void> {
  await page.evaluate(() => window.__fishbowl.store.getState().dev.advanceDay());
}

export async function closeOverlays(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

export async function takeRescueFromBoard(page: Page, name: string, caseId: string): Promise<void> {
  await openTools(page);
  await page.getByRole('button', { name: 'Rescue' }).click();
  await page.locator('.rescue-card', { hasText: name }).click();
  await page.getByRole('button', { name: /Take this rescue|Resume|Switch/ }).click();
  await expect.poll(async () => (await rescueState(page)).activeId).toBe(caseId);
  await run(page, 6000); // the pelican lands
}

/** Opens the animal's card on the Care tab (My Fish → name). */
export async function openCare(page: Page, name: string): Promise<void> {
  await closeOverlays(page);
  await openTools(page);
  await page.getByRole('button', { name: 'My Fish' }).click();
  await page.getByText(name, { exact: true }).first().click();
  const care = page.getByRole('tab', { name: /Care/ });
  if (await care.isVisible().catch(() => false)) await care.click();
}

export async function giveItem(page: Page, name: string, item: RegExp, itemName: string): Promise<void> {
  await openCare(page, name);
  const tile = page.getByRole('button', { name: item });
  if ((await tile.getAttribute('aria-pressed')) !== 'true') await tile.click();
  await page.getByRole('button', { name: new RegExp(`Give ${itemName} to`, 'i') }).click();
}

export async function openShop(page: Page, tab: RegExp): Promise<void> {
  await closeOverlays(page);
  await openTools(page);
  await page.getByRole('button', { name: 'Shop' }).click();
  await page.getByRole('tab', { name: tab }).click();
}

export async function buyDecor(page: Page, name: RegExp): Promise<void> {
  await openShop(page, /Decor/);
  const card = page.locator('li,div,article').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: 'Buy', exact: true }) }).last();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'Buy', exact: true }).click();
  await closeOverlays(page);
}

export async function buyFish(page: Page, name: RegExp): Promise<void> {
  await openShop(page, /Fish/);
  const card = page.locator('li,div,article').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: 'Buy', exact: true }) }).last();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'Buy', exact: true }).click();
  await closeOverlays(page);
}

/** Screen position (CSS px) of an animal's center, found from the renderer. */
export async function screenPos(page: Page, fishId: string): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    const R = (window.__fishbowl as unknown as { renderer: () => { actors: Map<string, { x: number; y: number }>; toTank: (x: number, y: number) => { x: number; y: number } } }).renderer();
    const a = R.actors.get(id)!;
    const p0 = R.toTank(0, 0);
    const p1 = R.toTank(1000, 500);
    return { x: (a.x - p0.x) / ((p1.x - p0.x) / 1000), y: (a.y - p0.y) / ((p1.y - p0.y) / 500) };
  }, fishId);
}

/** One press-and-hold on an animal (a pet). Waits until the animal itself (not a neighbour) is under the pointer. */
export async function petOnce(page: Page, fishId: string, holdMs = 1500): Promise<void> {
  await closeOverlays(page);
  await page.waitForTimeout(100);
  for (let tries = 0; tries < 20; tries++) {
    const { x, y } = await screenPos(page, fishId);
    const hit = await page.evaluate(
      ([px, py, id]) => {
        const R = (window.__fishbowl as unknown as { renderer: () => { toTank: (x: number, y: number) => { x: number; y: number }; fishToPet: (x: number, y: number) => string | null } }).renderer();
        const t = R.toTank(px as number, py as number);
        return R.fishToPet(t.x, t.y) === id;
      },
      [x, y, fishId] as [number, number, string],
    );
    if (hit) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await run(page, holdMs);
      await page.mouse.up();
      await run(page, 500);
      return;
    }
    await run(page, 400);
  }
  throw new Error(`could not get the pointer onto ${fishId}`);
}

/** Opens the Care tab and taps a button in it. */
export async function careButton(page: Page, name: string, button: RegExp): Promise<void> {
  await openCare(page, name);
  await page.getByRole('button', { name: button }).click();
}

/** Feed mode: tap the water a few times (the Feed button sits next to Tools). */
export async function feedSome(page: Page, n = 3): Promise<void> {
  await closeOverlays(page);
  await openTools(page);
  await page.getByRole('button', { name: 'Feed', exact: true }).click();
  for (let i = 0; i < n; i++) {
    await page.mouse.click(300 + i * 120, 200);
    await run(page, 400);
  }
  await page.keyboard.press('Escape'); // leave Feed mode
}

/** A full Break Mode session of `minutes` (3 / 5 / 10), run out on the fake clock. */
export async function takeBreak(page: Page, minutes: number): Promise<void> {
  await closeOverlays(page);
  await openTools(page);
  await page.getByRole('button', { name: 'Break', exact: true }).click();
  await page.getByRole('radio', { name: `${minutes} min` }).click();
  await page.getByRole('button', { name: /Start/ }).click();
  await run(page, minutes * 60_000 + 5000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/** Inverse of the renderer's toTank (it is linear): tank units → CSS px. */
export async function tankToScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([tx, ty]) => {
      const R = (window.__fishbowl as unknown as { renderer: () => { toTank: (x: number, y: number) => { x: number; y: number } } }).renderer();
      const p0 = R.toTank(0, 0);
      const p1 = R.toTank(1000, 500);
      return { x: (tx - p0.x) / ((p1.x - p0.x) / 1000), y: (ty - p0.y) / ((p1.y - p0.y) / 500) };
    },
    [x, y] as [number, number],
  );
}

/** One "encouragement": quick taps in the water just above / beside him until the counter goes up (three taps fire it). */
export async function encourageOnce(page: Page, fishId: string): Promise<void> {
  await closeOverlays(page);
  const caseId = fishId.replace('rescue-', '');
  const count = async () => ((await caseOf(page, caseId)).progress[0] ?? 0) + (await caseOf(page, caseId)).stage * 100;
  const before = await count();
  for (let i = 0; i < 8 && (await count()) === before; i++) {
    const a = await page.evaluate((id) => {
      const R = (window.__fishbowl as unknown as { renderer: () => { actors: Map<string, { x: number; y: number }> } }).renderer();
      const f = R.actors.get(id)!;
      // Just above him, or beside him when he swims so high that "above" is under the HUD.
      return f.y > 190 ? { x: f.x, y: f.y - 70 } : { x: f.x + 80, y: f.y };
    }, fishId);
    const s = await tankToScreen(page, a.x, a.y);
    await page.mouse.click(s.x, s.y);
    await run(page, 300);
  }
}

/** Tap the glowing ring the moment he is airborne. */
export async function catchLeap(page: Page, fishId: string, maxMs = 60_000): Promise<void> {
  await closeOverlays(page);
  for (let t = 0; t < maxMs; t += 100) {
    const ring = await page.evaluate((id) => {
      const R = (window.__fishbowl as unknown as { renderer: () => { leapRing: (id: string) => { x: number; y: number; hot: boolean } | null } }).renderer();
      return R.leapRing(id);
    }, fishId);
    if (ring?.hot) {
      const s = await tankToScreen(page, ring.x, ring.y);
      await page.mouse.click(s.x, s.y);
      return;
    }
    await page.clock.runFor(100);
  }
}

/** Shop → Styles → Substrate → White Sand → Use it. */
export async function useWhiteSand(page: Page): Promise<void> {
  await openShop(page, /Styles/);
  await page.getByRole('radio', { name: /Substrate/ }).click();
  await page.getByRole('button', { name: /White Sand/ }).click();
  await page.getByRole('button', { name: /Use it/ }).click();
  await closeOverlays(page);
}

/** Runs the fake clock in 5 s steps until the case reaches `stage` (or finishes), up to `maxMs` of game time. */
export async function runUntilStage(page: Page, caseId: string, stage: number, maxMs = 400_000): Promise<void> {
  for (let t = 0; t < maxMs; t += 5000) {
    const c = await caseOf(page, caseId);
    if (c.stage >= stage || c.status === 'done') return;
    await page.clock.runFor(5000);
  }
}
