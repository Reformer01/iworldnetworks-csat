# Sales: Nav Icons, Agent Dashboard Visibility, Record-Update Speed

Date: 2026-08-17 · Status: approved design (user) · Applies to: csat.iwn.ng admin (Next.js + MariaDB + Firestore mirror)

## Goal

Three changes to the Sales admin area:

1. **Icons** on the sales KPI menu links (desktop pill nav + dashboard header buttons).
2. **Full dashboard visibility for agents** — agents see all company sales data on the dashboard; the records list stays agent-scoped.
3. **Fix slow record updates** ("BTS and other updates on records are taking too long").

## 1. Icons on sales menu links

`SalesLayout.tsx` already defines an icon per nav item (`salesNavItems`) and renders them in the mobile sheet; the desktop pill nav (lines 140–153) renders labels only. The dashboard header buttons and the empty-state buttons (sales/page.tsx) are label-only pills.

- SalesLayout desktop pill nav: add `<item.icon className="w-3.5 h-3.5" />` before the label; pill becomes `flex items-center gap-1.5`. Icon inherits the pill's text color (white when active, on-surface-variant otherwise).
- sales/page.tsx header CTAs: `Import` → `Upload` icon; `Records` → `Database` icon; `flex items-center gap-1.5`.
- sales/page.tsx empty-state CTAs (`Import CSV`, `Add Record`): same two icons.
- Add `Upload` to the lucide imports in sales/page.tsx (Database already imported).

## 2. Agents see the full dashboard

Currently `metrics/route.ts` (lines 64–71) filters records to the caller's own agent name for non-super-admins, and `monthly-revenue/route.ts` (lines 105–114) does the same. Records list (records route + page) and export stay agent-scoped.

- metrics/route.ts: remove the per-record agent filter. Keep the access gate: non-super-admins must still be a linked sales agent or an editor, else 403 (no open data to arbitrary `@iwn.ng` staff).
- monthly-revenue/route.ts: same — remove the callerAgent filter; keep the gate (linked agent/editor/super-admin).
- records route, records page, export route: untouched.

## 3. Slow record updates — root cause and fix

Tracing the save path (POST/PUT /api/admin/sales/records) found three compounding causes:

**A. Full UISP table scan on every save.** `resolveCustomerBts` (bts-resolver.ts) runs `prisma.uispSite.findMany({ where: { type: 'endpoint' } })` — 2,801 rows — plus a per-row token-scoring loop, on every create/update that resolves BTS. This dominates save latency.

**B. PUT ignores the submitted BTS.** The edit form already sends `bts` (records/page.tsx line 394), but PUT (route line 217) unconditionally re-resolves whenever location/customerName changed. POST (line 135) correctly prefers `data.bts`.

**C. Awaited Firestore mirrors.** POST/PUT/DELETE `await` the best-effort mirrors (`mirrorSalesRecordCreated/Updated/Deleted`) despite the code comment "never blocks" — every save waits on a cross-service round trip; a slow/hanging Firestore adds seconds.

Fixes:

1. PUT: prefer the submitted value — `bts: changes.bts ?? (changes.location || changes.customerName ? await resolveRecordBts(...) : undefined)`. Normal edits then skip resolution entirely.
2. Cache the UISP endpoint list in-process with the existing `withCache` helper (route-cache.ts), TTL 5 min, inside `resolveCustomerBts`. Any remaining resolution (POST without bts, CSV import API) becomes a single in-memory read + score instead of a 2,801-row query per call.
3. Fire-and-forget the mirrors: `void mirrorSalesRecordCreated(doc)`, `void mirrorSalesRecordUpdated(...)`, `void mirrorSalesRecordDeleted(...)` — the functions already swallow and log errors internally.

## Files touched

- `src/components/layout/SalesLayout.tsx` — icons in desktop pill nav
- `src/app/admin/sales/page.tsx` — header + empty-state button icons, Upload import
- `src/app/api/admin/sales/metrics/route.ts` — remove agent filter, keep gate
- `src/app/api/admin/sales/monthly-revenue/route.ts` — remove agent filter, keep gate
- `src/app/api/admin/sales/records/route.ts` — PUT prefers submitted bts; fire-and-forget mirrors
- `src/lib/bts-resolver.ts` — cache endpoint list via withCache (5-min TTL)

## Verification

- `npx tsc --noEmit` (0 errors), `npm run build`, `npx vitest run` (426 passing).
- Prod timing script (node on server): time `resolveCustomerBts` cold vs warm (cached) on sample customer names — warm must be ms-scale vs the multi-hundred-ms cold scan.
- Manual: save a record in the UI on prod after deploy — update returns quickly even when Firestore mirroring lags.

## Trade-offs / risks

- Cached endpoints may lag the hourly UISP sync by ≤5 min; worst case a new tower isn't attributed yet and the location-based fallback BTS is used. Harmless, self-heals.
- Firestore mirrors now genuinely fire-and-forget: a failed mirror is logged, never retried, and never blocks the save. Matches the existing "never blocks" intent.
- `withCache` is per-process; prod runs a single PM2 fork, so one shared cache.
- Dashboard visibility change applies to all linked agents — same data as super-admins see on the dashboard; write permissions (records) are unchanged.
