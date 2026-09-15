import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  getJob: vi.fn(),
  getJobs: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/queues/paystack-sync-queue', () => ({
  getPaystackSyncQueue: () => ({ add: mocks.queueAdd, getJob: mocks.getJob, getJobs: mocks.getJobs }),
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
    url: 'http://localhost:9002/api/admin/finance/paystack/sync',
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

describe('POST /api/admin/finance/paystack/sync', () => {
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

  it('enqueues a sync job and returns its jobId for managers', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    const res = await POST(post({ maxPages: 2, statuses: ['success'] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ jobId: 'job-1', status: 'queued' });
    expect(mocks.queueAdd).toHaveBeenCalledWith('sync', { maxPages: 2, statuses: ['success'] });
  });

  it('returns 400 (not 500) for invalid maxPages', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    const res = await POST(post({ maxPages: 101 }));
    expect(res.status).toBe(400);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/finance/paystack/sync', () => {
  const base = 'http://localhost:9002/api/admin/finance/paystack/sync';

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
      progress: { fetched: 1200, upserted: 900 },
      returnvalue: null,
    });
    const res = await GET(get(`${base}?jobId=job-1`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      jobId: 'job-1',
      status: 'active',
      progress: { fetched: 1200, upserted: 900 },
      result: null,
    });
  });

  it('returns completed job result', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.getJob.mockResolvedValueOnce({
      id: 'job-1',
      getState: async () => 'completed',
      progress: { fetched: 5, upserted: 4 },
      returnvalue: { fetched: 5, upserted: 4 },
    });
    const res = await GET(get(`${base}?jobId=job-1`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.status).toBe('completed');
    expect(body.data.result).toEqual({ fetched: 5, upserted: 4 });
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
      progress: { fetched: 5, upserted: 4 },
      returnvalue: { fetched: 5, upserted: 4 },
    });
    const res = await GET(get(base));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.jobId).toBe('job-2');
  });

  it('returns empty when there is no sync history', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.getJobs.mockResolvedValueOnce([]);
    const res = await GET(get(base));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ job: null });
  });
});
