import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { countAudience, resolveAudienceIds, Audience } from '@/lib/services/campaign-service';

export const dynamic = 'force-dynamic';

// Segment options for the campaign builder. Values come from the unified
// Customer table (Splynx commercial tags + UISP BTS data).
async function getSegmentOptions() {
  const [lifecycles, cities, statuses, servicePlans, bts] = await Promise.all([
    prisma.customer.findMany({ where: { deleted: false }, distinct: ['lifecycle'], select: { lifecycle: true } }),
    prisma.customer.findMany({ where: { deleted: false }, distinct: ['city'], select: { city: true } }),
    prisma.customer.findMany({ where: { deleted: false }, distinct: ['status'], select: { status: true } }),
    prisma.customer.findMany({ where: { deleted: false }, distinct: ['servicePlan'], select: { servicePlan: true } }),
    prisma.customer.findMany({ where: { deleted: false }, distinct: ['btsId'], select: { btsId: true } }),
  ]);
  return {
    lifecycle: lifecycles.map((r) => r.lifecycle).filter((v): v is string => !!v),
    city: cities.map((r) => r.city).filter((v): v is string => !!v),
    status: statuses.map((r) => r.status).filter((v): v is string => !!v),
    servicePlan: servicePlans.map((r) => r.servicePlan).filter((v): v is string => !!v),
    bts: bts.map((r) => r.btsId).filter((v): v is string => !!v),
  };
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const values = searchParams.get('values')?.split(',').filter(Boolean) || [];
    const audience: Audience =
      type === 'all' ? { type: 'all' } : { type: type as 'lifecycle' | 'city' | 'status' | 'servicePlan' | 'bts', values };

    if (searchParams.get('count') === '1') {
      const count = await countAudience(audience);
      return success({ count });
    }

    const options = await getSegmentOptions();
    return success({ options });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-campaigns-segments] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => null);
    const audience = body?.audience;
    if (
      !audience ||
      typeof audience !== 'object' ||
      !['all', 'lifecycle', 'city', 'status', 'servicePlan', 'bts'].includes(audience.type)
    ) {
      return error('audience must be { type: "all" } or { type, values }');
    }

    const ids = await resolveAudienceIds(audience as Audience);
    return success({ ids });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-campaigns-segments] POST error', { error: message });
    return serverError();
  }
}
