import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importSplynxIncomeLedger } from '../splynx-ledger';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    splynxPayment: { findMany: vi.fn() },
    customer: { findMany: vi.fn().mockResolvedValue([]) },
    splynxIncomeLedger: { upsert: vi.fn() },
  },
}));

const { prisma } = await import('@/lib/prisma');

// Mirror payment shape (SplynxPayment table).
function pay(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    paymentId: '1',
    customerId: 'c1',
    invoiceId: null,
    amount: 43500,
    paymentType: '30',
    receiptNumber: 'RCPT-1',
    note: null,
    paidAt: new Date('2026-08-15T10:00:00.000Z'),
    raw: { id: 1, payment_type: 30 },
    ...overrides,
  };
}

describe('importSplynxIncomeLedger (mirror-based)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.splynxPayment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.customer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.splynxIncomeLedger.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ledger-1' });
  });

  it('upserts one ledger row per mirror payment in the WAT month window', async () => {
    (prisma.splynxPayment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      pay({ paymentId: '1' }),
      pay({ paymentId: '2', customerId: 'c2', amount: 25000, receiptNumber: 'RCPT-2', paidAt: new Date('2026-08-20T09:00:00.000Z') }),
    ]);

    const result = await importSplynxIncomeLedger({ month: '2026-08' });

    expect(result.fetched).toBe(2);
    expect(result.upserted).toBe(2);
    expect(prisma.splynxIncomeLedger.upsert).toHaveBeenCalledTimes(2);
    const call = (prisma.splynxIncomeLedger.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toEqual({ source_sourceId: { source: 'payment', sourceId: '1' } });
  });

  it('rejects an invalid month', async () => {
    await expect(importSplynxIncomeLedger({ month: 'nope' })).rejects.toThrow('expected YYYY-MM');
  });

  it('classifies product segment from the customer plan', async () => {
    (prisma.splynxPayment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([pay({ paymentId: '1' })]);
    (prisma.customer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        customerId: 'c1',
        customerName: 'Test Customer',
        email: 'test@example.com',
        billingEmail: null,
        city: 'Lagos',
        category: 'person',
        servicePlan: 'H-Pro',
      },
    ]);

    await importSplynxIncomeLedger({ month: '2026-08' });

    const call = (prisma.splynxIncomeLedger.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.create.productSegment).toBe('residential');
    expect(call.create.customerEmail).toBe('test@example.com');
  });

  it('falls back to #id name and empty email for missing customers', async () => {
    (prisma.splynxPayment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([pay({ paymentId: '9', customerId: 'c9', receiptNumber: 'RCPT-9' })]);

    await importSplynxIncomeLedger({ month: '2026-08' });

    const call = (prisma.splynxIncomeLedger.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.create.customerName).toBe('#c9');
    expect(call.create.customerEmail).toBe('');
  });

  it('carries the mirror raw payload and receipt reference', async () => {
    (prisma.splynxPayment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      pay({ paymentId: '5', receiptNumber: '2026-30-07977', raw: { id: 5, payment_type: 30, comment: 'Pay by Paystack' } }),
    ]);

    await importSplynxIncomeLedger({ month: '2026-08' });

    const call = (prisma.splynxIncomeLedger.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.create.reference).toBe('2026-30-07977');
    expect(call.create.raw).toEqual({ id: 5, payment_type: 30, comment: 'Pay by Paystack' });
    expect(call.create.paidAt).toEqual(new Date('2026-08-15T10:00:00.000Z'));
  });
});

