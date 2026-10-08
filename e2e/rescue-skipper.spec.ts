import { expect, test } from '@playwright/test';
import { buyDecor, catchLeap, caseOf, closeOverlays, encourageOnce, giveItem, nextDay, petOnce, runUntilStage, startRescueGame, takeRescueFromBoard } from './rescue-helpers';

test('Skipper: all four stages from the UI', async ({ page }) => {
  test.setTimeout(300_000);
  await startRescueGame(page);
  await takeRescueFromBoard(page, 'Skipper', 'skipper');
  const stage = async () => (await caseOf(page, 'skipper')).stage;
  const id = 'rescue-skipper';

  // Stage 1: lily pad + soft food
  await buyDecor(page, /Lily Pad/);
  await giveItem(page, 'Skipper', /Soft food/, 'soft food');
  await expect.poll(stage).toBe(1);

  // Stage 2: encourage ×3
  await nextDay(page);
  await closeOverlays(page);
  for (let i = 0; i < 3; i++) await encourageOnce(page, id);
  await expect.poll(stage).toBe(2);

  // Stage 3: encourage ×4 + 3 min clean
  await nextDay(page);
  await closeOverlays(page);
  for (let i = 0; i < 4; i++) await encourageOnce(page, id);
  await runUntilStage(page, 'skipper', 3);
  await expect.poll(stage).toBe(3);

  // Stage 4: catch his first leap + pet ×2
  await nextDay(page);
  await catchLeap(page, id);
  await petOnce(page, id, 1200);
  await petOnce(page, id, 1200);
  await expect.poll(async () => (await caseOf(page, 'skipper')).status).toBe('done');
});
