import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  queueAdd: vi.fn().mockResolvedValue({ id: 'bull-1' }),
  markFailed: vi.fn().mockResolvedValue(undefined),
  verifyAdmin: vi.fn(),
  verifySuperAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { emailJob: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany } } }));
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminToken: mocks.verifyAdmin,
  verifySuperAdminToken: mocks.verifySuperAdmin,
}));
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
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const WINBACK = {
  id: 'job-1',
  status: 'pending_approval',
  type: 'winback',
  payload: { portalUrl: 'https://portal.iwn.ng', feedbackUrl: 'https://csat.iwn.ng/feedback/popup?token=t' },
};

describe('POST /api/admin/emails/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAdmin.mockResolvedValue(ADMIN);
    mocks.verifySuperAdmin.mockResolvedValue(ADMIN);
    mocks.queueAdd.mockResolvedValue({ id: 'bull-1' });
  });

  it('approve: pending_approval → pending + enqueues WITH type', async () => {
    mocks.findUnique.mockResolvedValue({ ...WINBACK });

    const res = await POST(req({ action: 'approve' }), params('job-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { status: 'pending', approvedAt: expect.any(BigInt), approvedBy: ADMIN.email },
    });
    // The stored payload has no `type` — the route must re-attach it or the
    // worker throws "Unknown email job type".
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      'winback',
      expect.objectContaining({ type: 'winback', emailJobId: 'job-1', feedbackUrl: expect.stringContaining('/feedback/') }),
      expect.anything(),
    );
  });

  it('approve: rejects non-super-admins', async () => {
    mocks.findUnique.mockResolvedValue({ ...WINBACK });
    mocks.verifySuperAdmin.mockResolvedValue(null);

    const res = await POST(req({ action: 'approve' }), params('job-1'));

    expect(res.status).toBe(403);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it('approve: rejects jobs not awaiting approval', async () => {
    mocks.findUnique.mockResolvedValue({ ...WINBACK, status: 'pending' });

    const res = await POST(req({ action: 'approve' }), params('job-1'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/awaiting approval/i);
  });

  it('approve: marks failed when enqueue throws (no phantom approved)', async () => {
    mocks.findUnique.mockResolvedValue({ ...WINBACK });
    mocks.queueAdd.mockRejectedValueOnce(new Error('redis down'));

    const res = await POST(req({ action: 'approve' }), params('job-1'));

    expect(res.status).toBe(500);
    expect(mocks.markFailed).toHaveBeenCalledWith('job-1', 'redis down', 0);
  });

  it('reject: marks rejected with truncated reason', async () => {
    mocks.findUnique.mockResolvedValue({ ...WINBACK });

    const res = await POST(req({ action: 'reject', reason: 'not a fit' }), params('job-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('rejected');
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'rejected', approvedBy: ADMIN.email, error: 'not a fit' }),
    });
  });

  it('retry: failed → pending + re-enqueues with type', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'job-9',
      status: 'failed',
      type: 'feedback_request',
      payload: { feedbackUrl: 'https://csat.iwn.ng/feedback?token=t', sourceEvent: 'x' },
    });

    const res = await POST(req({}), params('job-9'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('pending');
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      'feedback_request',
      expect.objectContaining({ type: 'feedback_request', emailJobId: 'job-9' }),
      expect.anything(),
    );
  });

  it('retry: rejects non-failed jobs', async () => {
    mocks.findUnique.mockResolvedValue({ ...WINBACK, status: 'sent' });

    const res = await POST(req({}), params('job-9'));

    expect(res.status).toBe(400);
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it('returns 401 without a token and 404 for unknown id', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    expect((await POST(req({}), params('job-1'))).status).toBe(401);

    mocks.findUnique.mockResolvedValueOnce(null);
    expect((await POST(req({}), params('nope'))).status).toBe(404);
  });
});
