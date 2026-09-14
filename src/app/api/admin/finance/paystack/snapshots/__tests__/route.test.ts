import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findTransactions: vi.fn(),
  findLinks: vi.fn(),
  findExceptions: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    paystackTransaction: { findMany: mocks.findTransactions },
    paystackReconciliationLink: { findMany: mocks.findLinks },
    reconciliationException: { findMany: mocks.findExceptions },
    paystackMonthlySnapshot: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
    },
  },
}));
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: mocks.verifyAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { GET, POST } from '../route';

const DORCAS = { email: 'dorcas.olayoole@iworldnetworks.net', uid: 'dorcas-1' };
const MANAGER = { email: 'stella.akinola@iworldnetworks.net', uid: 'mgr-1' };
const ORDINARY = { email: 'random.agent@iworldnetworks.net', uid: 'ord-1' };

function get(url: string, auth: string | null = 'Bearer tok') {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    method: 'GET',
  } as unknown as NextRequest;
}

function post(body: unknown, auth: string | null = 'Bearer tok') {
  return {
    url: 'http://localhost:9002/api/admin/finance/paystack/snapshots',
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body,
    method: 'POST',
  } as unknown as NextRequest;
}

describe('paystack snapshots routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findTransactions.mockResolvedValue([]);
    mocks.findLinks.mockResolvedValue([]);
    mocks.findExceptions.mockResolvedValue([]);
    mocks.findMany.mockResolvedValue([]);
  });

  it('GET returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/snapshots', null));
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for ordinary admins', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(ORDINARY);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/snapshots'));
    expect(res.status).toBe(403);
  });

  it('GET returns 200 for Dorcas (viewer-readable snapshots)', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/snapshots'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
  });

  it('POST returns 403 for Dorcas (manager-only snapshot freezing)', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await POST(post({ month: '2026-08' }));
    expect(res.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('POST returns 400 (not 500) for an invalid month', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    const res = await POST(post({ month: 'nope' }));
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('POST creates a snapshot with read-then-create when none exists', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.findUnique.mockResolvedValueOnce(null);
    mocks.create.mockResolvedValueOnce({ id: 'snap-1', month: '2026-08' });
    const res = await POST(post({ month: '2026-08' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { month: '2026-08' } });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ month: '2026-08', savedBy: MANAGER.email }),
    });
  });

  it('POST updates the snapshot with read-then-update when it exists', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.findUnique.mockResolvedValueOnce({ id: 'snap-1', month: '2026-08' });
    mocks.update.mockResolvedValueOnce({ id: 'snap-1', month: '2026-08' });
    const res = await POST(post({ month: '2026-08' }));
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { month: '2026-08' },
      data: expect.objectContaining({ savedBy: MANAGER.email }),
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
