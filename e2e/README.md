# E2E (Playwright) — staging only, never production

Browser tests for the flows unit tests can't reach: login, queue rendering,
and the full **editor-compose → super-approve → worker-send → SMTP-delivered**
chain against fake SMTP.

## Run

```bash
cp .env.e2e.example .env.e2e   # fill in staging values (never commit)
npx playwright test            # headless chromium, serial
npx playwright test --ui       # interactive
npx playwright test e2e/approval-flow.spec.ts   # single file
```

Env is read from the shell (and `.env.e2e` if you `set -a; source .env.e2e`).
`playwright.config.ts` **refuses** any non-staging `PLAYWRIGHT_BASE_URL`.

## Files

| File | Purpose |
|---|---|
| `helpers.ts` | login, env guards, Mailpit polling |
| `admin-login.spec.ts` | form renders, bad creds rejected, both roles land in hub, unauthed redirect |
| `mailing-queue.spec.ts` | stats/tabs render, search filters, compose validation (no sends) |
| `approval-flow.spec.ts` | editor compose → super approve → Mailpit receives |
| `seed.sql` | one failed row for Retry coverage (staging DB only) |
| `cleanup.sql` | removes all E2E rows (mailpit.local recipients, `e2e-` ids) |
| `STAGING-CHECKLIST.md` | ops setup: tenant, logins, fake SMTP, seed |

## Rules

1. **Never point at production.** The config throws if the URL isn't staging.
2. **Never use real emails.** Recipients are `@mailpit.local`; subjects carry `[E2E …]`.
3. **Cleanup after runs.** `mysql < e2e/cleanup.sql` on staging (or re-run seed, which upserts).
4. Specs run serially (`workers: 1`) — they share the mail queue.
