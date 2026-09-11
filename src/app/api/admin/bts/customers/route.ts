import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { canonicalRegionForTowerName } from '@/lib/audit/computeTowerAudit';
import { deriveBtsAccountType } from '@/lib/bts-account-type';

export const dynamic = 'force-dynamic';

export interface UnifiedCustomerRecord {
  id: string;
  customerId: string;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  lifecycle: string | null;
  accountType: string | null;
  servicePlan: string | null;
  mrrTotal: number | null;
  btsId: string | null;
  btsName: string | null;
  uispEndpointName: string | null;
  uispDeviceStatus: string | null;
  uispOutageCount: number | null;
  matchState: string;
  matchMethod: string | null;
  matchScore: number | null;
  matchedAt: number | null;
}

export interface UnifiedRosterSummary {
  total: number;
  matched: number;
  pending: number;
  manual: number;
  totalMrr: number;
  towers: number;
}

// NOTE: generated Prisma client predates the unified Customer fields
// (btsId, matchState, ...); runtime rows carry them. See runMatching.ts.
interface CustomerRow {
  id: string;
  customerId: string;
  customerName: string | null;
  email: string | null;
  login: string | null;
  phone: string | null;
  city: string | null;
  lifecycle: string | null;
  accountType: string | null;
  servicePlan: string | null;
  mrrTotal: number | null;
  btsId: string | null;
  btsName: string | null;
  uispEndpointName: string | null;
  uispDeviceStatus: string | null;
  uispOutageCount: number | null;
  matchState: string | null;
  matchMethod: string | null;
  matchScore: number | null;
  matchedAt: bigint | null;
}

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
    const btsName = searchParams.get('btsName');
    const region = searchParams.get('region');
    const lifecycle = searchParams.get('lifecycle');
    const accountType = searchParams.get('accountType');
    const overdue = searchParams.get('overdue');
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 500);

    const where: Record<string, unknown> = { deleted: false };
    const servicePlan = searchParams.get('servicePlan');
    if (btsName) where.btsName = btsName;
    if (lifecycle) where.lifecycle = lifecycle;
    if (servicePlan) where.servicePlan = servicePlan;
    if (search) {
      where.OR = [
        { customerName: { contains: search } },
        { email: { contains: search } },
        { login: { contains: search } },
        { btsName: { contains: search } },
      ];
    }

    // Region filter: canonical-city — customers whose btsName resolves to the
    // requested canonical region via the static station list.
    if (region) {
      const distinct = (await prisma.customer.findMany({
        where: { deleted: false, btsName: { not: null } } as never,
        distinct: ['btsName'] as never,
        select: { btsName: true } as never,
      })) as unknown as Array<{ btsName: string | null }>;
      const names = distinct
        .map((r) => r.btsName)
        .filter((n): n is string => !!n && canonicalRegionForTowerName(n) === region && (!btsName || n === btsName));
      if (names.length === 0) {
        return success({
          records: [],
          total: 0,
          page,
          pageSize,
          totalPages: 1,
          summary: { total: 0, matched: 0, pending: 0, manual: 0, totalMrr: 0, towers: 0 },
        });
      }
      where.btsName = { in: names };
    }

    const fetchedRows = (await prisma.customer.findMany({ where: where as never })) as unknown as CustomerRow[];

    // Account type is derived after the DB query because Splynx frequently
    // stores the non-segmenting value `regular`; servicePlan is the fallback.
    let rows = accountType
      ? fetchedRows.filter((r) => deriveBtsAccountType(r.accountType, r.servicePlan) === accountType.toUpperCase())
      : fetchedRows;

    if (overdue === 'true' || overdue === 'false') {
      const overdueInvoices = await prisma.invoice.findMany({
        where: { isPaid: false, dueDate: { not: null, lte: BigInt(Date.now()) } },
        select: { customerId: true },
      });
      const overdueIds = new Set(overdueInvoices.map((invoice) => invoice.customerId));
      rows = rows.filter((r) => overdueIds.has(r.customerId) === (overdue === 'true'));
    }

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paged = rows.slice(start, start + pageSize);

    const summary: UnifiedRosterSummary = {
      total,
      matched: rows.filter((r) => r.matchState === 'matched').length,
      pending: rows.filter((r) => r.matchState === 'pending').length,
      manual: rows.filter((r) => r.matchState === 'manual').length,
      totalMrr: rows.reduce((acc, r) => acc + (r.mrrTotal ?? 0), 0),
      // Count real towers by ID, not free-text btsName strings (stale label text
      // and endpoint names inflated this to 93 vs 63 real towers).
      towers: new Set(rows.map((r) => (r as unknown as { btsId?: string | null }).btsId).filter(Boolean)).size,
    };

    const records: UnifiedCustomerRecord[] = paged.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerName: r.customerName,
      email: r.email,
      phone: r.phone,
      city: r.city,
      lifecycle: r.lifecycle,
      servicePlan: r.servicePlan,
      accountType: deriveBtsAccountType(r.accountType, r.servicePlan),
      mrrTotal: r.mrrTotal,
      btsId: r.btsId,
      btsName: r.btsName,
      uispEndpointName: r.uispEndpointName,
      uispDeviceStatus: r.uispDeviceStatus,
      uispOutageCount: r.uispOutageCount,
      matchState: r.matchState || 'pending',
      matchMethod: r.matchMethod,
      matchScore: r.matchScore,
      matchedAt: r.matchedAt == null ? null : Number(r.matchedAt),
    }));

    return success({ records, total, page, pageSize, totalPages, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-customers] GET error', { error: message });
    return serverError();
  }
}
