import { test, expect } from '@playwright/test';
import { login, SUPER } from './helpers';

// Staging-only coverage for the Paystack finance workbench
// (/admin/finance/paystack). Never production; never real customer data.
//
// Roles (staging test logins only):
// - manager: super-admin login (E2E_SUPER_*) — full finance rights.
// - viewer:  view/export-only finance login (E2E_FINANCE_VIEWER_*) —
//   assignment controls hidden, exception POSTs rejected with 403
//   (server boundary is unit-covered; here we assert the UI boundary).
// Creds are read at call time so `--list` works without secrets.

function FINANCE_VIEWER() {
  return {
    email: process.env.E2E_FINANCE_VIEWER_EMAIL || '',
    password: process.env.E2E_FINANCE_VIEWER_PASSWORD || '',
  };
}

test.describe('paystack finance staging (manager)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, SUPER(), 'finance-manager');
  });

  test('finance login lands on the paystack overview', async ({ page }) => {
    await page.goto('/admin/finance/paystack');
    await expect(page.getByRole('heading', { name: /paystack overview/i })).toBeVisible({ timeout: 20_000 });
  });

  test('overview loads KPIs or an explicit empty state', async ({ page }) => {
    await page.goto('/admin/finance/paystack');
    await expect(page.getByRole('heading', { name: /paystack overview/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/₦|no collections recorded for/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('transaction search filters without errors', async ({ page }) => {
    await page.goto('/admin/finance/paystack/transactions');
    const search = page.getByLabel(/search transactions/i);
    await expect(search).toBeVisible({ timeout: 20_000 });
    await search.fill('e2e-probe-no-such-reference');
    await expect(page.getByText(/no transactions found/i)).toBeVisible({ timeout: 20_000 });
    await search.fill('');
    await expect(
      page
        .getByText(/no transactions found/i)
        .or(page.locator('table[aria-label="Transactions"]'))
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).not.toHaveURL(/error/i);
  });

  test('reconciliation queues load with the exception queue', async ({ page }) => {
    await page.goto('/admin/finance/paystack/reconciliation');
    await expect(page.getByRole('heading', { name: /^reconciliation$/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tablist', { name: /reconciliation queues/i })).toBeVisible();
    await page.getByRole('tab', { name: /amount-mismatch/i }).click();
    await expect(page.locator('section[aria-label$="queue"]').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /exception queue/i })).toBeVisible();
  });

  test('manager can assign an open exception', async ({ page }) => {
    await page.goto('/admin/finance/paystack/reconciliation');
    await expect(page.getByRole('heading', { name: /exception queue/i })).toBeVisible({ timeout: 20_000 });
    const items = page.locator('ul[aria-label="Exception queue"] > li');
    if ((await items.count()) === 0) {
      test.skip(true, 'no open exceptions on staging right now');
      return;
    }
    const first = items.first();
    await first.getByLabel('Owner email').fill('e2e-owner@mailpit.local');
    await first.getByLabel('Follow-up note').fill('Staging probe — safe to ignore.');
    await first.getByRole('button', { name: /^assign$/i }).click();
    await expect(page.getByText(/exception assigned/i)).toBeVisible({ timeout: 20_000 });
  });

  test('manager can download a transactions CSV', async ({ page }) => {
    await page.goto('/admin/finance/paystack/reports');
    await expect(page.getByRole('heading', { name: /^reports$/i })).toBeVisible({ timeout: 20_000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: /transactions csv/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
    await download.delete();
  });

  test('manager can freeze a monthly snapshot', async ({ page }) => {
    await page.goto('/admin/finance/paystack/reports');
    await expect(page.getByRole('heading', { name: /^reports$/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /^freeze /i }).click();
    await expect(page.getByText(/snapshot frozen for/i)).toBeVisible({ timeout: 30_000 });
  });

  test('snapshot rerun shows the frozen detail', async ({ page }) => {
    await page.goto('/admin/finance/paystack/reports');
    await expect(page.getByRole('heading', { name: /^reports$/i })).toBeVisible({ timeout: 20_000 });
    if ((await page.getByRole('button', { name: /^\d{4}-\d{2}$/ }).count()) === 0) {
      await page.getByRole('button', { name: /^freeze /i }).click();
      await expect(page.getByText(/snapshot frozen for/i)).toBeVisible({ timeout: 30_000 });
    }
    const month = await page.getByLabel('Report month').inputValue();
    await page.getByRole('button', { name: month }).click();
    await expect(page.getByText(new RegExp(`Snapshot ${month}`))).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('paystack finance staging (viewer)', () => {
  test('view/export-only login reads queues but sees no assignment controls', async ({ page }) => {
    await login(page, FINANCE_VIEWER(), 'finance-viewer');
    await page.goto('/admin/finance/paystack/reconciliation');
    await expect(page.getByRole('heading', { name: /^reconciliation$/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tablist', { name: /reconciliation queues/i })).toBeVisible();
    await expect(page.getByLabel(/owner email/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^assign$/i })).toHaveCount(0);
  });
});
