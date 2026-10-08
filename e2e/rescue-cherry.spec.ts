import { expect, test } from '@playwright/test';
import { buyDecor, buyFish, caseOf, closeOverlays, giveItem, nextDay, petOnce, runUntilStage, startRescueGame, takeRescueFromBoard } from './rescue-helpers';

test('Cherry: all four stages from the UI', async ({ page }) => {
  test.setTimeout(300_000);
  await startRescueGame(page);
  await takeRescueFromBoard(page, 'Cherry', 'cherry');
  const stage = async () => (await caseOf(page, 'cherry')).stage;

  // Stage 1: moss ball + 3 min of 75%+ clean water
  await buyDecor(page, /Moss Ball/);
  await runUntilStage(page, 'cherry', 1);
  await expect.poll(stage).toBe(1);

  // Stage 2: 5 min of play without a pellet dissolving + vitamin flakes
  await nextDay(page);
  await giveItem(page, 'Cherry', /Vitamin flakes/, 'vitamin flakes');
  await runUntilStage(page, 'cherry', 2);
  await expect.poll(stage).toBe(2);

  // Stage 3: own a Cory + healing moss
  await nextDay(page);
  await buyFish(page, /Cory Catfish/);
  await giveItem(page, 'Cherry', /Healing moss/, 'healing moss');
  await expect.poll(stage).toBe(3);

  // Stage 4: 3 min of 80%+ clean water + pet ×2
  await nextDay(page);
  await closeOverlays(page);
  await petOnce(page, 'rescue-cherry', 1200);
  await petOnce(page, 'rescue-cherry', 1200);
  await runUntilStage(page, 'cherry', 4);
  await expect.poll(async () => (await caseOf(page, 'cherry')).status).toBe('done');
});
