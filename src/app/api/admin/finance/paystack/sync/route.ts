import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceManager } from '@/lib/finance-access';
import { PAYSTACK_DASHBOARD_STATUSES, syncPaystackTransactions } from '@/lib/paystack';

export const dynamic = 'force-dynamic';

const MAX_PAGES_CAP = 10;
const DEFAULT_MAX_PAGES = 10;

function parseMaxPages(value: unknown): number | null {
  if (value == null || value === '') return DEFAULT_MAX_PAGES;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_PAGES_CAP) return null;
  return value;
}

function parseStatuses(value: unknown): string[] | null {
  if (value == null || value === '') return [...PAYSTACK_DASHBOARD_STATUSES];
  if (!Array.isArray(value) || value.length === 0) return null;
  const statuses = value.map((s) => (typeof s === 'string' ? s.trim().toLowerCase() : ''));
  if (statuses.some((s) => !s)) return null;
  return statuses;
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 10, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const managerBlock = requireFinanceManager(admin);
    if (managerBlock) return managerBlock;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const maxPages = parseMaxPages(body.maxPages);
    if (maxPages == null) return error(`maxPages must be an integer between 1 and ${MAX_PAGES_CAP}`);
    const statuses = parseStatuses(body.statuses);
    if (statuses == null) return error('statuses must be a non-empty array of status strings');

    const result = await syncPaystackTransactions({ maxPages, statuses });
    const fetched = result.fetched ?? 0;
    const upserted = result.upserted ?? 0;
    return success({
      fetched,
      upserted,
      skipped: Math.max(0, fetched - upserted),
      failed: 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-sync] POST error', { error: message });
    return serverError();
  }
}
