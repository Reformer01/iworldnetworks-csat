import { prisma } from '@/lib/prisma';
import { classifyPlan } from '@/lib/income-report';
import { watMonthBounds } from '@/lib/finance/paystack-reconcile';

type MirrorCustomer = {
  customerId: string;
  customerName: string | null;
  email: string | null;
  billingEmail?: string | null;
  city: string | null;
  category: string | null;
  servicePlan: string | null;
};

const MONTH_RE = /^\d{4}-\d{2}$/;

function trunc191(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length > 191 ? s.slice(0, 191) : s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// classifyPlan: single canonical implementation imported from
// src/lib/income-report.ts (duplicated here previously — deleted in the
// reconciliation cleanup so income report and ledger can never drift).

/**
 * Build the canonical Splynx income ledger for a month from the local
 * `SplynxPayment` mirror (populated by the hourly payments sync, which is
 * verified complete: paymentsBackfillComplete=true). The mirror is the
 * source — the reconciliation runner must never depend on live Splynx API
 * auth (signature mode), which is unavailable to standalone jobs and was
 * the cause of the empty ledger + 1,778 stale paystack-only exceptions in
 * the Sep 2026 pilot.
 *
 * Payment-type semantics (discovered Sep 2026): type 30 = Paystack
 * (portal auto-pay, receipt series "YYYY-30-NNNNN"); other types (2, 9,
 * 17, 25, 26 …) are manual/bank/cash rows with no Paystack side. All rows
 * land in the ledger; the reconciliation runner filters to Paystack-channel
 * rows via isPaystackLedgerRow().
 */
export async function importSplynxIncomeLedger(opts: { month: string }): Promise<{ fetched: number; upserted: number }> {
  const month = typeof (opts as unknown) === 'string' ? (opts as unknown as string) : opts.month;
  if (!MONTH_RE.test(month)) throw new Error(`Invalid month "${month}" — expected YYYY-MM`);
  const { start, end } = watMonthBounds(month);

  // 1) Mirror payments inside the WAT month window.
  const payments = await prisma.splynxPayment.findMany({
    where: { paidAt: { gte: start, lte: end } },
  });

  // 2) Resolve customers from the MariaDB mirror.
  const customerIds = [...new Set(payments.map((p) => p.customerId).filter((v): v is string => !!v))];
  const custMap = new Map<string, MirrorCustomer>();
  if (customerIds.length) {
    const customers = await prisma.customer.findMany({
      where: { customerId: { in: customerIds } },
      select: {
        customerId: true,
        customerName: true,
        email: true,
        billingEmail: true,
        city: true,
        category: true,
        servicePlan: true,
      },
    });
    for (const c of customers) custMap.set(c.customerId, c);
  }

  // 3) Upsert each row on the (source, sourceId) unique key — idempotent.
  let upserted = 0;
  for (const p of payments) {
    const amount = Number(p.amount ?? 0) || 0;
    if (!amount || !p.paidAt) continue;
    const cust = p.customerId ? custMap.get(p.customerId) : undefined;
    const kind = classifyPlan(String(cust?.servicePlan ?? ''), String(cust?.category ?? ''));
    const data = {
      source: 'payment' as const,
      sourceId: p.paymentId,
      customerId: p.customerId ?? null,
      customerName: trunc191(cust?.customerName ?? (p.customerId ? `#${p.customerId}` : 'Unknown')),
      customerEmail: trunc191(cust?.email ?? cust?.billingEmail ?? '') ?? '',
      reference: trunc191(p.receiptNumber ?? `PAY-${p.paymentId}`),
      amountNaira: amount,
      currency: 'NGN',
      productSegment: kind === 'other' ? null : kind,
      region: trunc191(cust?.city ?? ''),
      taxNaira: round2(amount * 0.075),
      discountNaira: 0,
      paidAt: p.paidAt,
      raw: (p.raw ?? null) as never,
    };
    await prisma.splynxIncomeLedger.upsert({
      where: { source_sourceId: { source: data.source, sourceId: data.sourceId } },
      update: data,
      create: data,
    });
    upserted++;
  }

  return { fetched: payments.length, upserted };
}


