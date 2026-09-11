import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findMany: vi.fn(),
  queueAdd: vi.fn().mockResolvedValue({ id: 'bull-1' }),
  markFailed: vi.fn().mockResolvedValue(undefined),
  verifySuperAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { emailJob: { updateMany: mocks.updateMany, findMany: mocks.findMany } } }));
vi.mock('@/lib/admin-auth', () => ({ verifySuperAdminToken: mocks.verifySuperAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/queues/email-queue', () => ({
  getEmailQueue: () => ({ add: mocks.queueAdd }),
  getPriorityForType: () => 1,
}));
vi.mock('@/lib/repositories/email-job-repo', () => ({ markEmailJobFailed: mocks.markFailed }));
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

describe('POST /api/admin/emails/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySuperAdmin.mockResolvedValue(ADMIN);
    mocks.queueAdd.mockResolvedValue({ id: 'bull-1' });
  });

  it('approve: flips pending_approval → pending and enqueues each WITH type', async () => {
    mocks.updateMany.mockResolvedValue({ count: 2 });
    mocks.findMany.mockResolvedValue([
      { id: 'a', type: 'winback', payload: { feedbackUrl: 'https://x/y' } },
      { id: 'b', type: 'invoice_reminder', payload: { invoiceIds: ['1'] } },
    ]);

    const res = await POST(req({ action: 'approve', ids: ['a', 'b'] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.affected).toBe(2);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] }, status: 'pending_approval' },
      data: expect.objectContaining({ status: 'pending', approvedBy: ADMIN.email }),
    });
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      'winback',
      expect.objectContaining({ type: 'winback', emailJobId: 'a' }),
      expect.anything(),
    );
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      'invoice_reminder',
      expect.objectContaining({ type: 'invoice_reminder', emailJobId: 'b' }),
      expect.anything(),
    );
  });

  it('approve: only touches pending_approval rows, marks enqueue failures', async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findMany.mockResolvedValue([{ id: 'a', type: 'winback', payload: {} }]);
    mocks.queueAdd.mockRejectedValueOnce(new Error('redis down'));

    const res = await POST(req({ action: 'approve', ids: ['a'] }));

    expect(res.status).toBe(200);
    expect(mocks.markFailed).toHaveBeenCalledWith('a', 'redis down', 0);
  });

  it('reject: marks rejected with reason, enqueues nothing', async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const res = await POST(req({ action: 'reject', ids: ['a'], reason: 'spam risk' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] }, status: 'pending_approval' },
      data: expect.objectContaining({ status: 'rejected', error: 'spam risk' }),
    });
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it('rejects non-super-admins and bad actions', async () => {
    mocks.verifySuperAdmin.mockResolvedValueOnce(null);
    expect((await POST(req({ action: 'approve', ids: ['a'] }))).status).toBe(403);

    const res = await POST(req({ action: 'nuke', ids: ['a'] }));
    expect(res.status).toBe(400);
  });
});
