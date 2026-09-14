import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/paystack', () => ({ syncPaystackTransactions: mocks.sync }));
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: mocks.verifyAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { POST } from '../route';

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

describe('POST /api/admin/finance/paystack/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sync.mockResolvedValue({ fetched: 5, upserted: 4 });
  });

  it('returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await POST(post({}, null));
    expect(res.status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('returns 403 for ordinary admins', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(ORDINARY);
    const res = await POST(post({}));
    expect(res.status).toBe(403);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('returns 403 for Dorcas (manager-only sync)', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await POST(post({}));
    expect(res.status).toBe(403);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('returns fetched/upserted/skipped/failed counts for managers', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    const res = await POST(post({ maxPages: 2, statuses: ['success'] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ fetched: 5, upserted: 4, skipped: 1, failed: 0 });
    expect(mocks.sync).toHaveBeenCalledWith({ maxPages: 2, statuses: ['success'] });
  });

  it('returns 400 (not 500) for invalid maxPages', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    const res = await POST(post({ maxPages: 99 }));
    expect(res.status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
