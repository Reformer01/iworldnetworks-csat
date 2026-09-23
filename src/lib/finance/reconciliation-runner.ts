import { prisma } from '@/lib/prisma';
import {
  classifyReconciliation,
  matchByCustomerIdAmount,
  matchByCustomerIdAmountDate,
  matchByEmailAmount,
  matchByEmailAmountDate,
  matchByReference,
  watMonthBounds,
} from '@/lib/finance/paystack-reconcile';
import { normalizeReference } from '@/lib/finance/paystack-normalize';
import type { ReconPaystackRow, ReconSplynxRow } from '@/lib/finance/paystack-reconcile-types';

export interface ReconciliationRunnerResult {
  matched: number;
  paystackOnly: number;
  splynxOnly: number;
  amountMismatch: number;
  dateMismatch: number;
  duplicate: number;
  exceptionsCreated: number;
  /** Ledger rows skipped from splynx-only checks because they are not Paystack-channel payments. */
  nonPaystackLedgerSkipped: number;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * A Splynx ledger row plausibly corresponds to a Paystack payment only when its
 * reference or raw payment type mentions Paystack (receipt numbers like
 * "PSK-...", payment_type "Paystack", or the Splynx payment_type id 30 —
 * discovered Sept 2026: portal Paystack auto-payments arrive as type 30 with
 * receipt "2026-30-xxxx"). Bank/cash/credit rows must NOT be flagged as
 * splynx-only exceptions — they never have a Paystack side.
 */
function isPaystackLedgerRow(row: { reference?: string | null; raw?: unknown }): boolean {
  const ref = (row.reference || '').toLowerCase();
  if (ref.includes('psk') || ref.includes('paystack')) return true;
  const raw = (row.raw ?? null) as Record<string, unknown> | null;
  const paymentType = String(raw?.payment_type ?? '').toLowerCase();
  if (paymentType.includes('paystack')) return true;
  // Splynx payment_type 30 = Paystack (receipt series "YYYY-30-NNNNN").
  if (paymentType === '30') return true;
  if (/^\d{4}-30-\d+/.test(ref)) return true;
  return false;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function upsertLink(data: {
  paystackReference: string;
  splynxLedgerId: string;
  method: string;
  confidence: number;
  paystackAmountNaira: number;
  splynxAmountNaira: number;
  varianceNaira: number;
  status: string;
}): Promise<void> {
  // paystackReference is a unique key — atomic upsert, race-safe.
  await prisma.paystackReconciliationLink.upsert({
    where: { paystackReference: data.paystackReference },
    update: data,
    create: data,
  });
}

async function upsertException(data: {
  kind: string;
  paystackReference?: string | null;
  splynxLedgerId?: string | null;
  title: string;
  detail: string;
  amountNaira: number;
  status: string;
}): Promise<void> {
  // (kind, paystackReference, splynxLedgerId) is a unique key. Prisma's compound
  // unique where cannot address rows with null components, so use the atomic
  // upsert when both refs are known and fall back otherwise.
  if (data.paystackReference != null && data.splynxLedgerId != null) {
    await prisma.reconciliationException.upsert({
      where: {
        kind_paystackReference_splynxLedgerId: {
          kind: data.kind,
          paystackReference: data.paystackReference,
          splynxLedgerId: data.splynxLedgerId,
        },
      },
      update: data,
      create: data,
    });
    return;
  }
  const existing = await prisma.reconciliationException.findFirst({
    where: {
      kind: data.kind,
      paystackReference: data.paystackReference ?? null,
      splynxLedgerId: data.splynxLedgerId ?? null,
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.reconciliationException.update({ where: { id: existing.id }, data });
  } else {
    await prisma.reconciliationException.create({ data });
  }
}

export async function runReconciliation(opts: { month: string }): Promise<ReconciliationRunnerResult> {
  const month = typeof (opts as unknown) === 'string' ? (opts as unknown as string) : opts.month;
  if (!MONTH_RE.test(month)) throw new Error(`Invalid month "${month}" — expected YYYY-MM`);
  // WAT month window — same bounds as the ledger import and the aggregates.
  const { start, end } = watMonthBounds(month);

  const [paystackTxs, splynxRows, existingLinks] = await Promise.all([
    prisma.paystackTransaction.findMany({
      where: { status: 'success', paidAt: { gte: start, lte: end }, currency: 'NGN' },
    }),
    prisma.splynxIncomeLedger.findMany({
      where: { paidAt: { gte: start, lte: end } },
    }),
    prisma.paystackReconciliationLink.findMany(),
  ]);

  const linkedRefs = new Set<string>();
  const linkedLedgerIds = new Set<string>();
  for (const link of existingLinks) {
    const ref = normalizeReference(link.paystackReference);
    if (ref) linkedRefs.add(ref);
    if (link.splynxLedgerId) linkedLedgerIds.add(link.splynxLedgerId);
  }

  const paystackRows: ReconPaystackRow[] = paystackTxs.map((tx) => ({
    reference: tx.reference,
    email: tx.customerEmail ?? '',
    amountNaira: tx.amount / 100,
    paidAt: toIso(tx.paidAt),
    splynxCustomerId: (tx as { splynxCustomerId?: string | null }).splynxCustomerId ?? null,
  }));

  const reconSplynxRows: ReconSplynxRow[] = splynxRows.map((row) => ({
    id: row.id,
    reference: row.reference ?? '',
    email: row.customerEmail ?? '',
    amountNaira: row.amountNaira,
    paidAt: toIso(row.paidAt),
    customerId: row.customerId ?? null,
  }));

  // Duplicate Paystack references within the month.
  const refCounts = new Map<string, number>();
  for (const row of paystackRows) {
    const key = normalizeReference(row.reference);
    if (key) refCounts.set(key, (refCounts.get(key) ?? 0) + 1);
  }

  let matched = 0;
  let paystackOnly = 0;
  let amountMismatch = 0;
  let dateMismatch = 0;
  let duplicate = 0;
  let exceptionsCreated = 0;
  const duplicateRefsHandled = new Set<string>();

  for (const ps of paystackRows) {
    const key = normalizeReference(ps.reference);
    if (!key || linkedRefs.has(key)) continue;

    if ((refCounts.get(key) ?? 0) > 1) {
      if (!duplicateRefsHandled.has(key)) {
        duplicate++;
        await upsertException({
          kind: 'duplicate',
          paystackReference: ps.reference,
          title: `Duplicate Paystack reference: ${ps.reference}`,
          detail: `Reference appears ${refCounts.get(key)} times in Paystack for ${month}`,
          amountNaira: ps.amountNaira,
          status: 'open',
        });
        exceptionsCreated++;
        duplicateRefsHandled.add(key);
      }
      continue;
    }

    const classification = classifyReconciliation(ps, reconSplynxRows);
    // Resolve the matched Splynx row id for the link. Priority: reference →
    // customer-id golden key → email+amount+day. Method names match the tiers
    // in the reconciliation design doc (reference / metadata / fallback).
    const byRef = matchByReference(ps, reconSplynxRows);
    const byMeta = byRef ? null : matchByCustomerIdAmountDate(ps, reconSplynxRows);
    const byEmail = byRef || byMeta ? null : matchByEmailAmountDate(ps, reconSplynxRows);
    const splynxMatch = byRef ?? byMeta ?? byEmail;
    const method = byRef ? 'reference' : byMeta ? 'metadata' : 'fallback';
    const confidence = method === 'reference' ? 1.0 : method === 'metadata' ? 0.9 : 0.8;

    if (classification.kind === 'matched' && splynxMatch) {
      matched++;
      await upsertLink({
        paystackReference: ps.reference,
        splynxLedgerId: splynxMatch.id,
        method,
        confidence,
        paystackAmountNaira: ps.amountNaira,
        splynxAmountNaira: splynxMatch.amountNaira,
        varianceNaira: 0,
        status: 'matched',
      });
      linkedRefs.add(key);
      linkedLedgerIds.add(splynxMatch.id);
    } else if (classification.kind === 'amount-mismatch' && splynxMatch) {
      amountMismatch++;
      await upsertLink({
        paystackReference: ps.reference,
        splynxLedgerId: splynxMatch.id,
        method,
        confidence,
        paystackAmountNaira: ps.amountNaira,
        splynxAmountNaira: splynxMatch.amountNaira,
        varianceNaira: classification.varianceNaira,
        status: 'amount-mismatch',
      });
      await upsertException({
        kind: 'amount-mismatch',
        paystackReference: ps.reference,
        splynxLedgerId: splynxMatch.id,
        title: `Amount mismatch: ${ps.reference}`,
        detail: `Paystack ₦${ps.amountNaira} vs Splynx ₦${splynxMatch.amountNaira} (variance ₦${classification.varianceNaira})`,
        amountNaira: ps.amountNaira,
        status: 'open',
      });
      exceptionsCreated++;
      linkedRefs.add(key);
      linkedLedgerIds.add(splynxMatch.id);
    } else {
      // Last chance: same customer + same amount but a different day — that is
      // a date mismatch (e.g. timezone drift between Splynx and Paystack), not
      // a missing payment. Previously these were miscounted as paystack-only.
      const dateMatch = matchByCustomerIdAmount(ps, reconSplynxRows) ?? matchByEmailAmount(ps, reconSplynxRows);
      if (dateMatch && !linkedLedgerIds.has(dateMatch.id)) {
        dateMismatch++;
        await upsertLink({
          paystackReference: ps.reference,
          splynxLedgerId: dateMatch.id,
          method: 'fallback',
          confidence: 0.6,
          paystackAmountNaira: ps.amountNaira,
          splynxAmountNaira: dateMatch.amountNaira,
          varianceNaira: 0,
          status: 'date-mismatch',
        });
        await upsertException({
          kind: 'date-mismatch',
          paystackReference: ps.reference,
          splynxLedgerId: dateMatch.id,
          title: `Date mismatch: ${ps.reference}`,
          detail: `Paystack paid ${ps.paidAt ?? 'unknown'} but Splynx recorded ${dateMatch.paidAt ?? 'unknown'} for the same customer and amount (₦${ps.amountNaira})`,
          amountNaira: ps.amountNaira,
          status: 'open',
        });
        exceptionsCreated++;
        linkedRefs.add(key);
        linkedLedgerIds.add(dateMatch.id);
      } else {
        paystackOnly++;
        await upsertException({
          kind: 'paystack-only',
          paystackReference: ps.reference,
          title: `Paystack-only: ${ps.reference}`,
          detail: `No matching Splynx ledger row for Paystack reference ${ps.reference} (${ps.email}, ₦${ps.amountNaira})`,
          amountNaira: ps.amountNaira,
          status: 'open',
        });
        exceptionsCreated++;
      }
    }
  }

  // Only Paystack-channel ledger rows belong in the splynx-only queue —
  // bank/cash/credit payments have no Paystack counterpart by design.
  const paystackLedgerIds = new Set(splynxRows.filter(isPaystackLedgerRow).map((row) => row.id));

  let splynxOnly = 0;
  let nonPaystackLedgerSkipped = 0;
  for (const sp of reconSplynxRows) {
    if (linkedLedgerIds.has(sp.id)) continue;
    if (!paystackLedgerIds.has(sp.id)) {
      nonPaystackLedgerSkipped++;
      continue;
    }
    splynxOnly++;
    await upsertException({
      kind: 'splynx-only',
      splynxLedgerId: sp.id,
      title: `Splynx-only: ${sp.reference || sp.id}`,
      detail: `No matching Paystack transaction for Splynx ledger row ${sp.id} (${sp.email}, ₦${sp.amountNaira})`,
      amountNaira: sp.amountNaira,
      status: 'open',
    });
    exceptionsCreated++;
  }

  return {
    matched,
    paystackOnly,
    splynxOnly,
    amountMismatch,
    dateMismatch,
    duplicate,
    exceptionsCreated,
    nonPaystackLedgerSkipped,
  };
}
