import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, tooMany, serverError, error } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { getTowerSnapshots, getTowerIncidents, getCustomerTrend, getMrrTrend, getHealthTrend } from '@/lib/audit/tower-snapshot';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const towerId = searchParams.get('towerId');
    const type = searchParams.get('type') || 'incidents';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

    if (!towerId) {
      return error('towerId is required', 400);
    }

    let data;

    switch (type) {
      case 'snapshots':
        data = await getTowerSnapshots(towerId, limit);
        break;
      case 'incidents':
        data = await getTowerIncidents(towerId, limit);
        break;
      case 'customer-trend':
        data = await getCustomerTrend(towerId, limit);
        break;
      case 'mrr-trend':
        data = await getMrrTrend(towerId, limit);
        break;
      case 'health-trend':
        data = await getHealthTrend(towerId, limit);
        break;
      default:
        return error(`Unknown type: ${type}`, 400);
    }

    return success({ data, towerId, type });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-audit-history] GET error', { error: message });
    return serverError();
  }
}
