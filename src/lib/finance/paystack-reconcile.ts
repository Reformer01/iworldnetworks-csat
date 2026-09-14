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
