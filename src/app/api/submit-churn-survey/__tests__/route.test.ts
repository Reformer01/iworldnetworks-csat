import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  db: { label: 'db' },
  isRateLimitedFirestore: vi.fn().mockResolvedValue(false),
  validateOrigin: vi.fn().mockReturnValue(true),
  logError: vi.fn(),
}));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => mocks.db,
}));

vi.mock('@/lib/rate-limit-firestore', () => ({
  isRateLimitedFirestore: mocks.isRateLimitedFirestore,
}));

vi.mock('@/lib/api-response', () => ({
  validateOrigin: mocks.validateOrigin,
}));

vi.mock('@/lib/logger', () => ({
  logError: mocks.logError,
}));

import { POST } from '../route';

const VALID_TOKEN = '11111111-2222-4333-8444-555555555555';

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
  const lowerHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    json: () => Promise.resolve(body),
    headers: {
      get: (name: string) => lowerHeaders.get(name.toLowerCase()) || null,
    },
    nextUrl: { pathname: '/api/submit-churn-survey' },
  } as unknown as NextRequest;
}

function makeTransaction(doc: { exists: boolean; data: Record<string, unknown> }) {
  mocks.db.collection = vi.fn(() => ({
    doc: (id: string) => ({ id, ...doc }),
  }));
  return {
    get: vi.fn().mockResolvedValue({ exists: doc.exists, data: () => doc.data }),
    update: vi.fn(),
  };
}

describe('POST /api/submit-churn-survey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a valid survey submission', async () => {
    const transaction = makeTransaction({
      exists: true,
      data: { customerId: 5, used: false, expiresAt: Date.now() + 100000 },
    });
    mocks.db.runTransaction = vi.fn(async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction));

    const response = await POST(buildRequest({ token: VALID_TOKEN, rating: 2, reason: 'Cost/Pricing', comment: 'Too expensive' }), {
      'content-type': 'application/json',
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(transaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ used: true, rating: 2, reason: 'Cost/Pricing', comment: 'Too expensive' }),
    );
  });

  it('rejects already-used tokens', async () => {
    const transaction = makeTransaction({
      exists: true,
      data: { customerId: 5, used: true, expiresAt: Date.now() + 100000 },
    });
    mocks.db.runTransaction = vi.fn(async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction));

    const response = await POST(buildRequest({ token: VALID_TOKEN, rating: 4, reason: 'Moved Away', comment: '' }));

    expect(response.status).toBe(410);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('rejects expired tokens', async () => {
    const transaction = makeTransaction({
      exists: true,
      data: { customerId: 5, used: false, expiresAt: Date.now() - 1000 },
    });
    mocks.db.runTransaction = vi.fn(async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction));

    const response = await POST(buildRequest({ token: VALID_TOKEN, rating: 4, reason: 'Speed', comment: '' }));

    expect(response.status).toBe(410);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('rejects unknown tokens', async () => {
    const transaction = makeTransaction({ exists: false, data: {} });
    mocks.db.runTransaction = vi.fn(async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction));

    const response = await POST(buildRequest({ token: VALID_TOKEN, rating: 4, reason: 'Other', comment: '' }));

    expect(response.status).toBe(404);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads', async () => {
    const response = await POST(buildRequest({ token: 'not-a-uuid', rating: 9, reason: 'Nope', comment: '' }));

    expect(response.status).toBe(400);
    expect(mocks.db.runTransaction).not.toHaveBeenCalled();
  });

  it('rate limits repeated submissions', async () => {
    mocks.isRateLimitedFirestore.mockResolvedValueOnce(true);

    const response = await POST(buildRequest({ token: VALID_TOKEN, rating: 4, reason: 'Other', comment: '' }));

    expect(response.status).toBe(429);
    expect(mocks.db.runTransaction).not.toHaveBeenCalled();
  });

  it('rejects disallowed origins', async () => {
    mocks.validateOrigin.mockReturnValueOnce(false);

    const response = await POST(buildRequest({ token: VALID_TOKEN, rating: 4, reason: 'Other', comment: '' }));

    expect(response.status).toBe(403);
    expect(mocks.db.runTransaction).not.toHaveBeenCalled();
  });
});
