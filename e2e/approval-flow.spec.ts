import { test, expect } from '@playwright/test';
import { login, SUPER, EDITOR, MAILPIT_URL, e2eSubject, waitForMailpitMessage } from './helpers';

// Full chain on staging (fake SMTP catches everything):
// editor composes → pending_approval row → super approves → worker sends → Mailpit receives.
test.describe('approval flow end-to-end (fake SMTP)', () => {
  test('editor compose → super approve → delivered to Mailpit', async ({ browser }) => {
    const to = `e2e-${Date.now().toString(36)}@mailpit.local`;
    const subject = e2eSubject('E2E');

    // --- 1. Editor composes (becomes pending_approval, never auto-sends) ---
    const editorCtx = await browser.newContext();
    const editor = await editorCtx.newPage();
    await login(editor, EDITOR(), 'editor');
    await editor.goto('/admin/mailing?tab=emails');
    await expect(editor.getByPlaceholder(/search name or email/i)).toBeVisible({ timeout: 20_000 });

    await editor.getByRole('button', { name: /compose/i }).click();
    await editor.getByPlaceholder('customer@example.com').fill(to);
    await editor.getByPlaceholder('Email subject').fill(subject);
    await editor.getByPlaceholder('Plain-text body').fill('Playwright approval-flow probe — safe to ignore.');
    await editor.getByRole('button', { name: /queue email/i }).click();
    await expect(editor.getByText(/approv/i).first()).toBeVisible({ timeout: 20_000 });

    // Row visible in queue as awaiting approval
    await editor.getByPlaceholder(/search name or email/i).fill(to);
    await expect(editor.getByText(to).first()).toBeVisible({ timeout: 20_000 });
    await expect(editor.getByText(/awaiting approval|pending approval/i).first()).toBeVisible();
    await editorCtx.close();

    // --- 2. Super approves the exact row ---
    const superCtx = await browser.newContext();
    const admin = await superCtx.newPage();
    await login(admin, SUPER(), 'super-admin');
    await admin.goto('/admin/mailing?tab=emails');
    await admin.getByPlaceholder(/search name or email/i).fill(to);
    const row = admin.locator('tr', { hasText: to }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Approve email' }).click();
    await expect(admin.getByText(/approved|queued for sending/i).first()).toBeVisible({ timeout: 20_000 });
    await superCtx.close();

    // --- 3. Worker delivers to fake SMTP ---
    const hit = await waitForMailpitMessage(to);
    expect(hit).toBeTruthy();
  });

  test('Mailpit is reachable (staging fake SMTP guard)', async () => {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`);
    expect(res.ok).toBe(true);
  });
});
