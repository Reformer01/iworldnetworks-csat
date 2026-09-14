import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findTransactions: vi.fn(),
  findLinks: vi.fn(),
  findExceptions: vi.fn(),
  findSnapshots: vi.fn(),
  findSnapshot: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    paystackTransaction: { findMany: mocks.findTransactions },
    paystackReconciliationLink: { findMany: mocks.findLinks },
    reconciliationException: { findMany: mocks.findExceptions },
    paystackMonthlySnapshot: { findMany: mocks.findSnapshots, findUnique: mocks.findSnapshot },
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

function get(url: string, auth: string | null = 'Bearer tok') {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    method: 'GET',
  } as unknown as NextRequest;
}

const TX = {
  reference: 'PSK-1',
  amount: 4350000,
  status: 'success',
  channel: 'card',
  customerEmail: 'ada@example.com',
  customerName: 'Ada Ace',
  gatewayResponse: 'Successful',
  paidAt: new Date('2026-08-01T10:00:00.000Z'),
};

describe('GET /api/admin/finance/paystack/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findTransactions.mockResolvedValue([TX]);
    mocks.findLinks.mockResolvedValue([]);
    mocks.findExceptions.mockResolvedValue([]);
    mocks.findSnapshots.mockResolvedValue([]);
    mocks.findSnapshot.mockResolvedValue(null);
  });

  it('returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/reports', null));
    expect(res.status).toBe(401);
  });

  it('returns 403 for ordinary admins', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(ORDINARY);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/reports'));
    expect(res.status).toBe(403);
  });

  it('returns 200 JSON for Dorcas', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/reports?scope=transactions&format=json'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
  });

  it('returns 400 (not 500) for invalid format and scope', async () => {
    mocks.verifyAdmin.mockResolvedValue(DORCAS);
    const badFormat = await GET(get('http://localhost:9002/api/admin/finance/paystack/reports?format=pdf'));
    expect(badFormat.status).toBe(400);

    const badScope = await GET(get('http://localhost:9002/api/admin/finance/paystack/reports?scope=nope'));
    expect(badScope.status).toBe(400);
  });

  it('returns CSV for Dorcas with format=csv', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/reports?scope=transactions&format=csv'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text.split('\n')[0]).toContain('reference');
    expect(text).toContain('PSK-1');
  });
});
