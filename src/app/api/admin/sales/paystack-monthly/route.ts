import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, tooMany, forbidden, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { isPaystackConfigured, getPaystackMonthlyAggregates, syncPaystackTransactions } from '@/lib/paystack';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const configured = isPaystackConfigured();
    if (!configured) {
      return success({
        configured: false,
        monthly: [],
        total: 0,
        count: 0,
        message: 'PAYSTACK_SECRET_KEY not configured. Set it in .env to enable.',
      });
    }

    // If ?sync=1, trigger incremental sync first (super admin could, but allow any admin)
    const doSync = new URL(request.url).searchParams.get('sync') === '1';
    if (doSync) {
      await syncPaystackTransactions({ maxPages: 5 }).catch(() => null);
    }

    const monthly = await getPaystackMonthlyAggregates();
    // also compute overall total from DB
    const agg = await prisma.paystackTransaction.aggregate({
      where: { status: 'success', paidAt: { not: null } },
      _sum: { amount: true },
      _count: true,
    });
    const totalNaira = (agg._sum.amount || 0) / 100;

    return success({
      configured: true,
      monthly,
      total: totalNaira,
      count: agg._count,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-monthly] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 10, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const maxPages = Math.min(Math.max(1, Number(body.maxPages) || 10), 20);
    const result = await syncPaystackTransactions({ maxPages });
    return success(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-monthly] POST error', { error: message });
    return serverError();
  }
}
