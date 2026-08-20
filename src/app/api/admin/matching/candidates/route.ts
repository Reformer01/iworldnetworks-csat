import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, tooMany, notFound, serverError, validateOrigin } from '@/lib/api-response';
import { withCache } from '@/lib/route-cache';
import { writeAuditLog } from '@/lib/audit-log';
import { logError } from '@/lib/logger';
import { matchScore, endpointRegionKey } from '@/lib/matching/score';
import type { MatchCustomer } from '@/lib/matching/score';

export const dynamic = 'force-dynamic';

const ENDPOINTS_CACHE_MS = 60_000;
const CANDIDATES_CACHE_MS = 60_000;
const TOP_N = 10;

// NOTE: the generated Prisma client predates Leaf A's schema additions
// (Customer.matchState & co.). The casts on Customer queries/writes are
// removable once `prisma generate` has run with the current schema.

type EndpointRow = { id: string; name: string; btsName: string | null; status: string | null; deviceOutageCount: number | null };

/** Customer row fields used by this route (Leaf A fields included). */
type CustomerRow = {
  id: string;
  customerId: string;
  customerName: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  btsId: string | null;
  btsName: string | null;
  uispEndpointId: string | null;
  uispEndpointName: string | null;
  uispDeviceStatus: string | null;
  uispOutageCount: number | null;
  matchState: string | null;
  matchMethod: string | null;
  matchScore: number | null;
  matchedAt: bigint | null;
  matchUpdatedAt: bigint | null;
  deleted: boolean;
};

const ENDPOINT_SELECT = {
  id: true,
  name: true,
  btsName: true,
  status: true,
  deviceOutageCount: true,
} as const;

function loadEndpoints(): Promise<EndpointRow[]> {
  return withCache('matching-endpoints', ENDPOINTS_CACHE_MS, () =>
    prisma.uispSite.findMany({ where: { type: 'endpoint', btsName: { not: null } }, select: ENDPOINT_SELECT }),
  );
}

interface Candidate {
  endpointId: string;
  name: string;
  btsName: string | null;
  status: string | null;
  deviceOutageCount: number | null;
  region: string | null;
  score: number;
}

/** Top 10 endpoints by score for one pending customer (60s cache). */
function candidatesFor(customer: CustomerRow): Promise<Candidate[]> {
  return withCache(`matching-candidates:${customer.id}`, CANDIDATES_CACHE_MS, async () => {
    const endpoints = await loadEndpoints();
    const profile: MatchCustomer = {
      name: customer.customerName ?? '',
      city: customer.city,
      phone: customer.phone,
      email: customer.email,
    };
    const ranked = endpoints
      .map((ep) => ({
        endpoint: ep,
        score: matchScore(profile, { name: ep.name, btsName: ep.btsName }),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    // Ranked, deduped by endpoint name (UISP can hold duplicates), top 10.
    const seen = new Set<string>();
    const top: Candidate[] = [];
    for (const r of ranked) {
      const key = r.endpoint.name.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      top.push({
        endpointId: r.endpoint.id,
        name: r.endpoint.name,
        btsName: r.endpoint.btsName,
        status: r.endpoint.status,
        deviceOutageCount: r.endpoint.deviceOutageCount,
        region: endpointRegionKey(r.endpoint.btsName),
        score: r.score,
      });
      if (top.length === TOP_N) break;
    }
    return top;
  });
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
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 200);

    const customers = (await prisma.customer.findMany({
      where: { deleted: false, matchState: 'pending' } as never,
      orderBy: { customerName: 'asc' },
    })) as unknown as CustomerRow[];

    const filtered = search
      ? customers.filter(
          (c) =>
            c.customerName?.toLowerCase().includes(search) ||
            c.city?.toLowerCase().includes(search) ||
            c.uispEndpointName?.toLowerCase().includes(search),
        )
      : customers;

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    const records = await Promise.all(paged.map(async (c) => ({ customer: serializeCustomer(c), candidates: await candidatesFor(c) })));

    return success({ records, total, page, pageSize, totalPages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[matching-candidates] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }
    if (!isSuperAdmin(admin.email) && !isEditor(admin.email)) {
      return forbidden('Only super admins and editors can assign matches.');
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.customerId || body.endpointId === undefined) {
      return error('customerId and endpointId are required.');
    }

    // endpointId === null is the "no match" action: the customer is marked
    // manual with no endpoint, so auto-matching never picks it up again.
    const [customer, endpoint] = await Promise.all([
      prisma.customer.findUnique({ where: { id: body.customerId } }) as unknown as Promise<CustomerRow | null>,
      body.endpointId !== null ? prisma.uispSite.findUnique({ where: { id: body.endpointId } }) : Promise.resolve(null),
    ]);
    if (!customer || customer.deleted) {
      return notFound('Customer not found.');
    }
    if (body.endpointId !== null && (!endpoint || endpoint.type !== 'endpoint')) {
      return notFound('Endpoint not found.');
    }

    const now = Date.now();
    const score = endpoint
      ? matchScore(
          { name: customer.customerName ?? '', city: customer.city, phone: customer.phone, email: customer.email },
          { name: endpoint.name, btsName: endpoint.btsName },
        )
      : null;

    const updated = (await prisma.customer.update({
      where: { id: customer.id },
      data: (endpoint
        ? {
            matchState: 'manual',
            matchMethod: 'manual',
            btsId: endpoint.btsId,
            btsName: endpoint.btsName,
            uispEndpointId: endpoint.id,
            uispEndpointName: endpoint.name,
            uispDeviceStatus: endpoint.status,
            uispOutageCount: endpoint.deviceOutageCount,
            matchScore: score,
            matchedAt: BigInt(now),
            matchUpdatedAt: BigInt(now),
          }
        : {
            matchState: 'manual',
            matchMethod: 'manual',
            btsId: null,
            btsName: null,
            uispEndpointId: null,
            uispEndpointName: null,
            uispDeviceStatus: null,
            uispOutageCount: null,
            matchScore: null,
            matchedAt: BigInt(now),
            matchUpdatedAt: BigInt(now),
          }) as never,
    })) as unknown as CustomerRow;

    void writeAuditLog({
      action: 'update',
      collection: 'customer_matching',
      recordId: customer.id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: endpoint
        ? {
            matchState: 'manual',
            matchMethod: 'manual',
            uispEndpointId: endpoint.id,
            uispEndpointName: endpoint.name,
            matchScore: score,
          }
        : {
            matchState: 'manual',
            matchMethod: 'manual',
            uispEndpointId: null,
            matchScore: null,
          },
      previousState: { matchState: customer.matchState, uispEndpointId: customer.uispEndpointId },
    });

    return success({ customer: serializeCustomer(updated) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[matching-candidates] POST error', { error: message });
    return serverError();
  }
}

/** BigInt timestamps are not JSON-serializable; expose them as epoch-ms numbers. */
function serializeCustomer(c: CustomerRow) {
  return {
    id: c.id,
    customerId: c.customerId,
    customerName: c.customerName,
    city: c.city,
    phone: c.phone,
    email: c.email,
    btsId: c.btsId,
    btsName: c.btsName,
    uispEndpointId: c.uispEndpointId,
    uispEndpointName: c.uispEndpointName,
    uispDeviceStatus: c.uispDeviceStatus,
    uispOutageCount: c.uispOutageCount,
    matchState: c.matchState,
    matchMethod: c.matchMethod,
    matchScore: c.matchScore,
    matchedAt: c.matchedAt != null ? Number(c.matchedAt) : null,
    matchUpdatedAt: c.matchUpdatedAt != null ? Number(c.matchUpdatedAt) : null,
  };
}
