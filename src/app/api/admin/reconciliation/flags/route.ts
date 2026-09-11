// Reconciliation flags API (Leaf D). GET lists unresolved flag rows
// (action='flag' with no newer auto/ignore follow-up on the same
// recordId+field), paginated. POST resolves one flag: 'accept' applies the
// flagged truth to the target sales record, 'ignore' marks it resolved
// without a change — both write a follow-up ReconciliationLog row, which is
// what the resolution filter keys off (schema is frozen for this leaf).

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, tooMany, notFound, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Fields admins may accept onto a sales record — mirrors the reconcile job's
// own write surface (never period/dates/agent).
const APPLICABLE_FIELDS = ['bts', 'mrc', 'segment'];
const RESOLVING_ACTIONS = ['auto', 'ignore'];

// The generated Prisma client predates Leaf A's ReconciliationLog model —
// access it through a cast, removable once `prisma generate` has run.
const reconciliationLog = (
  prisma as unknown as {
    reconciliationLog: {
      findMany: (args: unknown) => Promise<unknown[]>;
      findUnique: (args: { where: { id: string } }) => Promise<unknown | null>;
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    };
  }
).reconciliationLog;

interface FlagRow {
  id: string;
  kind: string;
  recordId: string;
  field: string;
  beforeValue: unknown;
  afterValue: unknown;
  action: string;
  reason: string | null;
  createdAt: bigint;
}

async function requireEditor(request: NextRequest): Promise<{ uid: string; email: string } | null> {
  const authHeader = request.headers.get('authorization');
  const admin = await verifyAdminToken(authHeader);
  if (!admin) return null;
  if (!isSuperAdmin(admin.email) && !isEditor(admin.email)) return null;
  return admin;
}

// Auth failure → 401; authenticated but not privileged → 403 (matches the
// bts/customers route's editor gate).
async function authorizeEditor(request: NextRequest): Promise<{ uid: string; email: string } | Response> {
  const admin = await requireEditor(request);
  if (admin) return admin;
  const authHeader = request.headers.get('authorization');
  const authenticated = (await verifyAdminToken(authHeader)) !== null;
  return authenticated ? forbidden() : unauthorized();
}

/** createdAt of the newest resolving follow-up per recordId+field (null when none). */
async function followUpByKey(): Promise<Map<string, bigint>> {
  const rows = (await reconciliationLog.findMany({
    where: { action: { in: RESOLVING_ACTIONS } },
    select: { recordId: true, field: true, createdAt: true },
  })) as unknown as Array<{ recordId: string; field: string; createdAt: bigint }>;

  const byKey = new Map<string, bigint>();
  for (const row of rows) {
    const key = `${row.recordId}\u0000${row.field}`;
    const current = byKey.get(key);
    if (current === undefined || row.createdAt >= current) byKey.set(key, row.createdAt);
  }
  return byKey;
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const auth = await authorizeEditor(request);
    if (auth instanceof Response) return auth;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '20')), 200);
    const action = searchParams.get('action') || 'flag';
    const kind = searchParams.get('kind');

    const flags = (await reconciliationLog.findMany({
      where: { action, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'desc' },
    })) as unknown as FlagRow[];

    // The flags view only shows unresolved flags: rows with no newer
    // auto/ignore follow-up on the same recordId+field.
    // Loads all flags + all resolving rows, filters in memory;
    // switch to SQL if log volume ever outgrows a few thousand rows.
    let unresolved = flags;
    if (action === 'flag') {
      const resolvedAt = await followUpByKey();
      unresolved = flags.filter((flag) => {
        const followUp = resolvedAt.get(`${flag.recordId}\u0000${flag.field}`);
        return followUp === undefined || followUp < flag.createdAt;
      });
    }

    const total = unresolved.length;
    const start = (page - 1) * pageSize;
    return success({
      records: unresolved.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[reconciliation/flags] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const auth = await authorizeEditor(request);
    if (auth instanceof Response) return auth;

    const body = await request.json().catch(() => null);
    const id = typeof body?.id === 'string' ? body.id : null;
    const decision = body?.decision;
    if (!id || (decision !== 'accept' && decision !== 'ignore')) {
      return error('Flag id and decision ("accept" | "ignore") are required.');
    }

    const flag = (await reconciliationLog.findUnique({ where: { id } })) as unknown as FlagRow | null;
    if (!flag || flag.action !== 'flag') {
      return notFound('Flag not found.');
    }

    // Race guard: two admins accepting the same flag — the second is a
    // no-op, never a double-apply.
    const resolvedAt = await followUpByKey();
    const followUp = resolvedAt.get(`${flag.recordId}\u0000${flag.field}`);
    if (followUp !== undefined && followUp >= flag.createdAt) {
      return success({ status: 'already_resolved' });
    }

    const now = Date.now();

    if (decision === 'ignore') {
      const log = (await reconciliationLog.create({
        data: {
          kind: flag.kind,
          recordId: flag.recordId,
          field: flag.field,
          beforeValue: flag.beforeValue as never,
          afterValue: flag.afterValue as never,
          action: 'ignore',
          reason: 'ignored by admin',
          createdAt: BigInt(now),
        },
      })) as unknown as FlagRow;
      return success({ status: 'ignored', log });
    }

    // accept: apply the flagged truth to the target sales record.
    if (!APPLICABLE_FIELDS.includes(flag.field)) {
      return error(`Field "${flag.field}" is not applicable to sales records.`, 400);
    }
    const after = (flag.afterValue as { value?: unknown } | null)?.value;
    if (flag.field === 'mrc' && typeof after !== 'number') {
      return error('Flagged mrc value is not a number.', 400);
    }
    if (flag.field !== 'mrc' && typeof after !== 'string') {
      return error(`Flagged ${flag.field} value is not a string.`, 400);
    }

    const record = await prisma.salesRecordEntry.findUnique({ where: { id: flag.recordId } });
    if (!record || record.deletedAt) {
      return notFound('Target sales record not found.');
    }

    await prisma.salesRecordEntry.update({
      where: { id: flag.recordId },
      data: { [flag.field]: after, updatedAt: BigInt(now) } as never,
    });

    const log = (await reconciliationLog.create({
      data: {
        kind: 'record',
        recordId: flag.recordId,
        field: flag.field,
        beforeValue: flag.beforeValue as never,
        afterValue: flag.afterValue as never,
        action: 'auto',
        reason: 'accepted by admin',
        createdAt: BigInt(now),
      },
    })) as unknown as FlagRow;
    return success({ status: 'applied', log });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[reconciliation/flags] POST error', { error: message });
    return serverError();
  }
}
