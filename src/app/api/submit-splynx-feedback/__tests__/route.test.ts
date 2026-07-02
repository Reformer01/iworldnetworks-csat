import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenRef = { path: 'feedback_tokens/test-token' };
const feedbackRef = { id: 'feedback-id', path: 'feedbacks/feedback-id' };
const mockTransactionGet = vi.fn();
const mockTransactionSet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockRunTransaction = vi.fn(async (callback) => callback({
  get: mockTransactionGet,
  set: mockTransactionSet,
  update: mockTransactionUpdate,
}));
const mockCollection = vi.fn((name: string) => {
  if (name === 'feedback_tokens') {
    return { doc: vi.fn(() => tokenRef) };
  }
  if (name === 'feedbacks') {
    return { doc: vi.fn(() => feedbackRef) };
  }
  throw new Error(`Unexpected collection ${name}`);
});

vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  }),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

import { POST } from '../route';

const token = '11111111-1111-4111-8111-111111111111';

function buildRequest(body: unknown) {
  return {
    json: () => Promise.resolve(body),
  } as Request;
}

function validTokenData(overrides: Record<string, unknown> = {}) {
  return {
    customerName: 'Token Customer',
    customerEmail: 'token@example.com',
    location: 'Lagos',
    servicePlan: 'Fiber 50',
    serviceDate: '2026-07-02',
    sourceEvent: 'invoice/create',
    used: false,
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe('POST /api/submit-splynx-feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => validTokenData(),
    });
  });

  it('creates feedback and marks the token used inside one transaction', async () => {
    const response = await POST(buildRequest({ token, rating: 5, comment: 'Great service.' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ success: true, id: 'feedback-id' });
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransactionGet).toHaveBeenCalledWith(tokenRef);
    expect(mockTransactionSet).toHaveBeenCalledWith(feedbackRef, expect.objectContaining({
      category: 'Billing',
      customerName: 'Token Customer',
      customerEmail: 'token@example.com',
      ratings: { overall: 5 },
      comment: 'Great service.',
      _source: 'splynx',
    }));
    expect(mockTransactionUpdate).toHaveBeenCalledWith(tokenRef, expect.objectContaining({
      used: true,
      submittedAt: expect.any(Number),
    }));
  });

  it('correctly maps sub-ratings and satisfied status into the feedback doc', async () => {
    const response = await POST(buildRequest({ 
      token, 
      rating: 4, 
      satisfied: 'partially',
      comment: 'Satisfactory but latency can improve.',
      ratings: { stability: 5, latency: 2 } 
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ success: true, id: 'feedback-id' });
    expect(mockTransactionSet).toHaveBeenCalledWith(feedbackRef, expect.objectContaining({
      ratings: { overall: 4, stability: 5, latency: 2 },
      satisfied: 'partially',
      comment: 'Satisfactory but latency can improve.',
    }));
  });

  it('does not create feedback when the token is already used', async () => {
    mockTransactionGet.mockResolvedValue({
      exists: true,
      data: () => validTokenData({ used: true }),
    });

    const response = await POST(buildRequest({ token, rating: 4 }));
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toBe('Token already used.');
    expect(mockTransactionSet).not.toHaveBeenCalled();
    expect(mockTransactionUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads before opening a transaction', async () => {
    const response = await POST(buildRequest({ token, rating: 6 }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Validation failed.');
    expect(mockRunTransaction).not.toHaveBeenCalled();
  });
});
