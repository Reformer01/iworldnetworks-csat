import { normalizeEmail, normalizeReference } from './paystack-normalize';
import type { ReconPaystackRow, ReconSplynxRow } from './paystack-reconcile-types';

/** Amounts must agree within ₦1 (Splynx rounds partial payments / fees to whole Naira). */
export const AMOUNT_TOLERANCE_NAIRA = 1.0;

// Africa/Lagos has no DST (UTC+1 year-round). Splynx payment dates are
// date-only (midnight UTC), Paystack timestamps are real time — comparing
// server-local toDateString() silently shifts late-night WAT payments into a
// different day. Always compare WAT calendar days.
const WAT_OFFSET_MS = 60 * 60 * 1000;

/** WAT (UTC+1) calendar day key, e.g. "2026-09-22". */
export function watDayOf(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** WAT (UTC+1) month bounds for a YYYY-MM key as Date range [start, end]. */
export function watMonthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - WAT_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, 1) - WAT_OFFSET_MS - 1);
  return { start, end };
}

export function matchByReference(paystack: ReconPaystackRow, rows: ReconSplynxRow[]): ReconSplynxRow | null {
  const wanted = normalizeReference(paystack.reference);
  if (!wanted) return null;
  return rows.find((row) => normalizeReference(row.reference) === wanted) ?? null;
}

function sameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return watDayOf(a) === watDayOf(b);
}

/**
 * Golden join: Paystack metadata.customer_id == Splynx customer id, plus
 * amount within tolerance and same WAT day. Beats email matching — shared
 * corporate emails (one email, many customers) cannot collide.
 */
export function matchByCustomerIdAmountDate(paystack: ReconPaystackRow, rows: ReconSplynxRow[]): ReconSplynxRow | null {
  const cid = (paystack.splynxCustomerId ?? '').trim();
  if (!cid) return null;
  return (
    rows.find(
      (row) =>
        (row.customerId ?? '').trim() === cid &&
        Math.abs(row.amountNaira - paystack.amountNaira) <= AMOUNT_TOLERANCE_NAIRA &&
        sameDay(row.paidAt, paystack.paidAt),
    ) ?? null
  );
}

export function matchByEmailAmountDate(paystack: ReconPaystackRow, rows: ReconSplynxRow[]): ReconSplynxRow | null {
  const email = normalizeEmail(paystack.email);
  if (!email) return null;
  return (
    rows.find(
      (row) =>
        normalizeEmail(row.email) === email &&
        Math.abs(row.amountNaira - paystack.amountNaira) <= AMOUNT_TOLERANCE_NAIRA &&
        sameDay(row.paidAt, paystack.paidAt),
    ) ?? null
  );
}

/** Same as matchByEmailAmountDate but ignoring the payment day (used to detect date-mismatch rows). */
export function matchByEmailAmount(paystack: ReconPaystackRow, rows: ReconSplynxRow[]): ReconSplynxRow | null {
  const email = normalizeEmail(paystack.email);
  if (!email) return null;
  return (
    rows.find(
      (row) => normalizeEmail(row.email) === email && Math.abs(row.amountNaira - paystack.amountNaira) <= AMOUNT_TOLERANCE_NAIRA,
    ) ?? null
  );
}

/** Same as matchByEmailAmount but on customer id (detects date mismatches without email). */
export function matchByCustomerIdAmount(paystack: ReconPaystackRow, rows: ReconSplynxRow[]): ReconSplynxRow | null {
  const cid = (paystack.splynxCustomerId ?? '').trim();
  if (!cid) return null;
  return (
    rows.find(
      (row) => (row.customerId ?? '').trim() === cid && Math.abs(row.amountNaira - paystack.amountNaira) <= AMOUNT_TOLERANCE_NAIRA,
    ) ?? null
  );
}

export function classifyReconciliation(paystack: ReconPaystackRow, links: ReconSplynxRow[]): { kind: string; varianceNaira: number } {
  const direct =
    matchByReference(paystack, links) ?? matchByCustomerIdAmountDate(paystack, links) ?? matchByEmailAmountDate(paystack, links);
  if (!direct) return { kind: 'paystack-only', varianceNaira: paystack.amountNaira };
  const varianceNaira = Math.round((paystack.amountNaira - direct.amountNaira) * 100) / 100;
  if (Math.abs(varianceNaira) >= AMOUNT_TOLERANCE_NAIRA) return { kind: 'amount-mismatch', varianceNaira };
  return { kind: 'matched', varianceNaira: 0 };
}
