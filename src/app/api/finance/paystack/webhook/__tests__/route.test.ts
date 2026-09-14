import { createHmac } from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { paystackTransaction: { findUnique: mocks.findUnique, upsert: mocks.upsert } },
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { POST } from '../route';

const SECRET = 'test-secret';

function sign(body: string): string {
  return createHmac('sha512', SECRET).update(body).digest('hex');
}

function req(rawBody: string, signature: string | null) {
  return {
    headers: { get: (n: string) => (n.toLowerCase() === 'x-paystack-signature' ? signature : null) },
    text: async () => rawBody,
    method: 'POST',
  } as unknown as NextRequest;
}

function chargeSuccessBody(reference = 'PSK-1'): string {
  return JSON.stringify({
    event: 'charge.success',
    data: {
      id: 123,
      reference,
      amount: 4350000,
      currency: 'NGN',
      status: 'success',
      channel: 'card',
      gateway_response: 'Successful',
      customer: { email: 'ada@example.com', first_name: 'Ada', last_name: 'Ace' },
      paid_at: '2026-08-01T10:00:00.000Z',
    },
  });
}

describe('POST /api/finance/paystack/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PAYSTACK_SECRET_KEY', SECRET);
    vi.stubEnv('PAYSTACK_API_KEY', '');
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 when no secret is configured', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', '');
    const raw = chargeSuccessBody();
    const res = await POST(req(raw, sign(raw)));
    expect(res.status).toBe(503);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid signature without touching the ledger', async () => {
    const raw = chargeSuccessBody();
    const res = await POST(req(raw, 'bad'));
    expect(res.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('ignores unsupported events', async () => {
    const raw = JSON.stringify({ event: 'transfer.success', data: { reference: 'TRF-1' } });
    const res = await POST(req(raw, sign(raw)));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ignored' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid payload', async () => {
    const raw = 'not-json';
    const res = await POST(req(raw, sign(raw)));
    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('upserts a supported charge.success event', async () => {
    const raw = chargeSuccessBody('PSK-1');
    const res = await POST(req(raw, sign(raw)));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'processed' });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { reference: 'PSK-1' } }));
  });

  it('returns 200 for verified duplicate deliveries without a second upsert', async () => {
    mocks.findUnique.mockResolvedValueOnce({ reference: 'PSK-1' });
    const raw = chargeSuccessBody('PSK-1');
    const res = await POST(req(raw, `sha512=${sign(raw)}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'duplicate' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
