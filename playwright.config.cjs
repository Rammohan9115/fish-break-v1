// @ts-check
const { defineConfig } = require('@playwright/test');

// End-to-end tests drive the dev server (it exposes window.__fishbowl for setting up state).
// Locally they use your installed Chrome; CI installs Chromium (see .github/workflows/ci.yml).
module.exports = defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  workers: process.env.CI ? 2 : 3,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5198',
    viewport: { width: 1000, height: 640 },
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  webServer: {
    command: 'npx vite --port 5198 --strictPort',
    url: 'http://localhost:5198',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // A fake Supabase project: cloud UI is enabled, and every request to it is mocked in the tests (never the real one).
    env: { VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
  },
});
