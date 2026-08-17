# Sales: Nav Icons, Agent Dashboard Visibility, Record-Update Speed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add icons to the sales menu links, let sales agents see the full dashboard (records stay agent-scoped), and remove the slow BTS re-resolution + awaited Firestore mirrors from record saves.

**Architecture:** Three independent changes: (1) render the existing `item.icon` from `salesNavItems` in the desktop pill nav and add `Upload`/`Database` icons to the dashboard's Import/Records buttons; (2) remove the per-record agent filter in the metrics and monthly-revenue API routes while keeping the access gate (super-admin / editor / linked agent); (3) make record updates fast: PUT uses the submitted `bts` instead of always re-resolving, `resolveCustomerBts` caches the 2,801-row UISP endpoint list in-process via the existing `withCache` helper (5-min TTL), and the Firestore mirrors become fire-and-forget.

**Tech Stack:** Next.js App Router (TS), lucide-react, Prisma + MariaDB, Firebase Admin (mirror only), vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-sales-nav-icons-dashboard-visibility-and-record-speed-design.md`

## Global Constraints

- Records list stays agent-scoped: `src/app/api/admin/sales/records/route.ts` GET, `records/page.tsx`, and `src/app/api/admin/sales/export/route.ts` are **NOT changed** except the exact PUT/mirror edits in Task 6.
- Access gate rule (both Task 3 and Task 4): a caller who is not a super-admin AND not an editor must be a linked sales agent (`salesAgentForEmail`), else `return error('Your account is not linked to a sales agent.', 403)`.
- Use the existing `withCache` from `@/lib/route-cache` — no new dependencies, no new cache machinery.
- Icons come from lucide-react only (already a dependency).
- Do not touch quarter/month/region logic in `sales-staff.ts` or `bts-data.ts`; the ported logic in `scripts/import-sales.mjs` is out of scope.
- Verification baseline: `npx tsc --noEmit` = 0 errors, `npx vitest run` = 426 passing, `npm run build` green.

---

### Task 1: Icons in the SalesLayout desktop pill nav

**Files:**
- Modify: `src/components/layout/SalesLayout.tsx:140-153`

**Interfaces:**
- Consumes: `salesNavItems` array (already defined, lines 34–44) — each item has `name`, `href`, `icon`.
- Produces: desktop pill nav that renders icon + label, matching the mobile sheet's look.

- [ ] **Step 1: Edit the desktop pill nav to render the icon**

Replace the desktop nav map (lines 140–153) so each pill renders `<item.icon>` before the label:

```tsx
          <nav className="hidden md:flex items-center gap-1 ml-6">
            {salesNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-full font-mono text-[10px] uppercase font-bold tracking-wider transition-all',
                  pathname === item.href ? 'bg-secondary text-white' : 'text-on-surface-variant hover:bg-surface-container-low',
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.name}
              </Link>
            ))}
          </nav>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors (no imports needed — icons are already imported in this file).

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/SalesLayout.tsx
git commit -m "feat(sales): icons in sales pill nav"
```

---

### Task 2: Icons on the sales dashboard buttons

**Files:**
- Modify: `src/app/admin/sales/page.tsx:661-674` (empty-state buttons), `src/app/admin/sales/page.tsx:707-720` (header buttons), and the lucide import block (lines 1–40).

**Interfaces:**
- Consumes: `Upload` and `Database` lucide icons (Database already imported; Upload must be added).
- Produces: Import/Import CSV buttons with `Upload` icon; Records/Add Record buttons with `Database` icon.

- [ ] **Step 1: Add the `Upload` import**

Replace line 7:

```tsx
import { TrendingUp, Users, Activity, Banknote, BarChart3, Database, AlertCircle, Megaphone, FileDown } from 'lucide-react';
```

with:

```tsx
import { TrendingUp, Users, Activity, Banknote, BarChart3, Database, AlertCircle, Megaphone, FileDown, Upload } from 'lucide-react';
```

- [ ] **Step 2: Add icons to the header buttons (lines 707–720)**

```tsx
          <div className="flex gap-3 shrink-0">
            <Link
              href="/admin/sales/import"
              className="flex items-center gap-1.5 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-5 py-2.5 hover:scale-105 transition-transform shadow-lg"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </Link>
            <Link
              href="/admin/sales/records"
              className="flex items-center gap-1.5 rounded-full border border-border font-mono text-[10px] uppercase font-bold px-5 py-2.5 hover:bg-surface-container-low transition-all"
            >
              <Database className="w-3.5 h-3.5" />
              Records
            </Link>
          </div>
```

- [ ] **Step 3: Add icons to the empty-state buttons (lines 661–674)**

```tsx
          <div className="flex gap-4 pt-2">
            <Link
              href="/admin/sales/import"
              className="flex items-center gap-1.5 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 py-3 hover:scale-105 transition-transform shadow-lg"
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </Link>
            <Link
              href="/admin/sales/records"
              className="flex items-center gap-1.5 rounded-full border border-border font-mono text-[10px] uppercase font-bold px-8 py-3 hover:bg-surface-container-low transition-all"
            >
              <Database className="w-3.5 h-3.5" />
              Add Record
            </Link>
          </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/sales/page.tsx
git commit -m "feat(sales): icons on dashboard import/records buttons"
```

---

### Task 3: Agents see the full metrics dashboard (gate kept)

**Files:**
- Modify: `src/app/api/admin/sales/metrics/route.ts:3` (import), `src/app/api/admin/sales/metrics/route.ts:62-71` (filter/gate).

**Interfaces:**
- Consumes: `isEditor` from `@/lib/admin-config` (exists, line 13).
- Produces: metrics GET returns company-wide data to any super-admin, editor, or linked agent; unlinked callers still get 403.

- [ ] **Step 1: Add the `isEditor` import**

Replace line 3:

```ts
import { isSuperAdmin, isEditor, salesAgentForEmail } from '@/lib/admin-config';
```

- [ ] **Step 2: Replace the agent filter with an access gate**

Replace lines 62–71:

```ts
    let records = await listSalesRecordsDb();
```

with:

```ts
    const records = await listSalesRecordsDb();
```

and replace the block:

```ts
    // Agents see only their own records everywhere on the dashboard.
    if (!isSuperAdmin(admin.email)) {
      const callerAgent = salesAgentForEmail(admin.email);
      if (!callerAgent) {
        return error('Your account is not linked to a sales agent.', 403);
      }
      records = records.filter((r) => r.salesAgent === callerAgent);
    }
```

with:

```ts
    // Agents see the full company dashboard; access stays gated to
    // super-admins, editors, and linked sales agents.
    if (!isSuperAdmin(admin.email) && !isEditor(admin.email)) {
      const callerAgent = salesAgentForEmail(admin.email);
      if (!callerAgent) {
        return error('Your account is not linked to a sales agent.', 403);
      }
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors (`let` → `const` is safe — `records` is no longer reassigned).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/sales/metrics/route.ts
git commit -m "feat(sales): agents see full dashboard metrics"
```

---

### Task 4: Agents see the full monthly-revenue page (gate kept)

**Files:**
- Modify: `src/app/api/admin/sales/monthly-revenue/route.ts:3` (import), `:6` (import), `:104-115` (gate + agent filter), `:131` (effectiveAgent).

**Interfaces:**
- Consumes: `isEditor` from `@/lib/admin-config`; `error` from `@/lib/api-response` (NOT currently imported in this file — Step 1 adds it).
- Produces: monthly-revenue GET returns company-wide data to any super-admin, editor, or linked agent; unlinked callers get 403; the `?agent=` query filter still works for everyone.

- [ ] **Step 1: Add the `isEditor` and `error` imports**

Replace line 3:

```ts
import { isSuperAdmin, isEditor, salesAgentForEmail } from '@/lib/admin-config';
```

Replace line 6 (add `error` after `success`):

```ts
import { success, error, unauthorized, tooMany, forbidden, serverError, validateOrigin } from '@/lib/api-response';
```

- [ ] **Step 2: Replace the caller scoping with a gate + optional agent filter**

Replace lines 104–115:

```ts
    // Agents only ever see their own numbers.
    const callerAgent = !isSuperAdmin(admin.email) ? salesAgentForEmail(admin.email) : undefined;

    // Filter by region if specified
    let filteredRecords = records;
    if (region) {
      filteredRecords = records.filter((r) => r.region === region);
    }
    // Filter by agent if specified (or forced to the caller's own name)
    if (agent || callerAgent) {
      filteredRecords = filteredRecords.filter((r) => r.salesAgent === (callerAgent || agent));
    }
```

with:

```ts
    // Agents see the full company dashboard; access stays gated to
    // super-admins, editors, and linked sales agents.
    if (!isSuperAdmin(admin.email) && !isEditor(admin.email) && !salesAgentForEmail(admin.email)) {
      return error('Your account is not linked to a sales agent.', 403);
    }

    // Filter by region if specified
    let filteredRecords = records;
    if (region) {
      filteredRecords = records.filter((r) => r.region === region);
    }
    // Filter by agent if specified (no longer forced to the caller's own name)
    if (agent) {
      filteredRecords = filteredRecords.filter((r) => r.salesAgent === agent);
    }
```

- [ ] **Step 3: Drop the now-dead `callerAgent` reference**

Replace line 131:

```ts
    const effectiveAgent = callerAgent || agent;
```

with:

```ts
    const effectiveAgent = agent;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors (no other references to `callerAgent` exist in this file).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/sales/monthly-revenue/route.ts
git commit -m "feat(sales): agents see full monthly revenue page"
```

---

### Task 5: Cache the UISP endpoint list in `resolveCustomerBts`

**Files:**
- Modify: `src/lib/bts-resolver.ts:1` (import), `:81-87` (endpoint fetch).

**Interfaces:**
- Consumes: `withCache(key, ttlMs, loader)` from `@/lib/route-cache` (in-process TTL cache; loader returns the cached value; stale entries refresh in background).
- Produces: `resolveCustomerBts(customerName, endpoints?)` keeps its exact signature and behavior; the no-injection path reads the endpoint list from a 5-minute in-process cache instead of hitting MariaDB on every call.

- [ ] **Step 1: Add the `withCache` import**

Replace line 1:

```ts
import { prisma } from '@/lib/prisma';
```

with:

```ts
import { prisma } from '@/lib/prisma';
import { withCache } from './route-cache';
```

(Note: `bts-resolver.ts` sits in `src/lib/`, so the relative import is `'./route-cache'` — do not use the `@/` alias here to stay consistent with the file's existing import style.)

- [ ] **Step 2: Wrap the endpoint query in the cache**

Replace lines 81–87:

```ts
  let uispEndpoints = endpoints;
  if (!uispEndpoints) {
    uispEndpoints = await prisma.uispSite.findMany({
      where: { type: 'endpoint' },
      select: { id: true, name: true, type: true, btsId: true, btsName: true },
    });
  }
```

with:

```ts
  let uispEndpoints = endpoints;
  if (!uispEndpoints) {
    // The endpoint list only changes on the hourly UISP sync; a 5-minute TTL
    // avoids a full 2,800-row table read + scoring pass on every save/import.
    uispEndpoints = await withCache('uisp-endpoints', 5 * 60 * 1000, () =>
      prisma.uispSite.findMany({
        where: { type: 'endpoint' },
        select: { id: true, name: true, type: true, btsId: true, btsName: true },
      }),
    );
  }
```

- [ ] **Step 3: Run the test suite (existing bts-resolver behavior must not change)**

Run: `npx vitest run`
Expected: 426 passing (tests inject `endpoints` explicitly, so the cached default path is not exercised by them — that is fine; the injected path is unchanged).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bts-resolver.ts
git commit -m "perf(sales): cache uisp endpoints in resolveCustomerBts"
```

---

### Task 6: Fast record updates — prefer submitted BTS, fire-and-forget mirrors

**Files:**
- Modify: `src/app/api/admin/sales/records/route.ts:213-219` (PUT bts), `:160` (POST mirror), `:235` (PUT mirror), `:291` (DELETE mirror).

**Interfaces:**
- Consumes: `mirrorSalesRecordCreated/Updated/Deleted` from `@/lib/sales-db` (already swallow and log their own errors), `resolveRecordBts` (defined in this file, lines 31–35).
- Produces: PUT uses the form-submitted `bts` when present (falling back to resolution only when it is empty and location/customerName changed); all three Firestore mirrors no longer block the response.

- [ ] **Step 1: Make the PUT prefer the submitted `bts`**

Replace lines 213–219:

```ts
    const updated = await updateSalesRecordDb(id, {
      ...changes,
      region: changes.location ? getRegionForLocation(changes.location) : undefined,
      segment: changes.planCode ? getSegmentForPlan(changes.planCode) : undefined,
      bts: changes.location || changes.customerName ? (await resolveRecordBts(changes.customerName || prev.customerName, changes.location || prev.location)) : undefined,
      updatedAt: Date.now(),
    });
```

with:

```ts
    // The edit form always submits bts; only fall back to UISP resolution when
    // it is empty AND the customer/location actually changed. This removes the
    // full UISP endpoint scan from the common edit path.
    const updated = await updateSalesRecordDb(id, {
      ...changes,
      region: changes.location ? getRegionForLocation(changes.location) : undefined,
      segment: changes.planCode ? getSegmentForPlan(changes.planCode) : undefined,
      bts:
        changes.bts ||
        (changes.location || changes.customerName ? await resolveRecordBts(changes.customerName || prev.customerName, changes.location || prev.location) : undefined),
      updatedAt: Date.now(),
    });
```

- [ ] **Step 2: Fire-and-forget the POST mirror**

Replace line 160:

```ts
    await mirrorSalesRecordCreated(doc);
```

with:

```ts
    void mirrorSalesRecordCreated(doc);
```

- [ ] **Step 3: Fire-and-forget the PUT mirror**

Replace line 235:

```ts
    await mirrorSalesRecordUpdated(id, changes);
```

with:

```ts
    void mirrorSalesRecordUpdated(id, changes);
```

- [ ] **Step 4: Fire-and-forget the DELETE mirror**

Replace line 291:

```ts
    await mirrorSalesRecordDeleted(body.id, now, now);
```

with:

```ts
    void mirrorSalesRecordDeleted(body.id, now, now);
```

- [ ] **Step 5: Typecheck + full test suite + build**

Run: `npx tsc --noEmit`
Expected: 0 errors.

Run: `npx vitest run`
Expected: 426 passing.

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/sales/records/route.ts
git commit -m "perf(sales): fast record updates - prefer submitted bts, non-blocking mirrors"
```

---

### Task 7: Deploy and verify on prod

**Files:**
- None (follow `docs/DEPLOY-PROCEDURE.md`).

**Interfaces:**
- Consumes: everything from Tasks 1–6 (must be committed).
- Produces: the running prod app with all three changes, health-checked.

- [ ] **Step 1: Take a rollback snapshot**

```bash
SSH_PASS="$(sed -n 's/^PASSWORD=//p' .deploy-credentials.local)"
plink -ssh -batch -pw "$SSH_PASS" "root@92.112.194.251" \
  "cd /home/csat.iwn.ng && tar czf /home/backup/csat-pre-deploy-\$(date +%F-%H%M).tar.gz --exclude=node_modules --exclude=.next --exclude=.env --exclude=logs ."
```

Expected: tarball appears in `/home/backup/csat-pre-deploy-*.tar.gz`.

- [ ] **Step 2: Build and upload the tarball**

```bash
tar czf /c/Users/NGFEP/AppData/Local/Temp/opencode/csat-deploy.tar.gz \
  --exclude=.git --exclude=node_modules --exclude=.next \
  --exclude='.env*' --exclude=.deploy-credentials.local \
  --exclude=logs --exclude=public_html \
  -C /c/Users/NGFEP/Downloads/project .
pscp -batch -pw "$SSH_PASS" /c/Users/NGFEP/AppData/Local/Temp/opencode/csat-deploy.tar.gz "root@92.112.194.251":/tmp/
```

Expected: upload completes (slow link — allow ~10 min; verify `ls -la /tmp/csat-deploy.tar.gz` size matches local before extracting).

- [ ] **Step 3: Extract, install, build, restart**

```bash
plink -ssh -batch -pw "$SSH_PASS" "root@92.112.194.251" \
  "cd /home/csat.iwn.ng && tar xzf /tmp/csat-deploy.tar.gz && rm /tmp/csat-deploy.tar.gz && npm install --no-audit --no-fund && npm run build && pm2 restart csat --update-env && pm2 save"
```

Expected: install + build complete, `pm2 restart` confirms app online.

- [ ] **Step 4: Health check**

```bash
plink -ssh -batch -pw "$SSH_PASS" "root@92.112.194.251" \
  "sleep 4; curl -s -o /dev/null -w 'health: %{http_code}\n' https://csat.iwn.ng/api/health; pm2 ls | grep csat"
```

Expected: `health: 200`, app `online`.

- [ ] **Step 5: Smoke-test the save path**

Log into https://csat.iwn.ng as an admin (super-admin or editor), open a sales record, change any field, and save. Expected: the save completes quickly (previously it waited on the UISP scan + Firestore mirror). Also verify the dashboard and Monthly Revenue pages still load, and that the records list still shows only the logged-in agent's records when signed in as a non-super-admin agent.
