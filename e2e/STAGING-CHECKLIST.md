# Staging Checklist — one-time ops setup for e2e

Goal: a staging tenant where Playwright can log in, approve mail, and watch
it land in **fake SMTP** — with zero path to production data or real inboxes.

## 1. Staging tenant (host + app)

- [ ] Clone prod host (or new VPS): copy `/home/csat.iwn.ng`, new vhost
      e.g. `https://staging.csat.iwn.ng` with its own TLS cert.
- [ ] Separate database (e.g. `csat_staging`) + separate Redis DB index.
- [ ] `pm2 start ecosystem.config.js` with staging `.env.production`:
      `DATABASE_URL`, `REDIS_URL`, `NEXT_PUBLIC_BASE_URL=https://staging…`.

## 2. Scrub PII (staging must never hold real customer data)

- [ ] Clone structure only (`mysqldump --no-data`) OR anonymize:
      `UPDATE Customer SET email=CONCAT('staging-',customerId,'@mailpit.local')`
      (same for phone). Never copy prod `Customer.email`/`phone` as-is.

## 3. Fake SMTP (Mailpit) — nothing real ever sends

- [ ] Install Mailpit on staging host: `docker run -d -p 8025:8025 -p 1025:1025 axllent/mailpit`
      (or the single binary from github.com/axllent/mailpit).
- [ ] Staging env: `SPLYNX_SMTP_HOST=127.0.0.1`, `SPLYNX_SMTP_PORT=1025`,
      `SPLYNX_SMTP_USER/SPLYNX_SMTP_PASS` dummy, `SPLYNX_FROM_EMAIL=no-reply@mailpit.local`.
- [ ] Verify: `curl http://127.0.0.1:8025/api/v1/messages` → `{"messages":[]…}`.
- [ ] `MAILPIT_URL=http://<staging-host>:8025` for the specs.

## 4. Test logins (can't touch prod)

- [ ] In Firebase console (same project is fine — auth ≠ data):
      create `e2e.editor@iworldnetworks.net` and `e2e.super@iworldnetworks.net`
      (verified emails, strong passwords, MFA off for these two).
- [ ] Staging `.env.production` (NOT prod): add
      `EDITOR_EMAILS_EXTRA=e2e.editor@iworldnetworks.net`
      `SUPER_ADMIN_EMAILS_EXTRA=e2e.super@iworldnetworks.net`
      and restart staging. These envs are empty in prod → zero effect there.
- [ ] Sanity: log in as editor on staging → sees hub; Compose works;
      super sees Approval Center. Neither account exists in prod code paths.

## 5. Seeded queue rows (optional — approval spec composes live)

- [ ] `mysql < e2e/seed.sql` on the **staging** DB (one failed row for Retry).
- [ ] After runs: `mysql < e2e/cleanup.sql` (removes `@mailpit.local` + `e2e-` rows).

## 6. Local runner setup

- [ ] `npm i` (pulls `@playwright/test`), `npx playwright install chromium`.
- [ ] `cp .env.e2e.example .env.e2e`, fill staging values, **never commit** it.
- [ ] `set -a; source .env.e2e; npx playwright test` (or `npm run test:e2e`).

## 7. Guardrails (verify once, trust the config after)

- [ ] `PLAYWRIGHT_BASE_URL` without "staging" → suite refuses to start.
- [ ] No spec uses a real email domain; grep CI for `@iworldnetworks.net` in `e2e/*.spec.ts` → only the two login env usages.
- [ ] Staging firewall: block outbound port 25/465/587 except to Mailpit, so even a misconfigured SMTP can't deliver.

## 8. Paystack finance workbench (staging only, never production)

- [ ] Staging env: rotated server-side `PAYSTACK_SECRET_KEY` (never reuse a posted/historical key, never commit it).
- [ ] Staging backfill ran (dashboard backfill defaults to `success,failed,abandoned`; revenue aggregates stay success-only).
- [ ] View/export-only test login created (Firebase, verified email, MFA off) + `E2E_FINANCE_VIEWER_EMAIL` /
      `E2E_FINANCE_VIEWER_PASSWORD` in local `.env.e2e` (never committed). Manager coverage reuses `E2E_SUPER_*`.
- [ ] Run: `npx playwright test e2e/paystack-finance.spec.ts` → finance login, overview load, transaction search,
      reconciliation queues, manager exception assignment, viewer forbidden assignment, CSV download, snapshot
      freeze + rerun all PASS against staging only.
- [ ] Verify on staging: Dorcas-style viewer reads/exports but cannot assign; manager-only sync/snapshot-freeze
      rejects the viewer; CSV/PDF outputs sane; frozen snapshots immutable on rerun.
