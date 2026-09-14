import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findTransactions: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { paystackTransaction: { findMany: mocks.findTransactions } },
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

describe('GET /api/admin/finance/paystack/customers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findTransactions.mockResolvedValue([]);
  });

  it('returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await GET(req('http://localhost:9002/api/admin/finance/paystack/customers', null));
    expect(res.status).toBe(401);
  });

  it('returns 403 for ordinary admins', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(ORDINARY);
    const res = await GET(req('http://localhost:9002/api/admin/finance/paystack/customers'));
    expect(res.status).toBe(403);
  });

  it('returns 200 for Dorcas with cohort rows', async () => {
    mocks.findTransactions.mockResolvedValueOnce([
      {
        reference: 'PSK-1',
        amount: 4350000,
        status: 'success',
        channel: 'card',
        customerEmail: 'a@example.com',
        customerName: 'Ada',
        gatewayResponse: 'Approved',
        paidAt: new Date('2026-08-01T10:00:00.000Z'),
        raw: { metadata: { region: 'Ogun', segment: 'SME' } },
      },
      {
        reference: 'PSK-2',
        amount: 100000,
        status: 'success',
        channel: 'bank',
        customerEmail: 'a@example.com',
        customerName: 'Ada',
        gatewayResponse: 'Approved',
        paidAt: new Date('2026-08-05T10:00:00.000Z'),
        raw: { metadata: { region: 'Ogun', segment: 'SME' } },
      },
    ]);
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await GET(req('http://localhost:9002/api/admin/finance/paystack/customers?month=2026-08'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.items[0]).toMatchObject({
      email: 'a@example.com',
      lifetimeNaira: 44500,
      frequency: 2,
      region: 'Ogun',
      segment: 'SME',
      status: 'returning',
    });
  });

  it('returns 400 (not 500) for invalid pagination', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await GET(req('http://localhost:9002/api/admin/finance/paystack/customers?page=0'));
    expect(res.status).toBe(400);
  });
});
