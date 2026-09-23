import { prisma } from '@/lib/prisma';
import { logInfo, logWarn, logError } from '@/lib/logger';
import { extractSplynxCustomerId } from '@/lib/finance/paystack-normalize';

function getPaystackEnv() {
  return {
    secret: process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_API_KEY || '',
    base: 'https://api.paystack.co',
  };
}

export function isPaystackConfigured(): boolean {
  return !!getPaystackEnv().secret;
}

export interface PaystackTransactionRaw {
  id: number;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  channel?: string;
  gateway_response?: string;
  customer?: { email?: string; first_name?: string; last_name?: string };
  paid_at?: string;
  created_at?: string;
  fees?: number;
  fee?: number;
  refunded_amount?: number;
  dispute_status?: string;
  dispute?: string | { status?: string };
}

export const PAYSTACK_DASHBOARD_STATUSES = ['success', 'failed', 'abandoned'];

function truncate191(value: string | null): string | null {
  if (!value) return value;
  return value.length > 191 ? value.slice(0, 191) : value;
}

async function paystackFetch(path: string, params?: URLSearchParams): Promise<unknown> {
  const env = getPaystackEnv();
  if (!env.secret) throw new Error('PAYSTACK_SECRET_KEY not configured');
  const url = `${env.base}${path}${params ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.secret}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Paystack ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

export async function fetchPaystackTransactionsPage(
  page = 1,
  perPage = 100,
  statuses?: string[],
): Promise<{ data: PaystackTransactionRaw[]; hasMore: boolean }> {
  const wanted = (statuses ?? PAYSTACK_DASHBOARD_STATUSES).map((s) => s.toLowerCase());
  const params = new URLSearchParams({ perPage: String(perPage), page: String(page) });
  if (wanted.length === 1) {
    params.set('status', wanted[0]);
  }
  const json = (await paystackFetch('/transaction', params)) as {
    status: boolean;
    data: PaystackTransactionRaw[];
    meta?: { pageCount?: number };
  };
  let data = Array.isArray(json.data) ? json.data : [];
  if (wanted.length !== 1) {
    data = data.filter((tx) => wanted.includes((tx.status || '').toLowerCase()));
  }
  const hasMore = json.meta ? page < (json.meta.pageCount ?? 1) : data.length === perPage;
  return { data, hasMore };
}

export async function syncPaystackTransactions(opts?: {
  maxPages?: number;
  perPage?: number;
  statuses?: string[];
  full?: boolean;
  onProgress?: (p: { fetched: number; upserted: number; page: number }) => void | Promise<void>;
}): Promise<{ upserted: number; fetched: number; truncated: boolean }> {
  // full=true backfills every page from Paystack (newest → oldest) until exhausted,
  // subject to a generous safety cap. Otherwise maxPages bounds the run.
  const full = opts?.full === true;
  const FULL_SYNC_PAGE_CAP = 2000;
  const maxPages = full ? FULL_SYNC_PAGE_CAP : (opts?.maxPages ?? 10);
  const perPage = opts?.perPage ?? 100;
  const statuses = opts?.statuses ?? PAYSTACK_DASHBOARD_STATUSES;
  let truncated = false;
  if (!isPaystackConfigured()) {
    logWarn('[paystack] skipped — PAYSTACK_SECRET_KEY not configured');
    return { upserted: 0, fetched: 0, truncated: false };
  }
  let upserted = 0;
  let fetched = 0;
  for (let page = 1; page <= maxPages; page++) {
    const { data, hasMore } = await fetchPaystackTransactionsPage(page, perPage, statuses);
    fetched += data.length;
    for (const tx of data) {
      const paidAt = tx.paid_at ? new Date(tx.paid_at) : tx.created_at ? new Date(tx.created_at) : null;
      const email = truncate191(tx.customer?.email || null);
      const name = truncate191([tx.customer?.first_name, tx.customer?.last_name].filter(Boolean).join(' ') || null);
      const channel = truncate191(tx.channel ?? null);
      const gatewayResponse = truncate191(tx.gateway_response ?? null);
      const raw = tx as unknown as Record<string, unknown>;
      const feesKobo = typeof raw.fees === 'number' ? raw.fees : typeof raw.fee === 'number' ? (raw.fee as number) : null;
      const feesNaira = typeof feesKobo === 'number' ? feesKobo / 100 : null;
      const netNaira = typeof feesKobo === 'number' ? (tx.amount - feesKobo) / 100 : null;
      const refundedKobo = typeof raw.refunded_amount === 'number' ? (raw.refunded_amount as number) : null;
      const refundedNaira = typeof refundedKobo === 'number' ? refundedKobo / 100 : 0;
      const disputeStatus =
        typeof raw.dispute_status === 'string'
          ? (raw.dispute_status as string)
          : typeof raw.dispute === 'string'
            ? (raw.dispute as string)
            : typeof raw.dispute === 'object' && raw.dispute !== null
              ? ((raw.dispute as { status?: unknown }).status as string) || null
              : null;
      const splynxCustomerId = extractSplynxCustomerId(tx);
      try {
        await prisma.paystackTransaction.upsert({
          where: { reference: tx.reference },
          update: {
            paystackId: String(tx.id),
            amount: tx.amount,
            currency: tx.currency || 'NGN',
            status: tx.status,
            channel,
            customerEmail: email,
            customerName: name,
            gatewayResponse,
            feesNaira,
            netNaira,
            refundedNaira,
            disputeStatus,
            splynxCustomerId,
            paidAt,
            raw: tx as unknown as never,
          },
          create: {
            paystackId: String(tx.id),
            reference: tx.reference,
            amount: tx.amount,
            currency: tx.currency || 'NGN',
            status: tx.status,
            channel,
            customerEmail: email,
            customerName: name,
            gatewayResponse,
            feesNaira,
            netNaira,
            refundedNaira,
            disputeStatus,
            splynxCustomerId,
            paidAt,
            raw: tx as unknown as never,
          },
        });
        upserted++;
      } catch (e) {
        logWarn('[paystack] upsert failed', { reference: tx.reference, error: String(e) });
      }
    }
    logInfo('[paystack] page synced', { page, count: data.length });
    await opts?.onProgress?.({ fetched, upserted, page });
    if (!hasMore) break;
    if (page >= maxPages) {
      truncated = true;
      break;
    }
    // polite delay to respect rate limit
    await new Promise((r) => setTimeout(r, 300));
  }
  if (truncated) {
    logWarn('[paystack] sync truncated — more pages remain on Paystack; run a full sync (full=true)', {
      fetched,
      upserted,
    });
  }
  return { upserted, fetched, truncated };
}

export interface PaystackMonthlyAggregate {
  /** Human label, year-aware: e.g. "September 2026". */
  month: string;
  /** Unambiguous YYYY-MM key, e.g. "2026-09". */
  monthKey: string;
  total: number;
  count: number;
  byChannel: Record<string, number>;
}

export async function getPaystackMonthlyAggregates(): Promise<PaystackMonthlyAggregate[]> {
  const rows = await prisma.paystackTransaction.findMany({
    where: { status: 'success', paidAt: { not: null }, currency: 'NGN' },
    select: { amount: true, paidAt: true, channel: true, customerEmail: true },
    orderBy: { paidAt: 'desc' },
    take: 20000,
  });
  const map = new Map<string, { label: string; totalNaira: number; count: number; byChannel: Record<string, number> }>();
  for (const r of rows) {
    if (!r.paidAt) continue;
    const d = new Date(r.paidAt);
    // Group by year+month so same-named months in different years never merge.
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const entry = map.get(key) || { label, totalNaira: 0, count: 0, byChannel: {} };
    const naira = (r.amount || 0) / 100;
    entry.totalNaira += naira;
    entry.count += 1;
    if (r.channel) entry.byChannel[r.channel] = (entry.byChannel[r.channel] || 0) + naira;
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, v]) => ({ month: v.label, monthKey, total: v.totalNaira, count: v.count, byChannel: v.byChannel }));
}
