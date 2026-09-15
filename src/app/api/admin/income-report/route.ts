import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, tooMany, forbidden, serverError, error, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { getSplynxConfig, buildAuthHeader, parseSplynxApiDate } from '@/lib/splynx-api';
import { prisma } from '@/lib/prisma';
import {
  buildIncomeRow,
  applyRowFilters,
  summarize,
  matchesChannel,
  monthBoundsUTC,
  dayRangeBoundsUTC,
  pickState,
  pickDiscountPercent,
  pickDateAddedMs,
  type IncomeRow,
} from '@/lib/income-report';

export const dynamic = 'force-dynamic';

// Live Splynx fetch per request (no 57k full mirror). Paginate 500/page, filter paidAt in-window.

type RawPayment = {
  id: number | string;
  customer_id: number | string;
  amount: string | number;
  date: string;
  payment_type: string | number;
  receipt_number?: string;
  field_4?: string;
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

const VALID_SEGMENTS = new Set(['__all', 'residential', 'sme', 'enterprise', 'other']);

async function splynxGet<T>(path: string, params?: URLSearchParams): Promise<T> {
  const env = getSplynxConfig();
  if (!env.host || env.host.includes('splynx.iworldnetworks.net')) {
    // local .env points at placeholder DNS; production host is portal.iwn.ng
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

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { searchParams } = new URL(request.url);
    const rawMonth = searchParams.get('month');
    const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : new Date().toISOString().slice(0, 7);
    const rawFrom = searchParams.get('from');
    const rawTo = searchParams.get('to');
    const region = searchParams.get('region') || '__all';
    const segment = searchParams.get('segment') || '__all';
    const channel = searchParams.get('channel') || '__all';
    const search = searchParams.get('search') || '';

    if (!VALID_SEGMENTS.has(segment)) return error('Invalid segment. Use residential|sme|enterprise|other.', 400);

    // from/to (inclusive) override month when present; both required together.
    let start: number;
    let end: number;
    let from: string;
    let to: string;
    let outMonth: string | null = month;
    if (rawFrom || rawTo) {
      if (!rawFrom || !rawTo) return error('Both from and to (YYYY-MM-DD) are required.', 400);
      const bounds = dayRangeBoundsUTC(rawFrom, rawTo);
      if (!bounds) return error('Invalid from/to. Use YYYY-MM-DD with from <= to.', 400);
      ({ start, end } = bounds);
      from = rawFrom;
      to = rawTo;
      outMonth = null;
    } else {
      ({ start, end } = monthBoundsUTC(month));
      from = new Date(start).toISOString().slice(0, 10);
      to = new Date(end).toISOString().slice(0, 10);
    }

    // 1) Fetch payments for window (payments have reliable `date` field; invoices often have 0000-00-00 date_payment)
    const payments: RawPayment[] = [];
    let page = 1;
    const perPage = 500;
    let reachedBeforeWindow = false;
    for (; page <= 10 && !reachedBeforeWindow; page++) {
      const params = new URLSearchParams({ limit: String(perPage), offset: String((page - 1) * perPage) });
      // Splynx payments endpoint: /admin/finance/payments supports limit/offset; sorting not documented so just page
      const chunk = await splynxGet<RawPayment[] | { data?: RawPayment[] }>('/admin/finance/payments', params);
      const arr: RawPayment[] = Array.isArray(chunk) ? chunk : (chunk.data ?? []);
      if (!arr.length) break;
      for (const p of arr) {
        const ms = parseSplynxApiDate(p.date);
        if (ms == null) continue;
        if (ms > end) continue;
        if (ms >= start && ms <= end) payments.push(p);
      }
      // heuristic: if chunk's min date is before window and we've collected enough, stop after 2 more pages
      const minMs = Math.min(...arr.map((p) => parseSplynxApiDate(p.date) ?? Infinity));
      if (minMs < start && page >= 3) reachedBeforeWindow = true;
      if (arr.length < perPage) break;
    }

    // Fallback: also fetch invoices where date_payment in window to catch payments not in payments list (e.g. deposit offsets)
    let invoices: RawInvoice[] = [];
    try {
      const iparams = new URLSearchParams({ limit: '500' });
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

    const paymentInvoiceIds = new Set(payments.map((p) => String((p as unknown as { invoice_id?: unknown }).invoice_id ?? '')));
    // avoid double counting same invoice when both payment and invoice lists contain it
    const invoiceOnly = invoices.filter((inv) => !paymentInvoiceIds.has(String(inv.id)));

    // 2) Resolve customers for all payments+invoices in one batch (MariaDB mirror is authoritative for plan/category)
    const cids = [...new Set([...payments.map((p) => String(p.customer_id)), ...invoiceOnly.map((i) => String(i.customer_id))])].filter(
      Boolean,
    );
    const customers = cids.length
      ? await prisma.customer.findMany({
          where: { customerId: { in: cids } },
          select: {
            customerId: true,
            customerName: true,
            email: true,
            category: true,
            servicePlan: true,
            accountType: true,
            state: true,
            discountPercent: true,
            splynxDateAdded: true,
          },
        })
      : [];
    type CustInfo = {
      customerId: string;
      customerName: string | null;
      email: string | null;
      category: string | null;
      servicePlan: string | null;
      state: string | null;
      discountPercent: number | null;
      splynxDateAdded: number | bigint | null;
    };
    const custMap = new Map<string, CustInfo>(customers.map((c) => [c.customerId, c as CustInfo]));

    // For missing customers, hydrate directly from Splynx customer endpoint (best-effort, limited)
    const missing = cids.filter((id) => !custMap.has(id)).slice(0, 80);
    for (const id of missing) {
      try {
        const c = await splynxGet<Record<string, unknown>>(`/admin/customers/customer/${id}`);
        custMap.set(id, {
          customerId: id,
          customerName: String(c.name ?? c.login ?? `#${id}`),
          email: String(c.email ?? c.billing_email ?? ''),
          category: String(c.category ?? ''),
          servicePlan: String(c.plan ?? ''),
          state: pickState(c) || null,
          discountPercent: pickDiscountPercent(c),
          splynxDateAdded: pickDateAddedMs(c, parseSplynxApiDate),
        });
      } catch {
        /* ignore */
      }
    }

    // Build rows
    const rows: IncomeRow[] = [];

    function pushRow(opts: {
      ms: number;
      amount: number;
      customerId: string;
      reference: string;
      paymentType: string | number | undefined;
      note: string;
      isPrepay: boolean;
    }) {
      if (!matchesChannel(opts.reference, opts.paymentType, channel)) return;
      const c = custMap.get(opts.customerId);
      rows.push(
        buildIncomeRow({
          ms: opts.ms,
          amount: opts.amount,
          plan: String(c?.servicePlan ?? ''),
          category: String(c?.category ?? ''),
          customerName: String(c?.customerName ?? `#${opts.customerId}`),
          email: String(c?.email ?? ''),
          reference: opts.reference,
          note: opts.note,
          state: c?.state ?? '',
          discountPercent: c?.discountPercent ?? 0,
          splynxDateAdded: c?.splynxDateAdded != null ? Number(c.splynxDateAdded) : null,
          start,
          end,
          isPrepay: opts.isPrepay,
        }),
      );
    }

    for (const p of payments) {
      const ms = parseSplynxApiDate(p.date);
      if (ms == null) continue;
      const amt = Number(p.amount ?? 0) || 0;
      if (!amt) continue;
      const note = String(p.receipt_number ?? p.field_4 ?? '');
      pushRow({
        ms,
        amount: amt,
        customerId: String(p.customer_id),
        reference: note || `PAY-${p.id}`,
        paymentType: p.payment_type,
        note,
        isPrepay: false,
      });
    }
    for (const inv of invoiceOnly) {
      const ms = parseSplynxApiDate(inv.date_payment)!;
      const amt = Number(inv.total ?? 0) || 0;
      if (!amt) continue;
      const items = inv.items ?? [];
      let isPrepay = false;
      if (items.length) {
        const periods = items
          .map((it) => ({ from: parseSplynxApiDate(it.period_from), to: parseSplynxApiDate(it.period_to) }))
          .filter((x) => x.from != null && x.to != null) as { from: number; to: number }[];
        if (periods.length) {
          const minFrom = Math.min(...periods.map((p) => p.from));
          const maxTo = Math.max(...periods.map((p) => p.to));
          const spanDays = Math.round((maxTo - minFrom) / 86400000) + 1;
          if (spanDays > 35) isPrepay = true;
        }
      }
      const reference = String(inv.number ?? `#${inv.id}`);
      pushRow({
        ms,
        amount: amt,
        customerId: String(inv.customer_id),
        reference,
        paymentType: '',
        note: String(items[0]?.description ?? ''),
        isPrepay,
      });
    }

    const filtered = applyRowFilters(rows, { region, segment, channel: '__all', search });
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    return success({
      month: outMonth,
      from,
      to,
      filters: { region, segment, channel, search },
      summary: summarize(filtered),
      rows: filtered,
      source: payments.length ? 'splynx-payments' : 'splynx-invoices',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logError('[income-report] GET error', { error: msg });
    return serverError(msg);
  }
}
