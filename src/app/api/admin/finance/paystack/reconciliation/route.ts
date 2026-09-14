import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceViewer } from '@/lib/finance-access';
import { classifyReconciliation } from '@/lib/finance/paystack-reconcile';
import { normalizeReference } from '@/lib/finance/paystack-normalize';
import type { ReconSplynxRow } from '@/lib/finance/paystack-reconcile-types';

export const dynamic = 'force-dynamic';

const FETCH_CAP = 5000;

const QUEUE_NAMES = ['matched', 'paystack-only', 'splynx-only', 'amount-mismatch', 'date-mismatch', 'duplicate'] as const;
type QueueName = (typeof QUEUE_NAMES)[number];
type QueueRow = Record<string, unknown>;

function parsePage(raw: string | null): number | null {
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function parsePerPage(raw: string | null): number | null {
  if (raw == null || raw === '') return 20;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(200, Math.max(1, Math.floor(n)));
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const viewerBlock = requireFinanceViewer(admin);
    if (viewerBlock) return viewerBlock;

    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams.get('page'));
    if (page == null) return error('page must be an integer >= 1');
    const perPage = parsePerPage(searchParams.get('perPage'));
    if (perPage == null) return error('perPage must be a number');

    const [transactions, ledger, links] = await Promise.all([
      prisma.paystackTransaction.findMany({ orderBy: { paidAt: 'desc' }, take: FETCH_CAP }),
      prisma.splynxIncomeLedger.findMany({ take: FETCH_CAP }),
      prisma.paystackReconciliationLink.findMany({ take: FETCH_CAP }),
    ]);

    const buckets: Record<QueueName, QueueRow[]> = {
      matched: [],
      'paystack-only': [],
      'splynx-only': [],
      'amount-mismatch': [],
      'date-mismatch': [],
      duplicate: [],
    };

    const linkedRefs = new Set<string>();
    const linkedLedgerIds = new Set<string>();
    for (const link of links as unknown as Record<string, unknown>[]) {
      const ref = normalizeReference(String(link.paystackReference ?? ''));
      if (ref) linkedRefs.add(ref);
      if (typeof link.splynxLedgerId === 'string' && link.splynxLedgerId) linkedLedgerIds.add(link.splynxLedgerId);
      const row: QueueRow = {
        paystackReference: link.paystackReference,
        splynxLedgerId: link.splynxLedgerId ?? null,
        method: link.method,
        confidence: link.confidence,
        paystackAmountNaira: link.paystackAmountNaira,
        splynxAmountNaira: link.splynxAmountNaira ?? null,
        varianceNaira: link.varianceNaira ?? null,
        status: link.status,
      };
      const status = String(link.status ?? '').toLowerCase();
      if (status === 'matched') buckets.matched.push(row);
      else if (status === 'amount-mismatch') buckets['amount-mismatch'].push(row);
      else if (status === 'date-mismatch') buckets['date-mismatch'].push(row);
      else if (status === 'duplicate') buckets.duplicate.push(row);
      else if (status === 'splynx-only') buckets['splynx-only'].push(row);
      else buckets['paystack-only'].push(row);
    }

    const refCounts = new Map<string, number>();
    for (const tx of transactions as unknown as Record<string, unknown>[]) {
      const key = normalizeReference(String(tx.reference ?? ''));
      if (key) refCounts.set(key, (refCounts.get(key) ?? 0) + 1);
    }

    const splynxRows: ReconSplynxRow[] = (ledger as unknown as Record<string, unknown>[]).map((row) => ({
      id: String(row.id ?? ''),
      reference: String(row.reference ?? ''),
      email: String(row.customerEmail ?? ''),
      amountNaira: typeof row.amountNaira === 'number' ? row.amountNaira : 0,
      paidAt: toIso(row.paidAt as Date | string | null),
    }));

    for (const tx of transactions as unknown as Record<string, unknown>[]) {
      const key = normalizeReference(String(tx.reference ?? ''));
      if (!key || linkedRefs.has(key)) continue;
      const summary: QueueRow = {
        reference: tx.reference,
        customerEmail: tx.customerEmail ?? null,
        amountNaira: Math.round(((typeof tx.amount === 'number' ? tx.amount : 0) / 100) * 100) / 100,
        channel: tx.channel ?? null,
        status: tx.status ?? 'unknown',
        paidAt: toIso(tx.paidAt as Date | string | null),
      };
      if ((refCounts.get(key) ?? 0) > 1) {
        buckets.duplicate.push(summary);
        continue;
      }
      const classified = classifyReconciliation(
        {
          reference: String(tx.reference ?? ''),
          email: String(tx.customerEmail ?? ''),
          amountNaira: (typeof tx.amount === 'number' ? tx.amount : 0) / 100,
          paidAt: toIso(tx.paidAt as Date | string | null),
        },
        splynxRows,
      );
      if (classified.kind === 'matched') buckets.matched.push(summary);
      else if (classified.kind === 'amount-mismatch')
        buckets['amount-mismatch'].push({ ...summary, varianceNaira: classified.varianceNaira });
      else buckets['paystack-only'].push(summary);
    }

    for (const row of ledger as unknown as Record<string, unknown>[]) {
      const id = String(row.id ?? '');
      if (linkedLedgerIds.has(id)) continue;
      buckets['splynx-only'].push({
        splynxLedgerId: id,
        reference: (row.reference as string | null) ?? null,
        customerEmail: (row.customerEmail as string | null) ?? null,
        amountNaira: (row.amountNaira as number) ?? 0,
        paidAt: toIso(row.paidAt as Date | string | null),
      });
    }

    const start = (page - 1) * perPage;
    const queues = {} as Record<QueueName, { count: number; rows: QueueRow[] }>;
    const counts = {} as Record<QueueName, number>;
    for (const name of QUEUE_NAMES) {
      counts[name] = buckets[name].length;
      queues[name] = { count: buckets[name].length, rows: buckets[name].slice(start, start + perPage) };
    }

    return success({ page, perPage, counts, queues });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-reconciliation] GET error', { error: message });
    return serverError();
  }
}
