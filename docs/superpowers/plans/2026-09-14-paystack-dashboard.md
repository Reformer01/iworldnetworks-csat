# Paystack Transactions Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 Paystack reconciliation-ledger dashboard with overview, transactions, reconciliation, customers, reports, saved views, exports, snapshots, and finance-role access.

**Architecture:** Persist Paystack gateway rows and normalized Splynx income rows, link them with deterministic reference-first matching, expose assignment/follow-up-only exceptions, and render a scoped dark premium finance UI with CSV/PDF reporting.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Prisma 7 + MariaDB, Firebase Admin auth, Recharts 2, shadcn chart primitives, Lucide icons, jsPDF + autotable, Vitest + Testing Library, Playwright for staging verification.

**Spec:** `docs/superpowers/specs/2026-09-14-paystack-dashboard-design.md`

## Global Constraints

- No posted or historical Paystack secret may be reused; only a rotated server-side `PAYSTACK_SECRET_KEY` may be configured.
- No secret may be committed to the repository.
- Reference screenshots are inspiration only; do not copy protected code, assets, brand, icons, or text.
- MariaDB text columns default to VARCHAR(191); truncate user-controlled strings to 191 characters instead of throwing.
- Finance API routes require Firebase admin auth plus finance-role authorization.
- Dorcas Olayoole (`dorcas.olayoole@iworldnetworks.net`) has view/export-only finance rights.
- Segun and Stella are already super admins and retain full finance rights.
- Admin API responses use `@/lib/api-response` helpers and `Cache-Control: no-store`.
- Reads default to 120 requests/minute; routine writes default to 30/minute; sync endpoints default to 10/minute.
- Amounts from Paystack are kobo integers; normalize to Naira with `(amount || 0) / 100`.
- Tests live beside implementation as `__tests__/*.test.ts(x)` and run with Vitest.

---

## File Structure

New focused modules:

- `prisma/schema.prisma`: add `SplynxIncomeLedger`, `PaystackReconciliationLink`, `ReconciliationException`, `PaystackSavedView`, `PaystackMonthlySnapshot`; extend `PaystackTransaction` with fee/net/refund/dispute fields.
- `src/lib/finance-access.ts`: `canViewFinance`, `canManageFinance`, `requireFinanceViewer`, `requireFinanceManager`.
- `src/lib/finance/paystack-normalize.ts`: kobo-to-Naira, channel/status normalization, reference/email normalization, duplicate detection helpers.
- `src/lib/finance/paystack-reconcile.ts`: reference-first matching, email/amount/date fallback, mismatch classification, exception builders.
- `src/lib/finance/paystack-webhook.ts`: raw-body HMAC-SHA512 signature verification.
- `src/lib/finance/paystack-report.ts`: CSV builders, snapshot payload builders, PDF table-data builders.
- `src/lib/finance/paystack-aggregates.ts`: overview, transaction, customer, reconciliation aggregations over Prisma rows.
- API routes under `src/app/api/admin/finance/paystack/*`: `overview`, `transactions`, `reconciliation`, `customers`, `reports`, `exceptions`, `saved-views`, `snapshots`, `sync`.
- Public webhook route: `src/app/api/finance/paystack/webhook/route.ts`.
- UI under `src/app/admin/finance/paystack/*`: `layout.tsx`, `page.tsx`, `transactions/page.tsx`, `reconciliation/page.tsx`, `customers/page.tsx`, `reports/page.tsx`.
- UI components under `src/components/finance/paystack/*`: `FinanceKpiCards.tsx`, `CollectionsTrendChart.tsx`, `ChannelDonut.tsx`, `BreakdownBars.tsx`, `CollectionFunnel.tsx`, `RecentCollections.tsx`, `TransactionsTable.tsx`, `ExceptionQueue.tsx`, `SavedViewBar.tsx`, `ExportButtons.tsx`.

Modified existing files:

- `src/lib/paystack.ts`: extend ingestion beyond success-only and populate fee/net/refund/dispute fields when present.
- `src/lib/admin-config.ts`: no role-list change required; finance helpers read existing super-admin list plus Dorcas viewer grant.

---

### Task 1: Reconciliation-ledger data model and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `npx prisma validate`, `npm run typecheck`

**Interfaces:**
- Consumes: existing `PaystackTransaction` model.
- Produces: Prisma models `SplynxIncomeLedger`, `PaystackReconciliationLink`, `ReconciliationException`, `PaystackSavedView`, `PaystackMonthlySnapshot`, plus extended `PaystackTransaction` fields.

- [ ] **Step 1: Add the ledger models**

```prisma
model SplynxIncomeLedger {
  id             String    @id @default(cuid())
  source         String
  sourceId       String?
  customerId     String?
  customerName   String?
  customerEmail  String?
  reference      String?
  amountNaira    Float
  currency       String    @default("NGN")
  productSegment String?
  region         String?
  taxNaira       Float?    @default(0)
  discountNaira  Float?    @default(0)
  paidAt         DateTime?
  raw            Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([source])
  @@index([reference])
  @@index([customerEmail])
  @@index([paidAt])
}

model PaystackReconciliationLink {
  id                  String   @id @default(cuid())
  paystackReference   String
  splynxLedgerId      String?
  method              String
  confidence          Float
  paystackAmountNaira Float
  splynxAmountNaira   Float?
  varianceNaira       Float?
  status              String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([paystackReference])
  @@index([splynxLedgerId])
  @@index([status])
  @@index([method])
}

model ReconciliationException {
  id                String    @id @default(cuid())
  kind              String
  paystackReference String?
  splynxLedgerId    String?
  title             String
  detail            String?   @db.Text
  amountNaira       Float?
  ownerEmail        String?
  status            String    @default("open")
  followUpAt        DateTime?
  history           Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([kind])
  @@index([status])
  @@index([ownerEmail])
  @@index([followUpAt])
}

model PaystackSavedView {
  id         String @id @default(cuid())
  name       String
  ownerEmail String
  scope      String
  filters    Json
  grouping   String?
  metric     String?
  mode       String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([ownerEmail])
  @@index([scope])
}

model PaystackMonthlySnapshot {
  id            String  @id @default(cuid())
  month         String  @unique
  totals        Json
  channels      Json?
  regions       Json?
  segments      Json?
  reconciliation Json?
  exceptions    Json?
  savedBy       String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Extend `PaystackTransaction` with:

```prisma
  feesNaira      Float?
  netNaira       Float?
  refundedNaira  Float?   @default(0)
  disputeStatus  String?
```

Add indexes:

```prisma
  @@index([channel])
```

- [ ] **Step 2: Validate the schema**

Run: `npx prisma validate`
Expected: PASS with no schema errors.

- [ ] **Step 3: Create the migration**

Run: `npx prisma migrate dev --name paystack-reconciliation-ledger`
Expected: PASS and a new migration directory under `prisma/migrations`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add paystack reconciliation ledger models"
```

---

### Task 2: Finance-role access helpers

**Files:**
- Create: `src/lib/finance-access.ts`
- Test: `src/lib/__tests__/finance-access.test.ts`

**Interfaces:**
- Consumes: `isSuperAdmin` from `@/lib/admin-config`; `{ forbidden }` from `@/lib/api-response`.
- Produces: `canViewFinance(email)`, `canManageFinance(email)`, `requireFinanceViewer(admin)`, `requireFinanceManager(admin)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { canManageFinance, canViewFinance } from '../finance-access';

describe('finance access', () => {
  it('grants full finance rights to super admins', () => {
    expect(canManageFinance('stella.akinola@iworldnetworks.net')).toBe(true);
    expect(canManageFinance('alaka.segun@iworldnetworks.net')).toBe(true);
  });

  it('grants view-only finance rights to Dorcas', () => {
    expect(canViewFinance('dorcas.olayoole@iworldnetworks.net')).toBe(true);
    expect(canManageFinance('dorcas.olayoole@iworldnetworks.net')).toBe(false);
  });

  it('denies finance access to ordinary admins', () => {
    expect(canViewFinance('random.agent@iworldnetworks.net')).toBe(false);
    expect(canManageFinance('random.agent@iworldnetworks.net')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/__tests__/finance-access.test.ts`
Expected: FAIL with "Cannot find module '../finance-access'".

- [ ] **Step 3: Write minimal implementation**

```ts
import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/admin-config';
import { forbidden } from '@/lib/api-response';

const FINANCE_VIEWER_EMAILS = ['dorcas.olayoole@iworldnetworks.net'];

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function canManageFinance(email: string | null | undefined): boolean {
  return isSuperAdmin(normalizeEmail(email));
}

export function canViewFinance(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (isSuperAdmin(normalized)) return true;
  return FINANCE_VIEWER_EMAILS.includes(normalized);
}

export function requireFinanceViewer(admin: { email: string } | null): NextResponse | null {
  if (!admin || !canViewFinance(admin.email)) return forbidden('Finance access required.');
  return null;
}

export function requireFinanceManager(admin: { email: string } | null): NextResponse | null {
  if (!admin || !canManageFinance(admin.email)) return forbidden('Finance management access required.');
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/__tests__/finance-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance-access.ts src/lib/__tests__/finance-access.test.ts
git commit -m "feat: add paystack finance role checks"
```

---

### Task 3: Paystack normalization and expanded ingestion

**Files:**
- Create: `src/lib/finance/paystack-normalize.ts`
- Test: `src/lib/finance/__tests__/paystack-normalize.test.ts`
- Modify: `src/lib/paystack.ts`

**Interfaces:**
- Consumes: `PaystackTransactionRaw` from `@/lib/paystack`.
- Produces: `koboToNaira(amount)`, `normalizeChannel(channel)`, `normalizePaystackStatus(status)`, `normalizeReference(reference)`, `normalizeEmail(email)`, `isDuplicateReference(seen, reference)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  koboToNaira,
  normalizeChannel,
  normalizeEmail,
  normalizePaystackStatus,
  normalizeReference,
} from '../paystack-normalize';

describe('paystack normalization', () => {
  it('converts kobo to naira', () => {
    expect(koboToNaira(4350000)).toBe(43500);
    expect(koboToNaira(null)).toBe(0);
  });

  it('normalizes channels and statuses', () => {
    expect(normalizeChannel('Card')).toBe('card');
    expect(normalizePaystackStatus('Success')).toBe('success');
    expect(normalizePaystackStatus('Abandoned')).toBe('abandoned');
  });

  it('normalizes matching keys', () => {
    expect(normalizeReference(' Paystack Splynx / 2026-30-06188 ')).toBe('paystack splynx / 2026-30-06188');
    expect(normalizeEmail(' SOMEONE@Example.COM ')).toBe('someone@example.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/finance/__tests__/paystack-normalize.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Write minimal implementation**

```ts
export function koboToNaira(amount: number | null | undefined): number {
  return (amount || 0) / 100;
}

export function normalizeChannel(channel?: string | null): string | null {
  const value = (channel || '').trim().toLowerCase();
  return value ? value : null;
}

export function normalizePaystackStatus(status?: string | null): string {
  return (status || 'unknown').trim().toLowerCase();
}

export function normalizeReference(reference?: string | null): string {
  return (reference || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function isDuplicateReference(seen: Set<string>, reference?: string | null): boolean {
  const key = normalizeReference(reference);
  if (!key) return false;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/finance/__tests__/paystack-normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Expand ingestion beyond success-only**

In `src/lib/paystack.ts`:

1. Accept `statuses?: string[]` in `fetchPaystackTransactionsPage` and `syncPaystackTransactions`.
2. Default dashboard backfill to `['success', 'failed', 'abandoned']`.
3. Keep `getPaystackMonthlyAggregates` success-only for revenue reconciliation.
4. Populate `feesNaira`, `netNaira`, `refundedNaira`, and `disputeStatus` when the gateway payload contains fee/refund/dispute fields.
5. Truncate `customerName`, `customerEmail`, `gatewayResponse`, and channel values to MariaDB-safe lengths.

- [ ] **Step 6: Run related checks**

Run: `npm run test:run -- src/lib/finance/__tests__/paystack-normalize.test.ts`
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/finance/paystack-normalize.ts src/lib/finance/__tests__/paystack-normalize.test.ts src/lib/paystack.ts
git commit -m "feat: expand paystack ingestion and normalization"
```

---

### Task 4: Deterministic reconciliation engine

**Files:**
- Create: `src/lib/finance/paystack-reconcile.ts`
- Test: `src/lib/finance/__tests__/paystack-reconcile.test.ts`

**Interfaces:**
- Consumes: normalization helpers from `./paystack-normalize`.
- Produces: `matchByReference(paystack, splynx)`, `matchByEmailAmountDate(paystack, splynx)`, `classifyReconciliation(paystack, links)`.

Input shapes:

```ts
export interface ReconPaystackRow {
  reference: string;
  email: string;
  amountNaira: number;
  paidAt: string | null;
}

export interface ReconSplynxRow {
  id: string;
  reference: string;
  email: string;
  amountNaira: number;
  paidAt: string | null;
}
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { classifyReconciliation, matchByEmailAmountDate, matchByReference } from '../paystack-reconcile';

const paystack = { reference: 'PSK-1', email: 'a@example.com', amountNaira: 43500, paidAt: '2026-08-01' };
const splynx = { id: 's1', reference: 'PSK-1', email: 'a@example.com', amountNaira: 43500, paidAt: '2026-08-01' };

describe('reconciliation engine', () => {
  it('matches identical references', () => {
    expect(matchByReference(paystack, [splynx])?.id).toBe('s1');
  });

  it('falls back to email, amount, and date', () => {
    const renamed = { ...splynx, reference: 'OTHER' };
    expect(matchByEmailAmountDate(paystack, [renamed])?.id).toBe('s1');
  });

  it('classifies missing and mismatched rows', () => {
    expect(classifyReconciliation(paystack, []).kind).toBe('paystack-only');
    expect(classifyReconciliation(paystack, [{ ...splynx, amountNaira: 1 }]).kind).toBe('amount-mismatch');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/finance/__tests__/paystack-reconcile.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Write minimal implementation**

```ts
import { normalizeEmail, normalizeReference } from './paystack-normalize';
import type { ReconPaystackRow, ReconSplynxRow } from './paystack-reconcile-types';

export function matchByReference(paystack: ReconPaystackRow, rows: ReconSplynxRow[]): ReconSplynxRow | null {
  const wanted = normalizeReference(paystack.reference);
  if (!wanted) return null;
  return rows.find((row) => normalizeReference(row.reference) === wanted) ?? null;
}

function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function matchByEmailAmountDate(paystack: ReconPaystackRow, rows: ReconSplynxRow[]): ReconSplynxRow | null {
  const email = normalizeEmail(paystack.email);
  if (!email) return null;
  return (
    rows.find(
      (row) =>
        normalizeEmail(row.email) === email &&
        Math.abs(row.amountNaira - paystack.amountNaira) < 0.01 &&
        sameDay(row.paidAt, paystack.paidAt),
    ) ?? null
  );
}

export function classifyReconciliation(paystack: ReconPaystackRow, links: ReconSplynxRow[]): { kind: string; varianceNaira: number } {
  const direct = matchByReference(paystack, links) ?? matchByEmailAmountDate(paystack, links);
  if (!direct) return { kind: 'paystack-only', varianceNaira: paystack.amountNaira };
  const varianceNaira = Math.round((paystack.amountNaira - direct.amountNaira) * 100) / 100;
  if (Math.abs(varianceNaira) >= 0.01) return { kind: 'amount-mismatch', varianceNaira };
  return { kind: 'matched', varianceNaira: 0 };
}
```

Create `src/lib/finance/paystack-reconcile-types.ts` with the two exported interfaces above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- src/lib/finance/__tests__/paystack-reconcile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/paystack-reconcile.ts src/lib/finance/paystack-reconcile-types.ts src/lib/finance/__tests__/paystack-reconcile.test.ts
git commit -m "feat: add paystack reconciliation matching engine"
```

---

### Task 5: Finance overview and transaction APIs

**Files:**
- Create: `src/lib/finance/paystack-aggregates.ts`
- Test: `src/lib/finance/__tests__/paystack-aggregates.test.ts`
- Create: `src/app/api/admin/finance/paystack/overview/route.ts`
- Test: `src/app/api/admin/finance/paystack/overview/__tests__/route.test.ts`
- Create: `src/app/api/admin/finance/paystack/transactions/route.ts`
- Test: `src/app/api/admin/finance/paystack/transactions/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `prisma.paystackTransaction`, `prisma.paystackReconciliationLink`, finance-role helpers, API-response helpers.
- Produces: `GET /api/admin/finance/paystack/overview`, `GET /api/admin/finance/paystack/transactions`.

- [ ] **Step 1: Write failing aggregate tests**

Cover total collected, success rate, channel totals, unmatched value, and empty-input behavior without dividing by zero.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/finance/__tests__/paystack-aggregates.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement aggregates**

Aggregate Prisma rows in memory for v1 with explicit caps and month filtering. Return:

```ts
{
  month: '2026-08',
  kpis: { collectedNaira, successCount, successRate, unmatchedNaira, refundedNaira, disputeCount },
  series: [{ date: '2026-08-01', collectedNaira, count }],
  channels: [{ channel: 'card', collectedNaira, count }],
  regions: [{ region: 'Ogun', collectedNaira, count }],
  recent: [{ reference, customer, amountNaira, channel, status, paidAt }]
}
```

- [ ] **Step 4: Implement the two routes**

Both routes must:

1. Enforce 120/minute rate limiting.
2. Validate origin.
3. Verify Firebase admin auth.
4. Call `requireFinanceViewer`.
5. Return `success(payload)`.
6. Catch errors with `logError` and return `serverError()`.

Transactions route must support `month`, `status`, `channel`, `region`, `segment`, `query`, `page`, and `perPage` query parameters, with `perPage` clamped between 1 and 200.

- [ ] **Step 5: Write route tests**

Mock `@/lib/prisma`, `@/lib/admin-auth`, `@/lib/rate-limit`, and `validateOrigin`, following `src/app/api/admin/emails/bulk/__tests__/route.test.ts`. Assert:

1. Missing auth returns 401.
2. Ordinary admin returns 403.
3. Dorcas returns 200.
4. Invalid pagination returns 400, not 500.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run test:run -- src/lib/finance/__tests__/paystack-aggregates.test.ts src/app/api/admin/finance/paystack/overview/__tests__/route.test.ts src/app/api/admin/finance/paystack/transactions/__tests__/route.test.ts`
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/finance/paystack-aggregates.ts src/lib/finance/__tests__/paystack-aggregates.test.ts src/app/api/admin/finance/paystack/overview src/app/api/admin/finance/paystack/transactions
git commit -m "feat: add paystack overview and transaction apis"
```

---

### Task 6: Reconciliation, exception, customer, and saved-view APIs

**Files:**
- Create: `src/app/api/admin/finance/paystack/reconciliation/route.ts`
- Create: `src/app/api/admin/finance/paystack/exceptions/route.ts`
- Create: `src/app/api/admin/finance/paystack/customers/route.ts`
- Create: `src/app/api/admin/finance/paystack/saved-views/route.ts`
- Test: one `__tests__/route.test.ts` beside each route.

**Interfaces:**
- Consumes: finance-role helpers, reconciliation engine, Prisma ledger models.
- Produces: reconciliation queues, exception assignment/follow-up, customer cohorts, saved-view CRUD boundaries.

- [ ] **Step 1: Write failing route tests**

Assert for each route:

1. Missing auth returns 401.
2. Ordinary admin returns 403.
3. Dorcas can read reconciliation, customers, and saved views.
4. Dorcas receives 403 from exception assignment and saved-view creation.
5. Full finance user can assign an exception and create a saved view.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/app/api/admin/finance/paystack/reconciliation/__tests__/route.test.ts src/app/api/admin/finance/paystack/exceptions/__tests__/route.test.ts src/app/api/admin/finance/paystack/customers/__tests__/route.test.ts src/app/api/admin/finance/paystack/saved-views/__tests__/route.test.ts`
Expected: FAIL with missing routes.

- [ ] **Step 3: Implement reconciliation reads**

`GET /reconciliation` returns `matched`, `paystack-only`, `splynx-only`, `amount-mismatch`, `date-mismatch`, and `duplicate` queues with counts and paginated rows.

- [ ] **Step 4: Implement exception assignment and follow-up**

`POST /exceptions` requires `requireFinanceManager` and accepts:

```json
{
  "exceptionId": "exc_123",
  "ownerEmail": "billing.owner@iworldnetworks.net",
  "followUpAt": "2026-09-20",
  "note": "Called customer; awaiting receipt."
}
```

Append `{ by, at, text }` to history. Do not change reconciliation match outcomes in this endpoint.

- [ ] **Step 5: Implement customers and saved views**

Customers returns payer recency, frequency, lifetime collections, region, segment, and new/returning status. Saved-view reads allow viewers; creation, updates, and deletes require managers and validate `scope`, `filters`, `mode`, and a 191-character name limit.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run test:run -- src/app/api/admin/finance/paystack/reconciliation/__tests__/route.test.ts src/app/api/admin/finance/paystack/exceptions/__tests__/route.test.ts src/app/api/admin/finance/paystack/customers/__tests__/route.test.ts src/app/api/admin/finance/paystack/saved-views/__tests__/route.test.ts`
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/finance/paystack/reconciliation src/app/api/admin/finance/paystack/exceptions src/app/api/admin/finance/paystack/customers src/app/api/admin/finance/paystack/saved-views
git commit -m "feat: add paystack reconciliation and cohort apis"
```

---

### Task 7: Sync, webhook, reports, exports, and snapshots

**Files:**
- Create: `src/lib/finance/paystack-webhook.ts`
- Test: `src/lib/finance/__tests__/paystack-webhook.test.ts`
- Create: `src/app/api/finance/paystack/webhook/route.ts`
- Test: `src/app/api/finance/paystack/webhook/__tests__/route.test.ts`
- Create: `src/app/api/admin/finance/paystack/sync/route.ts`
- Test: `src/app/api/admin/finance/paystack/sync/__tests__/route.test.ts`
- Create: `src/lib/finance/paystack-report.ts`
- Test: `src/lib/finance/__tests__/paystack-report.test.ts`
- Create: `src/app/api/admin/finance/paystack/reports/route.ts`
- Create: `src/app/api/admin/finance/paystack/snapshots/route.ts`
- Test: route tests beside both routes.

**Interfaces:**
- Consumes: sync functions, webhook verification, CSV/snapshot builders, finance-role helpers.
- Produces: verified webhook ingestion, manager-only sync, CSV exports, manager-only snapshot freezing, viewer-readable snapshots.

- [ ] **Step 1: Write failing webhook tests**

```ts
import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import { verifyPaystackSignature } from '../paystack-webhook';

describe('paystack webhook signature', () => {
  it('accepts a valid signature', () => {
    const secret = 'test-secret';
    const body = '{"event":"charge.success"}';
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(verifyPaystackSignature('{"event":"x"}', 'bad', 'test-secret')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/finance/__tests__/paystack-webhook.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement signature verification**

```ts
import { timingSafeEqual } from 'crypto';

export function verifyPaystackSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = `sha512=${createHmac('sha512', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Handle both `x-paystack-signature` formats used by Paystack: raw hex and `sha512=`-prefixed hex.

- [ ] **Step 4: Implement webhook ingestion**

Read `await request.text()` before JSON parsing, verify signature, ignore unsupported events, upsert supported transaction events idempotently, and always return 200 for verified duplicate deliveries.

- [ ] **Step 5: Implement manager-only sync**

`POST /sync` requires `requireFinanceManager`, enforces 10/minute, accepts `{ maxPages, statuses }`, and returns `{ fetched, upserted, skipped, failed }`.

- [ ] **Step 6: Implement reports and snapshots**

Reports route supports `format=csv|json`, `scope=transactions|reconciliation|exceptions|customers|snapshot`, and viewer access. Snapshot creation requires manager access, validates `month`, freezes totals/channels/regions/segments/reconciliation/exceptions, and uses explicit read-then-create/update.

CSV builder must escape commas, quotes, and newlines. Transaction-level detail is CSV-only; PDF table data is supplied for overview, reconciliation summary, customer summary, and snapshots.

- [ ] **Step 7: Run tests and typecheck**

Run: `npm run test:run -- src/lib/finance/__tests__/paystack-webhook.test.ts src/lib/finance/__tests__/paystack-report.test.ts src/app/api/finance/paystack/webhook/__tests__/route.test.ts src/app/api/admin/finance/paystack/sync/__tests__/route.test.ts`
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/finance/paystack-webhook.ts src/lib/finance/__tests__/paystack-webhook.test.ts src/app/api/finance/paystack/webhook src/app/api/admin/finance/paystack/sync src/lib/finance/paystack-report.ts src/lib/finance/__tests__/paystack-report.test.ts src/app/api/admin/finance/paystack/reports src/app/api/admin/finance/paystack/snapshots
git commit -m "feat: add paystack sync webhook reports and snapshots"
```

---

### Task 8: Finance layout and overview UI

**Files:**
- Create: `src/app/admin/finance/paystack/layout.tsx`
- Create: `src/app/admin/finance/paystack/page.tsx`
- Create: `src/components/finance/paystack/FinanceKpiCards.tsx`
- Create: `src/components/finance/paystack/CollectionsTrendChart.tsx`
- Create: `src/components/finance/paystack/ChannelDonut.tsx`
- Create: `src/components/finance/paystack/BreakdownBars.tsx`
- Create: `src/components/finance/paystack/CollectionFunnel.tsx`
- Create: `src/components/finance/paystack/RecentCollections.tsx`
- Test: `src/components/finance/paystack/__tests__/FinanceKpiCards.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/finance/paystack/overview`, Firebase `useUser`, Recharts, Lucide icons.
- Produces: scoped dark finance layout and data-driven overview page.

- [ ] **Step 1: Write a failing component test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FinanceKpiCards } from '../FinanceKpiCards';

describe('FinanceKpiCards', () => {
  it('renders collected revenue and success rate', () => {
    render(<FinanceKpiCards kpis={{ collectedNaira: 43500, successCount: 12, successRate: 92.3, unmatchedNaira: 1000, refundedNaira: 0, disputeCount: 1 }} />);
    expect(screen.getByText('₦43,500')).toBeInTheDocument();
    expect(screen.getByText('92.3%')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/finance/paystack/__tests__/FinanceKpiCards.test.tsx`
Expected: FAIL with missing component.

- [ ] **Step 3: Implement the scoped finance layout**

Create a dark finance shell scoped only to `/admin/finance/paystack`. Do not alter global light-theme styles. Include finance sidebar links for Overview, Transactions, Reconciliation, Customers, and Reports, plus loading and access-denied states.

- [ ] **Step 4: Implement overview components**

Use Recharts area/bar/pie primitives through the repository chart pattern. Charts must handle empty data explicitly and format Naira with `₦` plus `en-NG` locale grouping.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run test:run -- src/components/finance/paystack/__tests__/FinanceKpiCards.test.tsx`
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/finance/paystack/layout.tsx src/app/admin/finance/paystack/page.tsx src/components/finance/paystack
git commit -m "feat: add paystack finance overview ui"
```

---

### Task 9: Transactions, reconciliation, customers, and reports UI

**Files:**
- Create: `src/app/admin/finance/paystack/transactions/page.tsx`
- Create: `src/app/admin/finance/paystack/reconciliation/page.tsx`
- Create: `src/app/admin/finance/paystack/customers/page.tsx`
- Create: `src/app/admin/finance/paystack/reports/page.tsx`
- Create: `src/components/finance/paystack/TransactionsTable.tsx`
- Create: `src/components/finance/paystack/ExceptionQueue.tsx`
- Create: `src/components/finance/paystack/SavedViewBar.tsx`
- Create: `src/components/finance/paystack/ExportButtons.tsx`
- Test: `src/components/finance/paystack/__tests__/TransactionsTable.test.tsx`

**Interfaces:**
- Consumes: finance transactions, reconciliation, customers, saved-view, report, exception, and snapshot APIs.
- Produces: four working pages with shared filter, saved-view, export, and exception-assignment behavior.

- [ ] **Step 1: Write a failing table test**

Assert reference, customer, amount, channel, payment status, reconciliation status, and variance render for representative rows, including an empty-state message when there are no rows.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/components/finance/paystack/__tests__/TransactionsTable.test.tsx`
Expected: FAIL with missing component.

- [ ] **Step 3: Implement transactions and reconciliation pages**

Transactions page must include search, status/channel/date filters, pagination, chart/table switching, saved-view controls, and CSV export. Reconciliation page must include the six queues, owner assignment, follow-up dates, notes, assignment lifecycle status, and audit history. Dorcas must not see assignment controls.

- [ ] **Step 4: Implement customers and reports pages**

Customers page must include payer table, new/returning analysis, cohort grouping, and follow-up lists. Reports page must include saved-view reruns, CSV downloads, management PDF generation, snapshot freezing for managers, and snapshot viewing for Dorcas.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run test:run -- src/components/finance/paystack/__tests__/TransactionsTable.test.tsx`
Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/finance/paystack/transactions src/app/admin/finance/paystack/reconciliation src/app/admin/finance/paystack/customers src/app/admin/finance/paystack/reports src/components/finance/paystack/TransactionsTable.tsx src/components/finance/paystack/ExceptionQueue.tsx src/components/finance/paystack/SavedViewBar.tsx src/components/finance/paystack/ExportButtons.tsx src/components/finance/paystack/__tests__/TransactionsTable.test.tsx
git commit -m "feat: add paystack finance workbench ui"
```

---

### Task 10: Staging verification and production rollout

**Files:**
- Test: `e2e/paystack-finance.spec.ts`
- Modify: staging checklist or finance rollout notes if the repository has an applicable existing file.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified staging backfill, webhook delivery, reports, exports, snapshots, and role boundaries.

- [ ] **Step 1: Add staging end-to-end coverage**

Cover finance login, overview load, transaction search, reconciliation queue load, exception assignment as manager, forbidden assignment as Dorcas, CSV download, snapshot creation, and snapshot rerun. Use staging-only credentials and never production secrets.

- [ ] **Step 2: Run targeted automated checks**

Run: `npm run test:run`
Run: `npm run typecheck`
Run: `npm run lint:check`
Expected: PASS.

- [ ] **Step 3: Run staging browser checks**

Run: `npm run test:e2e -- e2e/paystack-finance.spec.ts`
Expected: PASS against staging only.

- [ ] **Step 4: Verify production prerequisites**

Confirm rotated server-side secret, webhook endpoint decision, staging backfill counts, reconciliation coverage, Dorcas view/export-only behavior, CSV/PDF outputs, and snapshot immutability.

- [ ] **Step 5: Commit**

```bash
git add e2e/paystack-finance.spec.ts
git commit -m "test: add paystack finance staging coverage"
```

---

## Self-Review

- Spec coverage: ledger persistence, matching, exceptions, saved views, snapshots, five pages, trends/tables/exports, dimensions, finance access, audit, and testing all have tasks.
- Placeholder scan: no unfinished markers, vague validation language, cross-task shorthand, or missing type/interface definitions remain.
- Type consistency: `ReconPaystackRow`, `ReconSplynxRow`, finance helpers, CSV builders, API payloads, and UI props use the same names across tasks.
