import { expect, test } from '@playwright/test';
import { buyFish, useWhiteSand, careButton, caseOf, closeOverlays, giveItem, nextDay, petOnce, runUntilStage, startRescueGame, takeRescueFromBoard } from './rescue-helpers';

test('Professor Whiskers: all four stages from the UI', async ({ page }) => {
  test.setTimeout(300_000);
  await startRescueGame(page);
  await takeRescueFromBoard(page, 'Professor Whiskers', 'professor_whiskers');
  const stage = async () => (await caseOf(page, 'professor_whiskers')).stage;
  const id = 'rescue-professor_whiskers';

  // Stage 1: another cory + pet him
  await buyFish(page, /Cory Catfish/);
  await petOnce(page, id, 1200);
  await expect.poll(stage).toBe(1);

  // Stage 2: white sand + soft food
  await nextDay(page);
  await useWhiteSand(page);
  await giveItem(page, 'Professor Whiskers', /Soft food/, 'soft food');
  await expect.poll(stage).toBe(2);

  // Stage 3: 2 other corys + 3 min clean
  await nextDay(page);
  await buyFish(page, /Cory Catfish/);
  await runUntilStage(page, 'professor_whiskers', 3);
  await expect.poll(stage).toBe(3);

  // Stage 4: pet ×3 + group photo
  await nextDay(page);
  await closeOverlays(page);
  for (let i = 0; i < 3; i++) await petOnce(page, id, 1200);
  await careButton(page, 'Professor Whiskers', /Group photo/);
  await expect.poll(async () => (await caseOf(page, 'professor_whiskers')).status).toBe('done');
});
