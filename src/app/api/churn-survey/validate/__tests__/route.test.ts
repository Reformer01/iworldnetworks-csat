import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const churnMock = vi.hoisted(() => ({
  getChurnSurvey: vi.fn(),
}));

vi.mock('@/lib/lib/db/churn', () => churnMock);
vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => undefined }),
      }),
    }),
  }),
}));
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn() }));

import { GET } from '../route';

const NOW = Date.UTC(2026, 7, 14, 12, 0, 0);

function makeRequest(token: string | null): NextRequest {
  const url = token ? `https://csat.iwn.ng/api/churn-survey/validate?token=${token}` : 'https://csat.iwn.ng/api/churn-survey/validate';
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  churnMock.getChurnSurvey.mockResolvedValue(null);
});

describe('churn-survey validate (DB-first)', () => {
  it('requires a token', async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it('returns the customer name for a valid unused token from MariaDB', async () => {
    churnMock.getChurnSurvey.mockResolvedValue({
      id: 'tok-1',
      customerName: 'Acme ISP',
      used: false,
      expiresAt: BigInt(Date.now() + 60 * 60 * 1000),
    });
    const res = await GET(makeRequest('tok-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, customerName: 'Acme ISP' });
  });

  it('rejects used tokens', async () => {
    churnMock.getChurnSurvey.mockResolvedValue({
      id: 'tok-1',
      customerName: 'Acme ISP',
      used: true,
      expiresAt: BigInt(Date.now() + 60 * 60 * 1000),
    });
    const res = await GET(makeRequest('tok-1'));
    expect(res.status).toBe(410);
  });

  it('rejects expired tokens', async () => {
    churnMock.getChurnSurvey.mockResolvedValue({
      id: 'tok-1',
      customerName: 'Acme ISP',
      used: false,
      expiresAt: BigInt(NOW - 1000),
    });
    const res = await GET(makeRequest('tok-1'));
    expect(res.status).toBe(410);
  });

  it('falls back to Firestore when the DB has no row', async () => {
    const res = await GET(makeRequest('missing'));
    expect(res.status).toBe(404);
  });
});