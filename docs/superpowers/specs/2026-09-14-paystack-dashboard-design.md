# Paystack Transactions Dashboard — Design Spec

Date: 2026-09-14
Status: User-approved design sections; awaiting written-spec review before implementation planning.
Scope: v1 Paystack finance dashboard for I-World Networks.

## Goals

Build a premium, versatile Paystack transactions dashboard for deep financial analysis and management reporting.

The dashboard must support:

- Overview KPIs and trends.
- Transaction exploration.
- Paystack-versus-Splynx reconciliation.
- Customer and cohort payment analysis.
- Saved views and CSV/PDF reports.
- Exception investigation and follow-up.

## Non-goals

- No cloning of the reference product’s code, assets, brand, icons, or text.
- No new public payment-collection flow.
- No automatic correction of Splynx financial records from Paystack.
- No broad admin access to gateway financial data.

## Locked decisions

- Source of truth: both Paystack and Splynx are persisted and reconciled.
- Ingestion: full Paystack history import, then webhook plus on-demand refresh.
- Matching: reference-first; fallback to normalized email plus amount and paid date.
- Exceptions: assign and follow up only; matching/status changes stay restricted.
- Access: super admins plus Segun and Stella have full finance rights.
- Dorcas Olayoole has view/export-only finance rights.
- Reporting dimensions: channel/status, region, product segment, new/returning payers, refunds/disputes.
- Visual direction: original dark premium I-World finance theme, scoped to the Paystack finance route.

## Architecture

Use a reconciliation-ledger architecture.

### Data model

- `PaystackTransaction`
  - Existing gateway cache.
  - Expand ingestion beyond success-only to support failure recovery and dispute analysis.
  - Retain raw gateway payloads as reconciliation evidence.

- `SplynxIncomeLedger`
  - Normalized Splynx payment/income rows.
  - Preserve Splynx identifiers, customer identifiers, references, amounts, dates, product classification, region, tax, discounts, and notes.

- `PaystackReconciliationLink`
  - Links one Paystack transaction to zero or more Splynx income rows.
  - Stores match method, confidence, matched amount, variance, and matching metadata.

- `ReconciliationException`
  - Represents unmatched or mismatched rows.
  - Stores exception type, owner, status, follow-up date, notes, and resolution history.
  - Matching/status changes remain restricted; assignment and follow-up are the normal workflow.

- `PaystackSavedView`
  - Stores reusable filters, grouping, metric selection, and chart/table mode.
  - Supports rerunning the same deep-dive scenario.

- `PaystackMonthlySnapshot`
  - Freezes monthly KPIs and actuals for management reporting.
  - Prevents previous-month and YTD drift after backfills or edits.

### Data flow

1. Backfill Paystack history.
2. Normalize gateway amounts, currencies, channels, statuses, customers, and timestamps.
3. Import or map Splynx income/payment rows.
4. Run deterministic reference-first matching.
5. Apply email/amount/date fallback matching where reference matching fails.
6. Classify rows as matched, Paystack-only, Splynx-only, or amount/date mismatch.
7. Surface exceptions for assignment and follow-up.
8. Publish dashboard aggregates, reports, exports, and monthly snapshots.

Sync jobs must be idempotent and record fetched, upserted, skipped, matched, unmatched, and failed counts.

## Matching rules

Primary rule:

- Match Paystack reference against Splynx receipt/payment references.

Fallback rule:

- Match normalized customer email plus amount plus paid date.
- Preserve candidate evidence and confidence.
- Do not auto-resolve ambiguous matches.

Mismatch rules:

- Flag currency differences separately from amount differences.
- Flag date-window differences separately from missing Splynx rows.
- Flag duplicate references and duplicate Splynx payment identifiers as exceptions.

## Pages and components

### Finance navigation

Add a dedicated Paystack finance section with:

- Overview.
- Transactions.
- Reconciliation.
- Customers.
- Reports.

### Overview

- Collected revenue.
- Successful transactions.
- Success rate.
- Unmatched value.
- Refunds/disputes.
- Collections-over-time chart.
- Channel mix chart.
- Payment-source/status breakdown.
- Top regions.
- Collection funnel.
- Recent collections.

### Transactions explorer

- Search by reference, customer, email, amount, and gateway response.
- Filter by date, channel, status, region, product segment, new/returning payer, refund/dispute state, and reconciliation state.
- Table columns for reference, customer, date, amount, channel, gateway status, reconciliation status, and variance.
- Row actions for viewing evidence, assigning exceptions, setting follow-up, and exporting selected rows.

### Reconciliation workbench

Separate queues for:

- Matched rows.
- Paystack-only rows.
- Splynx-only rows.
- Amount mismatches.
- Date mismatches.
- Duplicate/reference collisions.

Each exception supports owner assignment, follow-up date, notes, assignment/follow-up lifecycle status, and audit history. Reconciliation match outcomes themselves are not editable through this workflow.

### Customers and cohorts

- Payer list with lifetime collections, transaction count, recency, and frequency.
- New versus returning payer analysis.
- Region and product-segment cohorts.
- Failed-payment and at-risk collections follow-up lists.

### Reports

- Saved views with filters, grouping, metrics, and chart/table mode.
- Transaction-level CSV exports.
- Reconciliation-ledger CSV exports.
- Exception-queue CSV exports.
- Customer/cohort CSV exports.
- Management-ready PDF reports.
- Frozen monthly snapshots.

## Visual system

Use an original dark premium finance theme scoped to the Paystack finance route.

Design characteristics:

- Compact finance sidebar.
- Large page title and period selector.
- Rounded dark cards.
- High-contrast KPI numerals.
- Muted secondary descriptions.
- Pill statuses for payment and reconciliation states.
- Dense but readable tables.
- Analytics-style charts with consistent spacing.

Implementation uses the repository’s existing Recharts, chart primitives, Lucide icons, and responsive layout patterns. Tables use horizontal scrolling and priority columns on small screens.

Explicit loading, empty, error, and no-results states are required for every major view.

## Reporting behavior

Every major view supports:

- Date-range selection.
- Channel and status filtering.
- Region filtering.
- Product-segment filtering.
- New/returning payer filtering.
- Refund/dispute filtering.
- Reconciliation-state filtering.
- Chart/table switching.
- Saved-view creation and reruns.
- CSV export.
- PDF export for overview, reconciliation summary, customer/cohort summary, and monthly snapshots; transaction-level detail is CSV-only.

Monthly snapshots freeze:

- Collected revenue.
- Transaction counts.
- Success/failure counts.
- Channel totals.
- Regional totals.
- Product-segment totals.
- Reconciliation variance.
- Exception counts.

## Access control

Full finance access:

- Existing super admins.
- Segun.
- Stella.

Full rights include viewing, syncing, assigning exceptions, following up, exporting, managing saved views, and freezing snapshots.

View/export-only access:

- Dorcas Olayoole through `dorcas.olayoole@iworldnetworks.net`.

Dorcas may view dashboards, use saved views, and export reports. She may not sync, assign exceptions, change matching/status, or freeze snapshots.

All other admins have no Paystack finance access.

## Security and audit

- Require Firebase admin authentication on every finance API route.
- Add a dedicated finance-role authorization check.
- Restrict sync, assignment, follow-up, export, saved-view management, and snapshot actions by role.
- Verify Paystack webhook signatures.
- Reject invalid webhook payloads without changing ledger state.
- Keep secrets only in server environment variables.
- Minimize customer PII in derived reporting views.
- Audit sync operations, assignments, follow-ups, exports, saved-view changes, and snapshots.

## Error handling

- Invalid webhook signatures are rejected and logged.
- Failed sync pages do not publish incomplete monthly aggregates as successful.
- Ambiguous matches remain exceptions rather than being auto-resolved.
- Export generation failures return actionable errors without exposing secrets.
- Missing Splynx evidence is shown explicitly as missing evidence.

## Testing

Required coverage:

- Reference-first matching.
- Email/amount/date fallback matching.
- Duplicate-reference handling.
- Currency and amount normalization.
- VAT/balance calculations where applicable.
- Snapshot immutability.
- CSV/PDF generation.
- Finance-role authorization.
- Unauthorized and forbidden API paths.
- Dorcas view/export-only boundary.
- Staging webhook delivery.
- Staging full-history backfill.
- Saved-view reruns.

## Rollout prerequisites

- Previously posted live Paystack keys must be treated as compromised and rotated.
- Only a rotated server-side secret may be configured.
- No secret may be committed to the repository.
- Decide whether to add a CSAT Paystack webhook endpoint or integrate with the existing Splynx webhook workflow.
- Verify staging backfill, reconciliation, exports, snapshots, and role boundaries before production.
