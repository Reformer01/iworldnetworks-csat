import { prisma } from '@/lib/prisma';
import { logInfo, logWarn, logError } from '@/lib/logger';

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

export async function fetchPaystackTransactionsPage(page = 1, perPage = 100): Promise<{ data: PaystackTransactionRaw[]; hasMore: boolean }> {
  const params = new URLSearchParams({ perPage: String(perPage), page: String(page) });
  // only success for revenue reconciliation
  params.set('status', 'success');
  const json = (await paystackFetch('/transaction', params)) as {
    status: boolean;
    data: PaystackTransactionRaw[];
    meta?: { pageCount?: number };
  };
  const data = Array.isArray(json.data) ? json.data : [];
  const hasMore = json.meta ? page < (json.meta.pageCount ?? 1) : data.length === perPage;
  return { data, hasMore };
}

export async function syncPaystackTransactions(opts?: { maxPages?: number; perPage?: number }): Promise<{ upserted: number; fetched: number }> {
  const maxPages = opts?.maxPages ?? 10;
  const perPage = opts?.perPage ?? 100;
  if (!isPaystackConfigured()) {
    logWarn('[paystack] skipped — PAYSTACK_SECRET_KEY not configured');
    return { upserted: 0, fetched: 0 };
  }
  let upserted = 0;
  let fetched = 0;
  for (let page = 1; page <= maxPages; page++) {
    const { data, hasMore } = await fetchPaystackTransactionsPage(page, perPage);
    fetched += data.length;
    for (const tx of data) {
      const paidAt = tx.paid_at ? new Date(tx.paid_at) : tx.created_at ? new Date(tx.created_at) : null;
      const email = tx.customer?.email || null;
      const name = [tx.customer?.first_name, tx.customer?.last_name].filter(Boolean).join(' ') || null;
      try {
        await prisma.paystackTransaction.upsert({
          where: { reference: tx.reference },
          update: {
            paystackId: tx.id,
            amount: tx.amount,
            currency: tx.currency || 'NGN',
            status: tx.status,
            channel: tx.channel ?? null,
            customerEmail: email,
            customerName: name,
            gatewayResponse: tx.gateway_response ?? null,
            paidAt,
            raw: tx as unknown as never,
          },
          create: {
            paystackId: tx.id,
            reference: tx.reference,
            amount: tx.amount,
            currency: tx.currency || 'NGN',
            status: tx.status,
            channel: tx.channel ?? null,
            customerEmail: email,
            customerName: name,
            gatewayResponse: tx.gateway_response ?? null,
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
    if (!hasMore) break;
    // polite delay to respect rate limit
    await new Promise((r) => setTimeout(r, 300));
  }
  return { upserted, fetched };
}

export async function getPaystackMonthlyAggregates() {
  const rows = await prisma.paystackTransaction.findMany({
    where: { status: 'success', paidAt: { not: null } },
    select: { amount: true, paidAt: true, channel: true, customerEmail: true },
    take: 20000,
  });
  const map = new Map<string, { totalNaira: number; count: number; byChannel: Record<string, number> }>();
  for (const r of rows) {
    if (!r.paidAt) continue;
    const d = new Date(r.paidAt);
    const month = d.toLocaleString('en-US', { month: 'long', year: 'numeric' }); // but we need "August" style? Use monthly-revenue MONTH_ORDER
    // Use MONTH_ORDER style: "August" without year — simple for now use month name
    const key = d.toLocaleString('en-US', { month: 'long' });
    const entry = map.get(key) || { totalNaira: 0, count: 0, byChannel: {} };
    const naira = (r.amount || 0) / 100;
    entry.totalNaira += naira;
    entry.count += 1;
    if (r.channel) entry.byChannel[r.channel] = (entry.byChannel[r.channel] || 0) + naira;
    map.set(key, entry);
  }
  return Array.from(map.entries()).map(([month, v]) => ({ month, total: v.totalNaira, count: v.count, byChannel: v.byChannel }));
}
