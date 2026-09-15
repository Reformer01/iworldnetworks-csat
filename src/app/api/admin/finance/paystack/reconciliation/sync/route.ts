import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, notFound, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceManager, requireFinanceViewer } from '@/lib/finance-access';
import { getReconciliationQueue } from '@/lib/queues/reconciliation-queue';

export const dynamic = 'force-dynamic';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

function parseMonth(value: unknown): string | null {
  if (value == null || value === '') return new Date().toISOString().slice(0, 7);
  if (typeof value === 'string' && MONTH_REGEX.test(value)) return value;
  return null;
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
    const month = parseMonth(body.month);
    if (!month) return error('month must be YYYY-MM');

    const queue = getReconciliationQueue();
    const job = await queue.add('reconcile', { month });
    return success({ jobId: job.id, status: 'queued' as const });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[reconciliation-sync] POST error', { error: message });
    return serverError();
  }
}

async function toJobState(jobId: string) {
  const queue = getReconciliationQueue();
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
    ...(status === 'failed' ? { error: job.failedReason ?? 'Reconciliation failed' } : {}),
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

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    if (jobId) {
      const state = await toJobState(jobId);
      if (!state) return notFound('Reconciliation job not found.');
      return success(state);
    }

    const queue = getReconciliationQueue();
    const jobs = await queue.getJobs(['active', 'waiting', 'delayed', 'paused', 'completed', 'failed'], 0, 5);
    if (!jobs.length) return success({ job: null });
    jobs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    const newest = jobs[0];
    const state = await toJobState(newest.id as string);
    if (!state) return success({ job: null });
    return success(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[reconciliation-sync] GET error', { error: message });
    return serverError();
  }
}
