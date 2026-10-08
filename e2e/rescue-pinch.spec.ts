import { expect, test } from '@playwright/test';
import { buyDecor, careButton, caseOf, closeOverlays, giveItem, nextDay, petOnce, runUntilStage, startRescueGame, takeRescueFromBoard } from './rescue-helpers';

test('Pinch: all four stages from the UI', async ({ page }) => {
  test.setTimeout(180_000);
  await startRescueGame(page);
  await takeRescueFromBoard(page, 'Pinch', 'pinch');

  // Stage 1: hideout + soft food ×2
  await buyDecor(page, /Smooth Rock/);
  await giveItem(page, 'Pinch', /Soft food/, 'soft food');
  await giveItem(page, 'Pinch', /Soft food/, 'soft food');
  await expect.poll(async () => (await caseOf(page, 'pinch')).stage).toBe(1);

  // Stage 2: clean for 3 min + 2 short pets
  await nextDay(page);
  await closeOverlays(page);
  await petOnce(page, 'rescue-pinch');
  await petOnce(page, 'rescue-pinch');
  await runUntilStage(page, 'pinch', 2);
  await expect.poll(async () => (await caseOf(page, 'pinch')).stage).toBe(2);

  // Stage 3: let him rest + healing moss
  await nextDay(page);
  await careButton(page, 'Pinch', /Let him rest/);
  await giveItem(page, 'Pinch', /Healing moss/, 'healing moss');
  await expect.poll(async () => (await caseOf(page, 'pinch')).stage).toBe(3);

  // Stage 4: pet ×3 + vitamin flakes
  await nextDay(page);
  await giveItem(page, 'Pinch', /Vitamin flakes/, 'vitamin flakes');
  for (let i = 0; i < 3; i++) await petOnce(page, 'rescue-pinch', 1200);
  await expect.poll(async () => (await caseOf(page, 'pinch')).status).toBe('done');
});
