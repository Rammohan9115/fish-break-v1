import { expect, test } from '@playwright/test';
import { buyDecor, caseOf, closeOverlays, feedSome, giveItem, nextDay, petOnce, run, runUntilStage, screenPos, startRescueGame, takeBreak, takeRescueFromBoard } from './rescue-helpers';

test('Noodle: all four stages from the UI', async ({ page }) => {
  test.setTimeout(240_000);
  await startRescueGame(page);
  await takeRescueFromBoard(page, 'Noodle', 'noodle');
  const stage = async () => (await caseOf(page, 'noodle')).stage;

  // Stage 1: two plants + feed at night (the fake clock is at 21:00)
  await buyDecor(page, /Sprout/);
  await buyDecor(page, /Sprout/);
  await feedSome(page);
  await expect.poll(stage).toBe(1);

  // Stage 2: 3 min of Break Mode + 3 min clean (both run while the break runs)
  await nextDay(page);
  await takeBreak(page, 3);
  await runUntilStage(page, 'noodle', 2);
  await expect.poll(stage).toBe(2);

  // Stage 3: sit near him for 5 s + soft food
  await nextDay(page);
  await closeOverlays(page);
  const p = await screenPos(page, 'rescue-noodle');
  await page.mouse.move(p.x, p.y - 90);
  await page.mouse.down();
  await run(page, 6000);
  await page.mouse.up();
  await giveItem(page, 'Noodle', /Soft food/, 'soft food');
  await expect.poll(stage).toBe(3);

  // Stage 4: pet ×2 + night feed
  await nextDay(page);
  await feedSome(page);
  await petOnce(page, 'rescue-noodle', 1200);
  await petOnce(page, 'rescue-noodle', 1200);
  await expect.poll(async () => (await caseOf(page, 'noodle')).status).toBe('done');
});
