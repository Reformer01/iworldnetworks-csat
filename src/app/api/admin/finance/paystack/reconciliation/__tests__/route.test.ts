import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findTransactions: vi.fn(),
  findLedger: vi.fn(),
  findLinks: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    paystackTransaction: { findMany: mocks.findTransactions },
    splynxIncomeLedger: { findMany: mocks.findLedger },
    paystackReconciliationLink: { findMany: mocks.findLinks },
  },
}));
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: mocks.verifyAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { GET } from '../route';

const DORCAS = { email: 'dorcas.olayoole@iworldnetworks.net', uid: 'dorcas-1' };
const ORDINARY = { email: 'random.agent@iworldnetworks.net', uid: 'ord-1' };

function req(url: string, auth: string | null = 'Bearer tok') {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    method: 'GET',
  } as unknown as NextRequest;
}

describe('GET /api/admin/finance/paystack/reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findTransactions.mockResolvedValue([]);
    mocks.findLedger.mockResolvedValue([]);
    mocks.findLinks.mockResolvedValue([]);
  });

  it('returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await GET(req('http://localhost:9002/api/admin/finance/paystack/reconciliation', null));
    expect(res.status).toBe(401);
  });

  it('returns 403 for ordinary admins', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(ORDINARY);
    const res = await GET(req('http://localhost:9002/api/admin/finance/paystack/reconciliation'));
    expect(res.status).toBe(403);
  });

  it('returns 200 for Dorcas with all six queues', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await GET(req('http://localhost:9002/api/admin/finance/paystack/reconciliation?page=1&perPage=20'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    for (const name of ['matched', 'paystack-only', 'splynx-only', 'amount-mismatch', 'date-mismatch', 'duplicate']) {
      expect(body.data.counts[name]).toBe(0);
      expect(body.data.queues[name].count).toBe(0);
      expect(body.data.queues[name].rows).toEqual([]);
    }
  });

  it('returns 400 (not 500) for invalid pagination', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await GET(req('http://localhost:9002/api/admin/finance/paystack/reconciliation?page=0'));
    expect(res.status).toBe(400);
  });
});
