import { createHmac } from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { paystackTransaction: { findUnique: mocks.findUnique, upsert: mocks.upsert, update: mocks.update } },
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

  it('returns 200 for verified duplicate deliveries (idempotent re-upsert)', async () => {
    mocks.findUnique.mockResolvedValueOnce({ reference: 'PSK-1', status: 'success' });
    const raw = chargeSuccessBody('PSK-1');
    const res = await POST(req(raw, `sha512=${sign(raw)}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'processed' });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'success' }),
      }),
    );
  });

  it('never downgrades an existing success on an out-of-order charge.failed', async () => {
    mocks.findUnique.mockResolvedValueOnce({ reference: 'PSK-1', status: 'success' });
    const raw = JSON.stringify({
      event: 'charge.failed',
      data: {
        id: 123,
        reference: 'PSK-1',
        amount: 4350000,
        currency: 'NGN',
        status: 'failed',
        gateway_response: 'Declined',
      },
    });
    const res = await POST(req(raw, sign(raw)));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'processed' });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'success' }),
      }),
    );
  });

  it('applies refund.processed to the referenced transaction', async () => {
    const raw = JSON.stringify({
      event: 'refund.processed',
      data: {
        refund_reference: 'RFD-1',
        transaction_reference: 'PSK-1',
        amount: 50000,
        currency: 'NGN',
        status: 'processed',
      },
    });
    const res = await POST(req(raw, sign(raw)));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'processed' });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { reference: 'PSK-1' },
      data: { refundedNaira: { increment: 500 } },
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('acknowledges refunds for transactions not yet synced without erroring', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Record to update not found'));
    const raw = JSON.stringify({
      event: 'refund.processed',
      data: { transaction_reference: 'PSK-UNKNOWN', amount: 50000, status: 'processed' },
    });
    const res = await POST(req(raw, sign(raw)));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'unknown-transaction' });
  });
});
