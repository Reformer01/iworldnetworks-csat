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
  round2,
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

    // 2) Credit notes applied in range (paidAt, falling back to dateCreated).
    // Void/refunded/cancelled notes are never income.
    const creditNotes = await prisma.creditNote.findMany({
      where: {
        OR: [
          { paidAt: { gte: new Date(start), lte: new Date(end) } },
          { paidAt: null, dateCreated: { gte: BigInt(start), lte: BigInt(end) } },
        ],
      },
      orderBy: { paidAt: 'desc' },
      take: 20000,
    });
    const EXCLUDED_CREDIT_STATUS = new Set(['refunded', 'void', 'cancelled']);
    const appliedCredits = creditNotes.filter(
      (cn) =>
        !EXCLUDED_CREDIT_STATUS.has(
          String(cn.status ?? '')
            .trim()
            .toLowerCase(),
        ),
    );

    // 3) Invoice line items for discount derivation (negative price = discount).
    const invoiceIds = [...new Set(payments.map((p) => p.invoiceId).filter((v): v is string => !!v))];
    const invoiceItems = new Map<string, Array<{ description?: string; price?: number | string }>>();
    if (invoiceIds.length) {
      const invoices = await prisma.invoice.findMany({
        where: { invoiceId: { in: invoiceIds } },
        select: { invoiceId: true, items: true },
      });
      for (const inv of invoices) {
        invoiceItems.set(
          inv.invoiceId,
          Array.isArray(inv.items) ? (inv.items as Array<{ description?: string; price?: number | string }>) : [],
        );
      }
    }

    // 4) Customers from the mirror (plan/category/state/dateAdded).
    const cids = [
      ...new Set([
        ...payments.map((p) => String(p.customerId ?? '')).filter(Boolean),
        ...appliedCredits.map((cn) => String(cn.customerId ?? '')).filter(Boolean),
      ]),
    ];
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
      const items = p.invoiceId ? (invoiceItems.get(p.invoiceId) ?? []) : [];
      rows.push(
        buildMirrorIncomeRow({
          ms,
          paidAmount: amt,
          items,
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

    // Credit-note rows: Others = total, no tax split, flowing through the
    // same region/segment/channel/search filters below.
    const creditRowSet = new Set<IncomeRow>();
    for (const cn of appliedCredits) {
      const total = round2(Number(cn.total ?? 0) || 0);
      if (!total) continue;
      let ms: number | null = null;
      if (cn.paidAt != null) {
        const t = new Date(cn.paidAt).getTime();
        if (Number.isFinite(t)) ms = t;
      }
      if (ms == null && cn.dateCreated != null) {
        const t = Number(cn.dateCreated);
        if (Number.isFinite(t) && t > 0) ms = t;
      }
      if (ms == null) continue;
      const reference = String(cn.number || cn.creditId);
      if (!matchesChannel(reference, 'credit', channel)) continue;
      const c = custMap.get(String(cn.customerId ?? ''));
      const descs = (Array.isArray(cn.items) ? (cn.items as Array<{ description?: unknown }>) : [])
        .map((it) => String(it?.description ?? '').trim())
        .filter(Boolean);
      const row: IncomeRow = {
        date: new Date(ms).toISOString().slice(0, 10),
        customer: String(c?.customerName ?? `#${cn.customerId ?? cn.creditId}`),
        email: String(c?.email ?? ''),
        reference,
        amount: total,
        enterprise: 0,
        isNew: 0,
        residential: 0,
        sme: 0,
        discounts: 0,
        others: total,
        tax: 0,
        balance: total,
        region: String(c?.state ?? ''),
        remark: '',
        note: descs.length ? `Credit note: ${descs.join('; ')}` : 'Credit note',
        isPrepay: false,
      };
      rows.push(row);
      creditRowSet.add(row);
    }

    const filtered = applyRowFilters(rows, { region, segment, channel: '__all', search });
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    const creditFiltered = filtered.filter((r) => creditRowSet.has(r));
    const summary = {
      ...summarize(filtered),
      creditNotes: {
        count: creditFiltered.length,
        total: round2(creditFiltered.reduce((s, r) => s + r.amount, 0)),
      },
    };

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
      summary,
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
