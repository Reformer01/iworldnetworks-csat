import { defineConfig, devices } from '@playwright/test';

// E2E runs ONLY against staging — never production. See e2e/README.md and
// e2e/STAGING-CHECKLIST.md. Required env (see .env.e2e.example):
//   PLAYWRIGHT_BASE_URL  staging origin, e.g. https://staging.csat.iwn.ng
//   E2E_SUPER_EMAIL / E2E_SUPER_PASSWORD    super-admin test login
//   E2E_EDITOR_EMAIL / E2E_EDITOR_PASSWORD  editor test login
//   MAILPIT_URL                             fake-SMTP API, e.g. http://staging:8025
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://staging.csat.iwn.ng';

if (baseURL.includes('csat.iwn.ng') && !baseURL.includes('staging')) {
  throw new Error(
    `Refusing to run e2e against production (${baseURL}). Set PLAYWRIGHT_BASE_URL to staging.`,
  );
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // approval specs share the mail queue — run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
