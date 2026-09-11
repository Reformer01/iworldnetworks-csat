import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  drain: vi.fn().mockResolvedValue(undefined),
  clean: vi.fn().mockResolvedValue([]),
  verifySuperAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { emailJob: { updateMany: mocks.updateMany, deleteMany: mocks.deleteMany } } }));
vi.mock('@/lib/admin-auth', () => ({ verifySuperAdminToken: mocks.verifySuperAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/queues/email-queue', () => ({
  getEmailQueue: () => ({ drain: mocks.drain, clean: mocks.clean }),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { POST } from '../route';

const ADMIN = { email: 'boss@iworldnetworks.net', uid: 'u1' };

function req(body: unknown) {
  return {
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? 'Bearer tok' : null) },
    json: async () => body,
    method: 'POST',
  } as unknown as NextRequest;
}

describe('POST /api/admin/emails/clear', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySuperAdmin.mockResolvedValue(ADMIN);
    mocks.updateMany.mockResolvedValue({ count: 3 });
  });

  it('defaults to pending with the audit guard (sent/enqueued rows untouched)', async () => {
    const res = await POST(req({}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.statuses).toEqual(['pending']);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['pending'] },
        sentAt: null,
        bullJobId: null,
      },
      data: expect.objectContaining({ status: 'cancelled' }),
    });
    expect(body.data.cleared).toBe(3);
  });

  it('ignores disallowed statuses, no-ops on empty set', async () => {
    const res = await POST(req({ statuses: ['sent', 'bogus'] }));
    const body = await res.json();

    expect(body.data.cleared).toBe(0);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('hard=true deletes instead of cancelling', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 2 });

    const res = await POST(req({ hard: true }));
    const body = await res.json();

    expect(body.data.cleared).toBe(2);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['pending'] },
        sentAt: null,
      },
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('rejects non-super-admins', async () => {
    mocks.verifySuperAdmin.mockResolvedValueOnce(null);

    const res = await POST(req({}));

    expect(res.status).toBe(401);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
