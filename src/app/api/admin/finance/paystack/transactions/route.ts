import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceViewer } from '@/lib/finance-access';
import { clampPerPage, filterPaystackTransactions, isValidPaystackMonth } from '@/lib/finance/paystack-aggregates';

export const dynamic = 'force-dynamic';

const FETCH_CAP = 5000;

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
  return clampPerPage(n);
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
    const month = (searchParams.get('month') || '').trim();
    const status = (searchParams.get('status') || '').trim();
    const channel = (searchParams.get('channel') || '').trim();
    const region = (searchParams.get('region') || '').trim();
    const segment = (searchParams.get('segment') || '').trim();
    const query = (searchParams.get('query') || '').trim();

    if (month && !isValidPaystackMonth(month)) return error('month must be YYYY-MM');

    const page = parsePage(searchParams.get('page'));
    if (page == null) return error('page must be an integer >= 1');
    const perPage = parsePerPage(searchParams.get('perPage'));
    if (perPage == null) return error('perPage must be a number');

    const rows = await prisma.paystackTransaction.findMany({
      orderBy: { paidAt: 'desc' },
      take: FETCH_CAP,
    });

    const filtered = filterPaystackTransactions(rows as unknown as Parameters<typeof filterPaystackTransactions>[0], {
      month: month || null,
      status: status || null,
      channel: channel || null,
      region: region || null,
      segment: segment || null,
      query: query || null,
    });

    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    const items = filtered.slice(start, start + perPage).map((row) => ({
      reference: row.reference,
      customer: row.customerName || row.customerEmail || '',
      customerEmail: row.customerEmail ?? null,
      amountNaira: Math.round(((row.amount || 0) / 100) * 100) / 100,
      channel: row.channel ?? null,
      status: row.status ?? 'unknown',
      paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : (row.paidAt ?? null),
    }));

    return success({ page, perPage, total, totalPages, items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-transactions] GET error', { error: message });
    return serverError();
  }
}
