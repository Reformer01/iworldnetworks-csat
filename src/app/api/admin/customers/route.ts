import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { getCustomersPage } from '@/lib/lib/db/customers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const lifecycle = searchParams.get('lifecycle');
    const status = searchParams.get('status');
    const overdue = searchParams.get('overdue');
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 500);

    const result = await getCustomersPage({
      lifecycle: lifecycle ?? undefined,
      status: status ?? undefined,
      search: search ?? undefined,
      overdue: overdue === 'true' || overdue === 'false' ? overdue : undefined,
      page,
      pageSize,
    });
    return success({
      records: result.records,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      summary: result.summary,
      meta: result.meta,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-customers] GET error', { error: message });
    return serverError();
  }
}
