import { expect, test } from '@playwright/test';
import { freshGame } from './helpers';

// The Supabase project is fake; the auth endpoint is mocked so the whole login UI can be exercised offline.
test('Settings → Save progress → magic link is requested and the inbox hint is shown', async ({ page }) => {
  await freshGame(page, { seed: true });
  let otpBody: Record<string, unknown> | null = null;
  await page.route('http://localhost:54321/auth/v1/otp**', async (route) => {
    otpBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /Save progress/ }).click();
  await page.getByLabel('Email address').fill('player@example.com');
  await page.getByRole('button', { name: /Send magic link/ }).click();
  await expect(page.getByText('Check your inbox!')).toBeVisible();
  expect(otpBody).toMatchObject({ email: 'player@example.com' });
});

test('an invalid email is rejected before anything is sent', async ({ page }) => {
  await freshGame(page, { seed: true });
  let requested = false;
  await page.route('http://localhost:54321/auth/v1/otp**', (route) => {
    requested = true;
    return route.fulfill({ status: 200, body: '{}' });
  });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /Save progress/ }).click();
  // Passes the browser's own check but not ours (no domain dot).
  await page.getByLabel('Email address').fill('player@localhost');
  await page.getByRole('button', { name: /Send magic link/ }).click();
  await expect(page.getByText('Check your inbox!')).toHaveCount(0);
  await expect(page.locator('.login-error')).toBeVisible();
  expect(requested).toBe(false);
});
