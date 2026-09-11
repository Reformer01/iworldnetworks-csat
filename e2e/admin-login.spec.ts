import { test, expect } from '@playwright/test';
import { login, SUPER, EDITOR } from './helpers';

test.describe('admin login', () => {
  test('login page renders the corporate sign-in form', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('wrong password is rejected (stays on login)', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('input[type="email"]').fill(SUPER().email);
    await page.locator('input[type="password"]').fill(`wrong-${Date.now()}`);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 20_000 });
  });

  test('super-admin login lands inside the admin hub', async ({ page }) => {
    await login(page, SUPER(), 'super-admin');
    await expect(page.getByText(/sign out/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('editor login lands inside the admin hub', async ({ page }) => {
    await login(page, EDITOR(), 'editor');
    await expect(page.getByText(/sign out/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('unauthenticated /admin/mailing redirects to login', async ({ page }) => {
    await page.goto('/admin/mailing?tab=emails');
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 20_000 });
  });
});
