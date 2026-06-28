import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdd = vi.fn().mockResolvedValue({ id: 'mock-feedback-id' });
const mockCollection = vi.fn().mockReturnValue({ add: mockAdd });

vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => ({ collection: mockCollection }),
}));

vi.mock('@/lib/rate-limit', () => ({
  isRateLimited: vi.fn().mockReturnValue(false),
}));

vi.mock('@/ai/flows/analyze-customer-feedback-sentiment', () => ({
  analyzeCustomerFeedbackSentiment: vi.fn().mockResolvedValue({
    sentiment: 'positive',
    keyThemes: ['good service'],
    urgency: 'low',
  }),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

import { POST } from '../route';

function buildRequest(body: unknown) {
  return {
    json: () => Promise.resolve(body),
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    url: 'http://localhost:9002/api/submit-feedback',
  } as unknown as Request;
}

describe('POST /api/submit-feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validBody = {
    category: 'Reliability',
    customerName: 'Test User',
    customerEmail: 'test@example.com',
    location: 'Abeokuta',
    servicePlan: 'H-Lite',
    serviceDate: new Date().toISOString().split('T')[0],
    serviceDateEnd: new Date().toISOString().split('T')[0],
    comment: 'Great service experience with fast internet.',
    ratings: { stability: 4, latency: 4, peakPerformance: 5 },
  };

  it('returns 201 on valid submission', async () => {
    const response = await POST(buildRequest(validBody));
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.id).toBe('mock-feedback-id');
  });

  it('returns 400 on invalid JSON', async () => {
    const req = { json: () => Promise.reject(new Error('Invalid JSON')), headers: new Map() } as unknown as Request;
    const response = await POST(req);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain('Invalid JSON');
  });

  it('returns 400 on missing required fields', async () => {
    const response = await POST(buildRequest({}));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.details).toBeDefined();
  });

  it('returns 400 on invalid email format', async () => {
    const response = await POST(buildRequest({ ...validBody, customerEmail: 'not-an-email' }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.details?.customerEmail).toBeDefined();
  });

  it('returns 400 on invalid category', async () => {
    const response = await POST(buildRequest({ ...validBody, category: 'InvalidCategory' }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.details?.category).toBeDefined();
  });

  it('returns 400 on invalid location', async () => {
    const response = await POST(buildRequest({ ...validBody, location: '' }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.details?.location).toBeDefined();
  });

  it('returns 400 on ratings out of range', async () => {
    const response = await POST(buildRequest({ ...validBody, ratings: { stability: 6 } }));
    const body = await response.json();
    expect(response.status).toBe(400);
  });
});
