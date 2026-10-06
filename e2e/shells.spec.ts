import { expect, test } from '@playwright/test';
import { freshGame, gameState } from './helpers';

const SIZES: [string, number, number][] = [
  ['phone portrait', 390, 844],
  ['phone landscape', 844, 390],
  ['desktop', 1366, 768],
];

for (const [name, width, height] of SIZES) {
  test(`tapping near the top edge of a shell and a pearl collects them (${name})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await freshGame(page, { seed: true });
    await page.evaluate(() => {
      const s = window.__fishbowl.store;
      const g = s.getState().game;
      const shells = [
        { id: 'sh1', x: 500, plane: 'mid', value: 7, pearl: false },
        { id: 'pe1', x: 620, plane: 'mid', value: 1, pearl: true },
      ];
      s.getState().loadState({ ...g, tanks: [{ ...g.tanks[0], shells }], shells: 100, pearls: 0 });
    });
    // The dock starts open during the first tip; tuck it away so it isn't over the sand.
    const hide = page.getByRole('button', { name: 'Hide tools' });
    if (await hide.isVisible()) await hide.click();
    await page.waitForTimeout(1500); // let the landing bounce settle
    // Where the shell and pearl are on screen, then 70% of the way up the sprite (near its top edge).
    const aim = (x: number) =>
      page.evaluate((tx) => {
        const r = (window.__fishbowl as unknown as { renderer: () => { tankToClient(x: number, y: number): { x: number; y: number }; scale: number } }).renderer();
        // SAND_Y is 560; the sprite is ~40 CSS px wide and ~29 px tall, so aim ~20 CSS px above the sand line.
        const p = r.tankToClient(tx, 560);
        return { x: p.x, y: p.y - 20 };
      }, x);
    const shell = await aim(500);
    await page.mouse.click(shell.x, shell.y);
    await expect.poll(async () => (await gameState(page)).shells).toBe(107);
    const pearl = await aim(620);
    await page.mouse.click(pearl.x, pearl.y);
    await expect.poll(async () => (await gameState(page)).pearls).toBe(1);
    expect((await gameState(page)).tanks[0].shells).toHaveLength(0);
  });
}
