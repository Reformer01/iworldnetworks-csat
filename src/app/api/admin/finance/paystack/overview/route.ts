import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceViewer } from '@/lib/finance-access';
import { buildPaystackOverview, isValidPaystackMonth } from '@/lib/finance/paystack-aggregates';

export const dynamic = 'force-dynamic';

const OVERVIEW_CAP = 20000;

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const viewerBlock = requireFinanceViewer(admin);
    if (viewerBlock) return viewerBlock;

    const { searchParams } = new URL(request.url);
    const rawMonth = searchParams.get('month');
    const month = rawMonth && rawMonth.trim() ? rawMonth.trim() : new Date().toISOString().slice(0, 7);
    if (!isValidPaystackMonth(month)) return error('month must be YYYY-MM');

    const [start, end] = [new Date(`${month}-01T00:00:00.000Z`), new Date(`${month}-01T00:00:00.000Z`)];
    end.setUTCMonth(end.getUTCMonth() + 1);

    const [transactions, links] = await Promise.all([
      prisma.paystackTransaction.findMany({
        where: { paidAt: { gte: start, lt: end } },
        orderBy: { paidAt: 'desc' },
        take: OVERVIEW_CAP,
      }),
      prisma.paystackReconciliationLink.findMany({ take: OVERVIEW_CAP }),
    ]);

    const payload = buildPaystackOverview(
      transactions as unknown as Parameters<typeof buildPaystackOverview>[0],
      links as unknown as Parameters<typeof buildPaystackOverview>[1],
      month,
    );
    return success(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-overview] GET error', { error: message });
    return serverError();
  }
}
