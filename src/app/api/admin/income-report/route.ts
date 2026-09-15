import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, tooMany, forbidden, serverError, error, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import {
  buildMirrorIncomeRow,
  applyRowFilters,
  summarize,
  matchesChannel,
  monthBoundsUTC,
  dayRangeBoundsUTC,
  type IncomeRow,
} from '@/lib/income-report';

export const dynamic = 'force-dynamic';

// Mirror-only reads: SplynxPayment holds every payment (oldest-first paginated
// at sync time), Invoice holds totals for discount derivation.

const VALID_SEGMENTS = new Set(['__all', 'residential', 'sme', 'enterprise', 'other']);

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

    // 1) Payments from the mirror (instant range query, cap 20000).
    const payments = await prisma.splynxPayment.findMany({
      where: { paidAt: { gte: new Date(start), lte: new Date(end) } },
      orderBy: { paidAt: 'desc' },
      take: 20000,
    });

    // 2) Invoice totals for discount derivation (invoice total − amount paid).
    const invoiceIds = [...new Set(payments.map((p) => p.invoiceId).filter((v): v is string => !!v))];
    const invoiceMap = new Map<string, number>();
    if (invoiceIds.length) {
      const invoices = await prisma.invoice.findMany({
        where: { invoiceId: { in: invoiceIds } },
        select: { invoiceId: true, total: true },
      });
      for (const inv of invoices) invoiceMap.set(inv.invoiceId, inv.total ?? 0);
    }

    // 3) Customers from the mirror (plan/category/state/dateAdded).
    const cids = [...new Set(payments.map((p) => String(p.customerId ?? '')).filter(Boolean))];
    const customers = cids.length
      ? await prisma.customer.findMany({
          where: { customerId: { in: cids } },
          select: {
            customerId: true,
            customerName: true,
            email: true,
            category: true,
            servicePlan: true,
            state: true,
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
      splynxDateAdded: number | bigint | null;
    };
    const custMap = new Map<string, CustInfo>(customers.map((c) => [c.customerId, c as CustInfo]));

    const rows: IncomeRow[] = [];
    for (const p of payments) {
      if (p.paidAt == null) continue;
      const ms = new Date(p.paidAt).getTime();
      if (!Number.isFinite(ms)) continue;
      const amt = Number(p.amount ?? 0) || 0;
      if (!amt) continue;
      const reference = String(p.receiptNumber || p.note || `PAY-${p.paymentId}`);
      if (!matchesChannel(reference, p.paymentType ?? '', channel)) continue;
      const c = custMap.get(String(p.customerId ?? ''));
      const invoiceTotal = p.invoiceId ? invoiceMap.get(p.invoiceId) : undefined;
      rows.push(
        buildMirrorIncomeRow({
          ms,
          paidAmount: amt,
          invoiceTotal: invoiceTotal ?? null,
          plan: String(c?.servicePlan ?? ''),
          category: String(c?.category ?? ''),
          customerName: String(c?.customerName ?? `#${p.customerId ?? p.paymentId}`),
          email: String(c?.email ?? ''),
          reference,
          note: String(p.note ?? ''),
          state: c?.state ?? '',
          splynxDateAdded: c?.splynxDateAdded != null ? Number(c.splynxDateAdded) : null,
          start,
          end,
          isPrepay: false,
        }),
      );
    }

    const filtered = applyRowFilters(rows, { region, segment, channel: '__all', search });
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    let paymentsSyncedAt: string | null = null;
    for (const p of payments) {
      const cand = (p.updatedAt ?? p.paidAt) as Date | null;
      if (!cand) continue;
      const iso = new Date(cand).toISOString();
      if (!paymentsSyncedAt || iso > paymentsSyncedAt) paymentsSyncedAt = iso;
    }

    return success({
      month: outMonth,
      from,
      to,
      filters: { region, segment, channel, search },
      summary: summarize(filtered),
      rows: filtered,
      source: 'splynx-payments-mirror',
      paymentsSyncedAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logError('[income-report] GET error', { error: msg });
    return serverError(msg);
  }
}
