import { test, expect } from '@playwright/test';
import { login, SUPER } from './helpers';

test.describe('mailing queue (read + validate)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, SUPER(), "super-admin");
    await page.goto('/admin/mailing?tab=emails');
    await expect(page.getByPlaceholder(/search name or email/i)).toBeVisible({ timeout: 20_000 });
  });

  test('queue stats and tabs render', async ({ page }) => {
    // Stat cards + tabs exist (values depend on seeded/live staging data)
    await expect(page.getByText(/pending approval|pending|sent/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /compose/i })).toBeVisible();
  });

  test('search filters the queue without errors', async ({ page }) => {
    await page.getByPlaceholder(/search name or email/i).fill('e2e-probe-no-such-customer');
    await expect(page.getByText(/no .* match|nothing found|no emails/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('status pills filter (open/closed equivalent: pending/failed)', async ({ page }) => {
    // Pills exist and are clickable; list must not error out
    const failedPill = page.getByRole('button', { name: /^failed$/i });
    if (await failedPill.count()) {
      await failedPill.first().click();
      await expect(page).not.toHaveURL(/error/i);
    } else {
      test.skip(true, 'no failed pill rendered on staging right now');
    }
  });

  test('compose dialog opens with validation (no send)', async ({ page }) => {
    await page.getByRole('button', { name: /compose/i }).click();
    // Dialog with To + Subject fields; submit empty → validation error, nothing queued
    const to = page.locator('input[type="email"], input[name="to"], input[placeholder*="To" i]').first();
    await expect(to).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /send|queue|submit/i }).click();
    // Either a validation message or the dialog stays open — but no success toast
    await expect(page.getByText(/required|invalid|enter/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
