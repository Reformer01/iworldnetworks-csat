import { prisma } from '@/lib/prisma';
import { classifyReconciliation, matchByEmailAmountDate, matchByReference } from '@/lib/finance/paystack-reconcile';
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
}

const MONTH_RE = /^\d{4}-\d{2}$/;

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
  // PaystackReconciliationLink has no unique constraint on paystackReference,
  // so dedupe via findFirst then create/update.
  const existing = await prisma.paystackReconciliationLink.findFirst({
    where: { paystackReference: data.paystackReference },
    select: { id: true },
  });
  if (existing) {
    await prisma.paystackReconciliationLink.update({ where: { id: existing.id }, data });
  } else {
    await prisma.paystackReconciliationLink.create({ data });
  }
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
  // ReconciliationException has no unique constraint, so dedupe via findFirst
  // on the natural key then create/update.
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
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1) - 1); // last ms of month

  const [paystackTxs, splynxRows, existingLinks] = await Promise.all([
    prisma.paystackTransaction.findMany({
      where: { status: 'success', paidAt: { gte: start, lte: end } },
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
  }));

  const reconSplynxRows: ReconSplynxRow[] = splynxRows.map((row) => ({
    id: row.id,
    reference: row.reference ?? '',
    email: row.customerEmail ?? '',
    amountNaira: row.amountNaira,
    paidAt: toIso(row.paidAt),
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
  const dateMismatch = 0;
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
    // Resolve the matched Splynx row id for the link.
    const splynxMatch = matchByReference(ps, reconSplynxRows) ?? matchByEmailAmountDate(ps, reconSplynxRows);
    const method = matchByReference(ps, reconSplynxRows) ? 'reference' : 'fallback';

    if (classification.kind === 'matched' && splynxMatch) {
      matched++;
      await upsertLink({
        paystackReference: ps.reference,
        splynxLedgerId: splynxMatch.id,
        method,
        confidence: method === 'reference' ? 1.0 : 0.8,
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
        confidence: method === 'reference' ? 1.0 : 0.8,
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

  let splynxOnly = 0;
  for (const sp of reconSplynxRows) {
    if (linkedLedgerIds.has(sp.id)) continue;
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

  return { matched, paystackOnly, splynxOnly, amountMismatch, dateMismatch, duplicate, exceptionsCreated };
}
