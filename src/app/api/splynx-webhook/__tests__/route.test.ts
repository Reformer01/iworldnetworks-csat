import { createHmac } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  db: { label: 'db' },
  createFeedbackToken: vi.fn().mockResolvedValue({ token: 'token-123', expiresAt: Date.now() + 1000 }),
  findFeedbackTokenByEventHash: vi.fn().mockResolvedValue(null),
  findRecentFeedbackToken: vi.fn().mockResolvedValue(null),
  sendFeedbackEmail: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  prismaCustomerFindUnique: vi.fn().mockResolvedValue({ email: 'test@example.com', customerName: 'Test Customer', emailOptOut: false }),
  createEmailJob: vi.fn().mockResolvedValue('email-job-123'),
  markEmailJobSent: vi.fn().mockResolvedValue(undefined),
  markEmailJobFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => mocks.db,
}));

vi.mock('@/lib/feedback-token', () => ({
  createFeedbackToken: mocks.createFeedbackToken,
  findFeedbackTokenByEventHash: mocks.findFeedbackTokenByEventHash,
  findRecentFeedbackToken: mocks.findRecentFeedbackToken,
  getFeedbackBaseUrl: () => 'http://localhost:9002',
}));

vi.mock('@/lib/email', () => ({
  sendFeedbackEmail: mocks.sendFeedbackEmail,
}));

vi.mock('@/lib/logger', () => ({
  logError: mocks.logError,
  logWarn: mocks.logWarn,
  logInfo: mocks.logInfo,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customer: {
      findUnique: mocks.prismaCustomerFindUnique,
    },
  },
}));

vi.mock('@/lib/repositories/email-job-repo', () => ({
  createEmailJob: mocks.createEmailJob,
  markEmailJobSent: mocks.markEmailJobSent,
  markEmailJobFailed: mocks.markEmailJobFailed,
}));

import { POST } from '../route';

const secret = 'test-webhook-secret';

function sign256(body: string) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function sign1(body: string) {
  return createHmac('sha1', secret).update(body).digest('hex');
}

// Backward compatibility alias
function sign(body: string) {
  return sign1(body);
}

function buildRequest(body: string, headers: Record<string, string> = {}) {
  const lowerHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

  return {
    text: () => Promise.resolve(body),
    headers: {
      get: (name: string) => lowerHeaders.get(name.toLowerCase()) || null,
    },
    nextUrl: {
      protocol: 'http:',
      host: 'localhost:9002',
    },
  } as unknown as NextRequest;
}

describe('POST /api/splynx-webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SPLYNX_WEBHOOK_SECRET', secret);
    vi.stubEnv('SPLYNX_API_HOST', '');
    vi.stubEnv('SPLYNX_API_KEY', '');
    vi.stubEnv('SPLYNX_API_SECRET', '');
    vi.stubEnv('SPLYNX_API_AUTH', '');
    vi.stubGlobal('fetch', vi.fn());
    // Default mock for customer lookup
    mocks.prismaCustomerFindUnique.mockResolvedValue({ email: 'test@example.com', customerName: 'Test Customer', emailOptOut: false });
  });

  it('accepts a signed JSON webhook for payment event and creates a feedback token', async () => {
    mocks.prismaCustomerFindUnique.mockResolvedValueOnce({ email: 'ada@example.com', customerName: 'Ada Customer', emailOptOut: false });
    const body = JSON.stringify({
      type: 'event',
      call: 'finance\\common\\finance\\Payments',
      data: {
        customer_id: 42,
        model: 'models\\common\\finance\\Payments',
        date: '2026-07-02',
        attributes: {
          name: 'Ada Customer',
          email: 'ada@example.com',
          tariff_name: 'Fiber 50',
          city: 'Lagos',
        },
      },
    });

    const response = await POST(
      buildRequest(body, {
        'content-type': 'application/json',
        'x-splynx-signature': sign(body),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mocks.createFeedbackToken).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        customerName: 'Ada Customer',
        customerEmail: 'ada@example.com',
        servicePlan: 'Fiber 50',
        location: 'Lagos',
        sourceEvent: 'finance\\common\\finance\\Payments',
      }),
    );
    expect(mocks.sendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        feedbackUrl: 'http://localhost:9002/feedback?token=token-123',
      }),
    );
  });

  it('accepts a signed form-encoded webhook payload', async () => {
    mocks.prismaCustomerFindUnique.mockResolvedValueOnce({ email: 'form@example.com', customerName: 'Form Customer', emailOptOut: false });
    const body = new URLSearchParams({
      type: 'event',
      call: 'tickets/ticket/update',
      'data[model]': 'models\\common\\tickets\\Ticket',
      'data[customer_id]': '99',
      'data[date]': '2026-07-02',
      'data[attributes][customer_name]': 'Form Customer',
      'data[attributes][email]': 'form@example.com',
      'data[attributes][service_name]': 'Support Case',
    }).toString();

    const response = await POST(
      buildRequest(body, {
        'content-type': 'application/x-www-form-urlencoded',
        'x-splynx-signature': sign256(body),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createFeedbackToken).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        customerName: 'Form Customer',
        customerEmail: 'form@example.com',
        servicePlan: 'Support Case',
        sourceEvent: 'tickets/ticket/update',
      }),
    );
  });

  it('rejects incorrectly signed payloads before processing', async () => {
    const body = JSON.stringify({ type: 'event' });
    const response = await POST(
      buildRequest(body, {
        'content-type': 'application/json',
        'x-splynx-signature': 'invalid-signature',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('Invalid signature');
    expect(mocks.createFeedbackToken).not.toHaveBeenCalled();
  });

  it('uses the documented customer API route when enrichment is configured', async () => {
    vi.stubEnv('SPLYNX_API_HOST', 'https://splynx.example.test/');
    vi.stubEnv('SPLYNX_API_KEY', 'api-key');
    vi.stubEnv('SPLYNX_API_SECRET', 'api-secret');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          main_attributes: {
            first_name: 'Enriched',
            last_name: 'Customer',
            email: 'enriched@example.com',
            city: 'Abeokuta',
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const body = JSON.stringify({
      type: 'event',
      call: 'finance\\common\\finance\\Payments',
      data: {
        customer_id: 123,
        model: 'models\\common\\finance\\Payments',
        attributes: {},
      },
    });

    const response = await POST(
      buildRequest(body, {
        'content-type': 'application/json',
        'x-splynx-signature': sign(body),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://splynx.example.test/api/2.0/admin/customers/customer/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    );
    expect(mocks.createFeedbackToken).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        customerName: 'Enriched Customer',
        customerEmail: 'enriched@example.com',
        location: 'Abeokuta',
      }),
    );
  });

  it('supports Splynx-EA signature auth for customer enrichment', async () => {
    vi.stubEnv('SPLYNX_API_HOST', 'https://splynx.example.test');
    vi.stubEnv('SPLYNX_API_KEY', 'api-key');
    vi.stubEnv('SPLYNX_API_SECRET', 'api-secret');
    vi.stubEnv('SPLYNX_API_AUTH', 'signature');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const body = JSON.stringify({
      type: 'event',
      call: 'finance\\common\\finance\\Payments',
      data: {
        customer_id: 321,
        model: 'models\\common\\finance\\Payments',
        attributes: {},
      },
    });

    const response = await POST(
      buildRequest(body, {
        'content-type': 'application/json',
        'x-splynx-signature': sign(body),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://splynx.example.test/api/2.0/admin/customers/customer/321',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Splynx-EA \(key=api-key&nonce=\d+&signature=[A-F0-9]{64}\)$/),
        }),
      }),
    );
  });

  it('stores the event hash so retried deliveries can be detected', async () => {
    const body = JSON.stringify({
      type: 'event',
      call: 'payment/update',
      data: {
        customer_id: 9,
        model: 'models\\common\\finance\\Payments',
        attributes: {
          email: 'test@example.com',
        },
      },
    });

    const response = await POST(
      buildRequest(body, {
        'content-type': 'application/json',
        'x-splynx-signature': sign(body),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.findFeedbackTokenByEventHash).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(mocks.createFeedbackToken).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        eventHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('reuses the existing token and does not email again on a retried delivery', async () => {
    mocks.findFeedbackTokenByEventHash.mockResolvedValueOnce({ token: 'existing-token', expiresAt: Date.now() + 1000 });

    const body = JSON.stringify({
      type: 'event',
      call: 'payment/update',
      data: {
        customer_id: 7,
        attributes: {
          email: 'retry@example.com',
        },
      },
    });

    const response = await POST(
      buildRequest(body, {
        'content-type': 'application/json',
        'x-splynx-signature': sign(body),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.deduped).toBe(true);
    expect(json.token).toBe('existing-token');
    expect(mocks.createFeedbackToken).not.toHaveBeenCalled();
    expect(mocks.sendFeedbackEmail).not.toHaveBeenCalled();
  });
});
