import { expect, Page } from '@playwright/test';

export interface E2eCreds {
  email: string;
  password: string;
}

/** Read at call time (not import time) so `--list` works without secrets. */
export function SUPER(): E2eCreds {
  return {
    email: process.env.E2E_SUPER_EMAIL || '',
    password: process.env.E2E_SUPER_PASSWORD || '',
  };
}

export function EDITOR(): E2eCreds {
  return {
    email: process.env.E2E_EDITOR_EMAIL || '',
    password: process.env.E2E_EDITOR_PASSWORD || '',
  };
}

function assertCreds(creds: E2eCreds, role: string): void {
  if (!creds.email || !creds.password) {
    throw new Error(`Missing e2e credential env for ${role} (see .env.e2e.example)`);
  }
}

export const MAILPIT_URL = (process.env.MAILPIT_URL || 'http://localhost:8025').replace(/\/+$/, '');

/** Sign in through the real Firebase login form. */
export async function login(page: Page, creds: E2eCreds, role = 'test user') {
  assertCreds(creds, role);
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(creds.email);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/(dashboard|mailing|support)/, { timeout: 30_000 });
}

/** E2E marker subject — unique per run so Mailpit assertions can't collide. */
export function e2eSubject(prefix = 'E2E'): string {
  return `[${prefix} ${Date.now().toString(36)}] approval-flow probe — ignore`;
}

/** Poll Mailpit until a message to `to` appears (fake SMTP on staging). */
export async function waitForMailpitMessage(to: string, timeoutMs = 90_000): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    if (res.ok) {
      const data = await res.json();
      const hit = (data.messages || []).find((m: { To?: Array<{ Address?: string }> }) =>
        (m.To || []).some((t) => (t.Address || '').toLowerCase() === to.toLowerCase()),
      );
      if (hit) return hit;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for mail to ${to} in Mailpit`);
    await new Promise((r) => setTimeout(r, 3_000));
  }
}
