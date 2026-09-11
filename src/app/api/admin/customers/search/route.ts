import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/customers/search?q=...&limit=20
 * Search customers by name, phone, or email for autocomplete.
 * Returns id, name, phone, email, btsName, servicePlan, status, city.
 */
export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return unauthorized();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '20')), 50);

    if (!q || q.length < 2) {
      return success({ customers: [] });
    }

    const customers = await prisma.customer.findMany({
      where: {
        deleted: false,
        OR: [{ customerName: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }],
      },
      select: {
        id: true,
        customerId: true,
        customerName: true,
        phone: true,
        email: true,
        btsName: true,
        servicePlan: true,
        status: true,
        city: true,
        lifecycle: true,
        accountType: true,
        mrrTotal: true,
      },
      take: limit,
      orderBy: { customerName: 'asc' },
    });

    return success({ customers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[customer-search] GET error', { error: message });
    return serverError();
  }
}
