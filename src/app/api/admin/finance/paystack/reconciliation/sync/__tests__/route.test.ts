import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  getJob: vi.fn(),
  getJobs: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/queues/reconciliation-queue', () => ({
  getReconciliationQueue: () => ({ add: mocks.queueAdd, getJob: mocks.getJob, getJobs: mocks.getJobs }),
}));
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: mocks.verifyAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { POST, GET } from '../route';

const DORCAS = { email: 'dorcas.olayoole@iworldnetworks.net', uid: 'dorcas-1' };
const MANAGER = { email: 'stella.akinola@iworldnetworks.net', uid: 'mgr-1' };
const ORDINARY = { email: 'random.agent@iworldnetworks.net', uid: 'ord-1' };

function post(body: unknown, auth: string | null = 'Bearer tok') {
  return {
    url: 'http://localhost:9002/api/admin/finance/paystack/reconciliation/sync',
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body,
    method: 'POST',
  } as unknown as NextRequest;
}

function get(url: string, auth: string | null = 'Bearer tok') {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    method: 'GET',
  } as unknown as NextRequest;
}

describe('POST /api/admin/finance/paystack/reconciliation/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueAdd.mockResolvedValue({ id: 'job-1' });
  });

  it('returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await POST(post({}, null));
    expect(res.status).toBe(401);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it('returns 403 for ordinary admins', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(ORDINARY);
    const res = await POST(post({}));
    expect(res.status).toBe(403);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it('returns 403 for Dorcas (manager-only sync)', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await POST(post({}));
    expect(res.status).toBe(403);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it('enqueues a reconciliation job and returns its jobId for managers', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    const res = await POST(post({ month: '2026-08' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ jobId: 'job-1', status: 'queued' });
    expect(mocks.queueAdd).toHaveBeenCalledWith('reconcile', { month: '2026-08' });
  });

  it('defaults to current month when month not provided', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const res = await POST(post({}));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.queueAdd).toHaveBeenCalledWith('reconcile', { month: currentMonth });
  });
});

describe('GET /api/admin/finance/paystack/reconciliation/sync', () => {
  const base = 'http://localhost:9002/api/admin/finance/paystack/reconciliation/sync';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await GET(get(`${base}?jobId=job-1`, null));
    expect(res.status).toBe(401);
  });

  it('returns 403 for ordinary admins (viewer access required)', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(ORDINARY);
    const res = await GET(get(`${base}?jobId=job-1`));
    expect(res.status).toBe(403);
    expect(mocks.getJob).not.toHaveBeenCalled();
  });

  it('lets viewers (Dorcas) check job status', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    mocks.getJob.mockResolvedValueOnce({
      id: 'job-1',
      getState: async () => 'active',
      progress: { stage: 'match', fetched: 1200, upserted: 1150 },
      returnvalue: null,
    });
    const res = await GET(get(`${base}?jobId=job-1`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      jobId: 'job-1',
      status: 'active',
      progress: { stage: 'match', fetched: 1200, upserted: 1150 },
      result: null,
    });
  });

  it('returns completed job result', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.getJob.mockResolvedValueOnce({
      id: 'job-1',
      getState: async () => 'completed',
      progress: {
        stage: 'complete',
        matched: 842,
        paystackOnly: 12,
        splynxOnly: 8,
        amountMismatch: 3,
        dateMismatch: 0,
        duplicate: 1,
        exceptionsCreated: 24,
      },
      returnvalue: {
        matched: 842,
        paystackOnly: 12,
        splynxOnly: 8,
        amountMismatch: 3,
        dateMismatch: 0,
        duplicate: 1,
        exceptionsCreated: 24,
      },
    });
    const res = await GET(get(`${base}?jobId=job-1`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.status).toBe('completed');
    expect(body.data.result).toEqual({
      matched: 842,
      paystackOnly: 12,
      splynxOnly: 8,
      amountMismatch: 3,
      dateMismatch: 0,
      duplicate: 1,
      exceptionsCreated: 24,
    });
  });

  it('returns 404 for unknown jobId', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.getJob.mockResolvedValueOnce(null);
    const res = await GET(get(`${base}?jobId=nope`));
    expect(res.status).toBe(404);
  });

  it('returns the most recent job when no jobId is given', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.getJobs.mockResolvedValueOnce([
      { id: 'job-2', timestamp: 200 },
      { id: 'job-1', timestamp: 100 },
    ]);
    mocks.getJob.mockResolvedValueOnce({
      id: 'job-2',
      getState: async () => 'completed',
      progress: {
        stage: 'complete',
        matched: 100,
        paystackOnly: 5,
        splynxOnly: 3,
        amountMismatch: 1,
        dateMismatch: 0,
        duplicate: 0,
        exceptionsCreated: 9,
      },
      returnvalue: { matched: 100, paystackOnly: 5, splynxOnly: 3, amountMismatch: 1, dateMismatch: 0, duplicate: 0, exceptionsCreated: 9 },
    });
    const res = await GET(get(base));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.jobId).toBe('job-2');
  });

  it('returns empty when there is no reconciliation history', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.getJobs.mockResolvedValueOnce([]);
    const res = await GET(get(base));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ job: null });
  });
});
