import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, tooMany, forbidden, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { getSplynxConfig, buildAuthHeader, parseSplynxApiDate } from '@/lib/splynx-api';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Live Splynx fetch per request (no 57k full mirror). Paginate 500/page, filter paidAt in-month.

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

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1) - 1; // last ms of month
  return { start, end };
}

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

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { searchParams } = new URL(request.url);
    const rawMonth = searchParams.get('month');
    const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : new Date().toISOString().slice(0, 7);
    const { start, end } = monthBounds(month);

    // 1) Fetch payments for month (payments have reliable `date` field; invoices often have 0000-00-00 date_payment)
    // Pull with pagination until we have covered the month window. Payments are globally ~large; filter client-side by date prefix.
    const payments: RawPayment[] = [];
    let page = 1;
    const perPage = 500;
    // fetch up to 5 pages (2500 payments) sorted by date desc; enough to cover a month (Aug volume expected 300-600)
    // If still truncated we continue until out-of-window.
    let reachedBeforeMonth = false;
    for (; page <= 10 && !reachedBeforeMonth; page++) {
      const params = new URLSearchParams({ limit: String(perPage), offset: String((page - 1) * perPage) });
      // Splynx payments endpoint: /admin/finance/payments supports limit/offset; sorting not documented so just page
      const chunk = await splynxGet<RawPayment[] | { data?: RawPayment[] }>('/admin/finance/payments', params);
      const arr: RawPayment[] = Array.isArray(chunk) ? chunk : (chunk.data ?? []);
      if (!arr.length) break;
      for (const p of arr) {
        const ms = parseSplynxApiDate(p.date);
        if (ms == null) continue;
        if (ms > end) continue; // future vs month (payments are chronological but not guaranteed sorted)
        if (ms < start) {
          // can't early-exit globally because order not guaranteed, keep fetching a couple pages
          // but mark heuristic after 2 pages beyond window we stop
        }
        if (ms >= start && ms <= end) payments.push(p);
      }
      // heuristic: if chunk's min date is before month and we've collected enough, stop after 2 more pages
      const minMs = Math.min(...arr.map((p) => parseSplynxApiDate(p.date) ?? Infinity));
      if (minMs < start && page >= 3) reachedBeforeMonth = true;
      if (arr.length < perPage) break;
    }

    // Fallback: also fetch invoices where date_payment in month to catch payments not in payments list (e.g. deposit offsets)
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
          select: { customerId: true, customerName: true, email: true, city: true, category: true, servicePlan: true, accountType: true },
        })
      : [];
    const custMap = new Map(customers.map((c) => [c.customerId, c]));

    // For missing customers, hydrate directly from Splynx customer endpoint (best-effort, limited)
    const missing = cids.filter((id) => !custMap.has(id)).slice(0, 80);
    for (const id of missing) {
      try {
        const c = await splynxGet<Record<string, unknown>>(`/admin/customers/customer/${id}`);
        custMap.set(id, {
          customerId: id,
          customerName: String(c.name ?? c.login ?? `#${id}`),
          email: String(c.email ?? c.billing_email ?? ''),
          city: String(c.city ?? ''),
          category: String((c as Record<string, unknown>).category ?? ''),
          servicePlan: String((c as Record<string, unknown>).plan ?? ''),
          accountType: String((c as Record<string, unknown>).account_type ?? 'regular'),
        } as never);
      } catch {
        /* ignore */
      }
    }

    // Build rows
    type Row = {
      date: string;
      customer: string;
      email: string;
      reference: string;
      amount: number;
      residential: number;
      sme: number;
      enterprise: number;
      tax: number;
      balance: number;
      region: string;
      note: string;
      isPrepay: boolean;
      prepayMonths?: string;
    };
    const rows: Row[] = [];
    let totalGross = 0;
    let newSubscribers = 0;
    let prepayments = 0;

    // Track seen emails for "New" flag within month (first appearance = new). True new = created within window — we approximate.
    const seen = new Set<string>();

    function pushRow(opts: {
      ms: number;
      amount: number;
      customerId: string;
      reference: string;
      note: string;
      isPrepay: boolean;
      prepayMonths?: string;
    }) {
      const c = custMap.get(opts.customerId);
      const plan = String(c?.servicePlan ?? '');
      const cat = String(c?.category ?? '');
      const kind = classifyPlan(plan, cat);
      let residential = 0,
        sme = 0,
        enterprise = 0;
      if (kind === 'residential') residential = opts.amount;
      else if (kind === 'sme') sme = opts.amount;
      else if (kind === 'enterprise') enterprise = opts.amount;
      else residential = opts.amount; // default bucket (matches previous single-row behaviour)

      const vat = Math.round(opts.amount * 0.075 * 100) / 100;
      const balance = Math.round((opts.amount - vat) * 100) / 100;
      const email = String(c?.email ?? '');
      const isNew = email && !seen.has(email) ? 1 : 0;
      if (email) seen.add(email);
      newSubscribers += isNew;
      if (opts.isPrepay) prepayments++;

      totalGross += opts.amount;
      rows.push({
        date: new Date(opts.ms).toISOString().slice(0, 10),
        customer: String(c?.customerName ?? `#${opts.customerId}`),
        email,
        reference: opts.reference,
        amount: opts.amount,
        residential,
        sme,
        enterprise,
        tax: vat,
        balance,
        region: String(c?.city ?? ''),
        note: opts.note,
        isPrepay: opts.isPrepay,
      });
    }

    for (const p of payments) {
      const ms = parseSplynxApiDate(p.date);
      if (ms == null) continue;
      const amt = Number(p.amount ?? 0) || 0;
      if (!amt) continue;
      // detect prepay: invoice items period To > period From spanning >31 days
      // For payments we don't have invoice items inline; fetch single invoice items if needed (best-effort 1 extra call per suspect)
      let isPrepay = false;
      let note = String(p.receipt_number ?? p.field_4 ?? '');
      pushRow({ ms, amount: amt, customerId: String(p.customer_id), reference: note || `PAY-${p.id}`, note, isPrepay });
    }
    for (const inv of invoiceOnly) {
      const ms = parseSplynxApiDate(inv.date_payment)!;
      const amt = Number(inv.total ?? 0) || 0;
      const items = inv.items ?? [];
      let isPrepay = false;
      let prepayMonths: string | undefined;
      if (items.length) {
        const periods = items
          .map((it) => ({ from: parseSplynxApiDate(it.period_from), to: parseSplynxApiDate(it.period_to) }))
          .filter((x) => x.from != null && x.to != null) as { from: number; to: number }[];
        if (periods.length) {
          const minFrom = Math.min(...periods.map((p) => p.from));
          const maxTo = Math.max(...periods.map((p) => p.to));
          const spanDays = Math.round((maxTo - minFrom) / 86400000) + 1;
          if (spanDays > 35) {
            isPrepay = true;
            prepayMonths = `${new Date(minFrom).toISOString().slice(0, 7)} → ${new Date(maxTo).toISOString().slice(0, 7)}`;
          }
        }
        // fallback description match
      }
      pushRow({
        ms,
        amount: amt,
        customerId: String(inv.customer_id),
        reference: String(inv.number ?? `#${inv.id}`),
        note: String(items[0]?.description ?? ''),
        isPrepay,
        prepayMonths,
      });
    }

    rows.sort((a, b) => b.date.localeCompare(a.date));

    const totals = {
      gross: Math.round(totalGross * 100) / 100,
      vat: Math.round(totalGross * 0.075 * 100) / 100,
      net: Math.round(totalGross * 0.925 * 100) / 100,
      residential: Math.round(rows.reduce((s, r) => s + r.residential, 0) * 100) / 100,
      sme: Math.round(rows.reduce((s, r) => s + r.sme, 0) * 100) / 100,
      enterprise: Math.round(rows.reduce((s, r) => s + r.enterprise, 0) * 100) / 100,
    };

    return success({
      month,
      summary: {
        transactions: rows.length,
        totalGross: totals.gross,
        vat: totals.vat,
        netBalance: totals.net,
        newSubscribers,
        prepayments,
        residential: totals.residential,
        sme: totals.sme,
        enterprise: totals.enterprise,
      },
      rows,
      source: payments.length ? 'splynx-payments' : 'splynx-invoices',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logError('[income-report] GET error', { error: msg });
    return serverError(msg);
  }
}
