import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, notFound, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceManager, requireFinanceViewer } from '@/lib/finance-access';
import { PAYSTACK_DASHBOARD_STATUSES } from '@/lib/paystack';
import { getPaystackSyncQueue } from '@/lib/queues/paystack-sync-queue';

export const dynamic = 'force-dynamic';

const MAX_PAGES_CAP = 100;
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

    const queue = getPaystackSyncQueue();
    const job = await queue.add('sync', { maxPages, statuses });
    return success({ jobId: job.id, status: 'queued' as const });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-sync] POST error', { error: message });
    return serverError();
  }
}

async function toJobState(jobId: string) {
  const queue = getPaystackSyncQueue();
  const job = await queue.getJob(jobId);
  if (!job) return null;
  const status = await job.getState();
  const progress = (job.progress ?? null) as unknown;
  const result = (job.returnvalue ?? null) as unknown;
  return {
    jobId: job.id as string,
    status,
    progress,
    result,
    ...(status === 'failed' ? { error: job.failedReason ?? 'Sync failed' } : {}),
  };
}

export async function GET(request: NextRequest) {
  try {
    // Status polling is a cheap Redis lookup — allow the UI's 3s poll loop.
    if (isRateLimited(request, 60, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const viewerBlock = requireFinanceViewer(admin);
    if (viewerBlock) return viewerBlock;

    const jobId = new URL(request.url).searchParams.get('jobId');
    if (jobId) {
      const state = await toJobState(jobId);
      if (!state) return notFound('Sync job not found.');
      return success(state);
    }

    const queue = getPaystackSyncQueue();
    const jobs = await queue.getJobs(['active', 'waiting', 'delayed', 'paused', 'completed', 'failed'], 0, 5);
    if (!jobs.length) return success({ job: null });
    jobs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    const newest = jobs[0];
    const state = await toJobState(newest.id as string);
    if (!state) return success({ job: null });
    return success(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-sync] GET error', { error: message });
    return serverError();
  }
}
