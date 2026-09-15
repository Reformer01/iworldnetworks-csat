import { prisma } from '@/lib/prisma';
import { buildAuthHeader, getSplynxConfig, parseSplynxApiDate } from '@/lib/splynx-api';

type RawPayment = {
  id: number | string;
  customer_id: number | string;
  amount: string | number;
  date: string;
  payment_type: string | number;
  receipt_number?: string;
  field_4?: string;
  invoice_id?: number | string;
};

type RawInvoiceItem = { description?: string; price?: string | number; period_from?: string; period_to?: string };
type RawInvoice = {
  id: number | string;
  customer_id: number | string;
  number?: string;
  total?: string | number;
  date_payment?: string;
  status?: string;
  items?: RawInvoiceItem[];
};

type MirrorCustomer = {
  customerId: string;
  customerName: string | null;
  email: string | null;
  city: string | null;
  category: string | null;
  servicePlan: string | null;
};

const MONTH_RE = /^\d{4}-\d{2}$/;
const PAGE_LIMIT = 500;

function trunc191(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length > 191 ? s.slice(0, 191) : s;
}

function monthBounds(month: string): { start: number; end: number } {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1) - 1; // last ms of month
  return { start, end };
}

// Same fetch logic as src/app/api/admin/income-report/route.ts.
async function splynxGet<T>(path: string, params?: URLSearchParams): Promise<T> {
  const env = getSplynxConfig();
  if (!env.host || env.host.includes('splynx.iworldnetworks.net')) {
    (env as Record<string, unknown>).host = 'https://portal.iwn.ng';
  }
  const base = String(env.host).replace(/\/+$/, '') + '/api/2.0';
  const auth = await buildAuthHeader();
  const url = params ? `${base}${path}?${params}` : `${base}${path}`;
  const res = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Splynx ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// Same classification as src/app/api/admin/income-report/route.ts.
function classifyPlan(plan: string, category: string): 'residential' | 'sme' | 'enterprise' | 'other' {
  const p = (plan || '').trim().toLowerCase();
  const c = (category || '').toLowerCase();
  // H-Lite / H-Max / H-Pro / H-Prime etc => residential (Home)
  if (/^h[-\s]?(lite|max|pro|prime|ultra)/i.test(p) || p === 'h-lite' || p === 'h-max') return 'residential';
  if (p.includes('home') || p.includes('residential')) return 'residential';
  // U-* plus Business SME
  if (/^u[-\s]?(lite|max|pro)/i.test(p) || p.includes('sme') || p.includes('business')) return 'sme';
  if (c === 'company' || c === 'business' || c === 'corporate') return 'enterprise';
  // custom-named tariffs -> enterprise
  if (p && p !== '—' && p !== '-') return 'enterprise';
  // fallback by category
  if (c === 'person' || c === 'individual' || c === 'residential') return 'residential';
  return 'other';
}

function toLedgerFields(
  opts: {
    source: 'payment' | 'invoice';
    sourceId: string;
    customerId: string;
    reference: string;
    amount: number;
    paidMs: number;
    raw: Record<string, unknown>;
  },
  custMap: Map<string, MirrorCustomer>,
) {
  const cust = custMap.get(opts.customerId);
  const kind = classifyPlan(String(cust?.servicePlan ?? ''), String(cust?.category ?? ''));
  const productSegment = kind === 'other' ? null : kind;
  const taxNaira = Math.round(opts.amount * 0.075 * 100) / 100;
  return {
    source: opts.source,
    sourceId: opts.sourceId,
    customerId: trunc191(opts.customerId),
    customerName: trunc191(cust?.customerName ?? `#${opts.customerId}`),
    customerEmail: trunc191(cust?.email ?? ''),
    reference: trunc191(opts.reference),
    amountNaira: opts.amount,
    currency: 'NGN',
    productSegment,
    region: trunc191(cust?.city ?? ''),
    taxNaira,
    discountNaira: 0,
    paidAt: new Date(opts.paidMs),
    raw: opts.raw as unknown as never,
  };
}

export interface SplynxLedgerImportResult {
  fetched: number;
  upserted: number;
}

export async function importSplynxIncomeLedger(opts: { month: string }): Promise<SplynxLedgerImportResult> {
  const month = typeof (opts as unknown) === 'string' ? (opts as unknown as string) : opts.month;
  if (!MONTH_RE.test(month)) throw new Error(`Invalid month "${month}" — expected YYYY-MM`);
  const { start, end } = monthBounds(month);

  // 1) Payments for the month (reliable `date` field).
  const payments: RawPayment[] = [];
  let reachedBeforeMonth = false;
  for (let page = 1; page <= 10 && !reachedBeforeMonth; page++) {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String((page - 1) * PAGE_LIMIT) });
    const chunk = await splynxGet<RawPayment[] | { data?: RawPayment[] }>('/admin/finance/payments', params);
    const arr: RawPayment[] = Array.isArray(chunk) ? chunk : (chunk.data ?? []);
    if (!arr.length) break;
    for (const p of arr) {
      const ms = parseSplynxApiDate(p.date);
      if (ms == null || ms > end) continue;
      if (ms >= start && ms <= end) payments.push(p);
    }
    const minMs = Math.min(...arr.map((p) => parseSplynxApiDate(p.date) ?? Infinity));
    if (minMs < start && page >= 3) reachedBeforeMonth = true;
    if (arr.length < PAGE_LIMIT) break;
  }

  // 2) Best-effort paid invoices in-month (catches deposit offsets missing from payments).
  let invoices: RawInvoice[] = [];
  try {
    const iparams = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    const ichunk = await splynxGet<RawInvoice[] | { data?: RawInvoice[] }>('/admin/finance/invoices', iparams);
    const iarr: RawInvoice[] = Array.isArray(ichunk) ? ichunk : (ichunk.data ?? []);
    invoices = iarr.filter((inv) => {
      const ms = parseSplynxApiDate(inv.date_payment);
      return (
        ms != null &&
        ms >= start &&
        ms <= end &&
        String(inv.status ?? '')
          .toLowerCase()
          .includes('paid')
      );
    });
  } catch {
    // invoices 403 for some keys — payments are primary
  }

  // Avoid double counting the same invoice when both lists contain it.
  const paymentInvoiceIds = new Set(payments.map((p) => String(p.invoice_id ?? '')));
  const invoiceOnly = invoices.filter((inv) => !paymentInvoiceIds.has(String(inv.id)));

  // 3) Resolve customers from the MariaDB mirror.
  const customerIds = [
    ...new Set([...payments.map((p) => String(p.customer_id)), ...invoiceOnly.map((i) => String(i.customer_id))]),
  ].filter(Boolean);
  const custMap = new Map<string, MirrorCustomer>();
  if (customerIds.length) {
    const customers = await prisma.customer.findMany({
      where: { customerId: { in: customerIds } },
      select: { customerId: true, customerName: true, email: true, city: true, category: true, servicePlan: true },
    });
    for (const c of customers) custMap.set(c.customerId, c);
  }

  // 4) Upsert each row. SplynxIncomeLedger has no unique constraint on
  // (source, sourceId), so dedupe via findFirst then create/update.
  let upserted = 0;
  let fetched = 0;
  const persist = async (data: ReturnType<typeof toLedgerFields>) => {
    fetched++;
    const existing = await prisma.splynxIncomeLedger.findFirst({
      where: { source: data.source, sourceId: data.sourceId },
      select: { id: true },
    });
    if (existing) {
      await prisma.splynxIncomeLedger.update({ where: { id: existing.id }, data });
    } else {
      await prisma.splynxIncomeLedger.create({ data });
    }
    upserted++;
  };

  for (const p of payments) {
    const paidMs = parseSplynxApiDate(p.date);
    const amount = Number(p.amount ?? 0) || 0;
    if (paidMs == null || !amount) continue;
    await persist(
      toLedgerFields(
        {
          source: 'payment',
          sourceId: String(p.id),
          customerId: String(p.customer_id),
          reference: String(p.receipt_number ?? p.field_4 ?? `PAY-${p.id}`),
          amount,
          paidMs,
          raw: p as unknown as Record<string, unknown>,
        },
        custMap,
      ),
    );
  }

  for (const inv of invoiceOnly) {
    const paidMs = parseSplynxApiDate(inv.date_payment);
    const amount = Number(inv.total ?? 0) || 0;
    if (paidMs == null || !amount) continue;
    await persist(
      toLedgerFields(
        {
          source: 'invoice',
          sourceId: String(inv.id),
          customerId: String(inv.customer_id),
          reference: String(inv.number ?? `#${inv.id}`),
          amount,
          paidMs,
          raw: inv as unknown as Record<string, unknown>,
        },
        custMap,
      ),
    );
  }

  return { fetched, upserted };
}
