import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runReconciliation } from '../reconciliation-runner';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    paystackTransaction: { findMany: vi.fn() },
    splynxIncomeLedger: { findMany: vi.fn() },
    paystackReconciliationLink: { findMany: vi.fn(), upsert: vi.fn() },
    reconciliationException: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock('../paystack-reconcile', () => ({
  classifyReconciliation: vi.fn(),
  matchByReference: vi.fn(),
  matchByCustomerIdAmountDate: vi.fn(),
  matchByCustomerIdAmount: vi.fn(),
  matchByEmailAmountDate: vi.fn(),
  matchByEmailAmount: vi.fn(),
  watMonthBounds: vi.fn((month: string) => {
    const [y, m] = month.split('-').map(Number);
    return {
      start: new Date(Date.UTC(y, m - 1, 1) - 3600000),
      end: new Date(Date.UTC(y, m, 1) - 3600001),
    };
  }),
}));

const { prisma } = await import('@/lib/prisma');
const { classifyReconciliation, matchByReference, matchByEmailAmountDate, matchByEmailAmount } = await import('../paystack-reconcile');

describe('runReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.paystackReconciliationLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.paystackReconciliationLink.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'link-1' });
    (prisma.reconciliationException.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.reconciliationException.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'exc-1' });
    (prisma.reconciliationException.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'exc-1' });
  });

  it('matches identical references, creates link, returns counts', async () => {
    (prisma.paystackTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tx1',
        reference: 'PSK-1',
        customerEmail: 'a@example.com',
        amount: 4350000,
        status: 'success',
        paidAt: new Date('2026-08-01'),
        channel: 'card',
      },
    ]);
    (prisma.splynxIncomeLedger.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 's1', reference: 'PSK-1', customerEmail: 'a@example.com', amountNaira: 43500, paidAt: new Date('2026-08-01') },
    ]);
    (matchByReference as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      reference: 'PSK-1',
      email: 'a@example.com',
      amountNaira: 43500,
      paidAt: '2026-08-01',
    });
    (classifyReconciliation as ReturnType<typeof vi.fn>).mockReturnValue({ kind: 'matched', varianceNaira: 0 });

    const result = await runReconciliation({ month: '2026-08' });

    expect(result.matched).toBe(1);
    expect(result.paystackOnly).toBe(0);
    expect(result.splynxOnly).toBe(0);
    expect(result.exceptionsCreated).toBe(0);
    expect(prisma.paystackReconciliationLink.upsert).toHaveBeenCalledTimes(1);
  });

  it('falls back to email+amount+date, creates link', async () => {
    (prisma.paystackTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tx1',
        reference: 'PSK-1',
        customerEmail: 'a@example.com',
        amount: 4350000,
        status: 'success',
        paidAt: new Date('2026-08-01'),
        channel: 'card',
      },
    ]);
    (prisma.splynxIncomeLedger.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 's1', reference: 'OTHER', customerEmail: 'a@example.com', amountNaira: 43500, paidAt: new Date('2026-08-01') },
    ]);
    (matchByReference as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (matchByEmailAmountDate as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      reference: 'OTHER',
      email: 'a@example.com',
      amountNaira: 43500,
      paidAt: '2026-08-01',
    });
    (classifyReconciliation as ReturnType<typeof vi.fn>).mockReturnValue({ kind: 'matched', varianceNaira: 0 });

    const result = await runReconciliation({ month: '2026-08' });

    expect(result.matched).toBe(1);
    expect(prisma.paystackReconciliationLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paystackReference: 'PSK-1' },
        update: expect.objectContaining({ method: 'fallback', confidence: 0.8 }),
      }),
    );
  });

  it('creates paystack-only exception when no match', async () => {
    (prisma.paystackTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tx1',
        reference: 'PSK-1',
        customerEmail: 'a@example.com',
        amount: 4350000,
        status: 'success',
        paidAt: new Date('2026-08-01'),
        channel: 'card',
      },
    ]);
    (prisma.splynxIncomeLedger.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (matchByReference as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (matchByEmailAmountDate as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (classifyReconciliation as ReturnType<typeof vi.fn>).mockReturnValue({ kind: 'paystack-only', varianceNaira: 43500 });

    const result = await runReconciliation({ month: '2026-08' });

    expect(result.paystackOnly).toBe(1);
    expect(result.exceptionsCreated).toBe(1);
    expect(prisma.reconciliationException.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'paystack-only', status: 'open' }),
      }),
    );
  });

  it('creates amount-mismatch link and exception when variance >= 0.01', async () => {
    (prisma.paystackTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tx1',
        reference: 'PSK-1',
        customerEmail: 'a@example.com',
        amount: 4350000,
        status: 'success',
        paidAt: new Date('2026-08-01'),
        channel: 'card',
      },
    ]);
    (prisma.splynxIncomeLedger.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 's1', reference: 'PSK-1', customerEmail: 'a@example.com', amountNaira: 43000, paidAt: new Date('2026-08-01') },
    ]);
    (matchByReference as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      reference: 'PSK-1',
      email: 'a@example.com',
      amountNaira: 43000,
      paidAt: '2026-08-01',
    });
    (classifyReconciliation as ReturnType<typeof vi.fn>).mockReturnValue({ kind: 'amount-mismatch', varianceNaira: 500 });

    const result = await runReconciliation({ month: '2026-08' });

    expect(result.amountMismatch).toBe(1);
    expect(result.exceptionsCreated).toBe(1);
    expect(prisma.paystackReconciliationLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paystackReference: 'PSK-1' },
        update: expect.objectContaining({ status: 'amount-mismatch', varianceNaira: 500 }),
      }),
    );
  });

  it('detects duplicate paystack references', async () => {
    (prisma.paystackTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tx1',
        reference: 'PSK-1',
        customerEmail: 'a@example.com',
        amount: 4350000,
        status: 'success',
        paidAt: new Date('2026-08-01'),
        channel: 'card',
      },
      {
        id: 'tx2',
        reference: 'PSK-1',
        customerEmail: 'b@example.com',
        amount: 2500000,
        status: 'success',
        paidAt: new Date('2026-08-02'),
        channel: 'bank',
      },
    ]);
    (prisma.splynxIncomeLedger.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await runReconciliation({ month: '2026-08' });

    expect(result.duplicate).toBe(1);
    expect(result.exceptionsCreated).toBe(1);
    expect(prisma.reconciliationException.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'duplicate' }),
      }),
    );
  });

  it('flags same customer+amount different day as date-mismatch, not paystack-only', async () => {
    (prisma.paystackTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'tx1',
        reference: 'PSK-1',
        customerEmail: 'a@example.com',
        amount: 4350000,
        status: 'success',
        paidAt: new Date('2026-08-03T20:30:00Z'),
        channel: 'card',
      },
    ]);
    (prisma.splynxIncomeLedger.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 's1', reference: 'OTHER', customerEmail: 'a@example.com', amountNaira: 43500, paidAt: new Date('2026-08-04T05:00:00Z') },
    ]);
    (matchByReference as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (matchByEmailAmountDate as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (classifyReconciliation as ReturnType<typeof vi.fn>).mockReturnValue({ kind: 'paystack-only', varianceNaira: 43500 });
    (matchByEmailAmount as ReturnType<typeof vi.fn>).mockReturnValue({
      id: 's1',
      reference: 'OTHER',
      email: 'a@example.com',
      amountNaira: 43500,
      paidAt: '2026-08-04',
    });

    const result = await runReconciliation({ month: '2026-08' });

    expect(result.dateMismatch).toBe(1);
    expect(result.paystackOnly).toBe(0);
    expect(result.exceptionsCreated).toBe(1);
    expect(prisma.paystackReconciliationLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { paystackReference: 'PSK-1' },
        update: expect.objectContaining({ status: 'date-mismatch' }),
      }),
    );
  });

  it('creates splynx-only exceptions only for Paystack-channel ledger rows', async () => {
    (prisma.paystackTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.splynxIncomeLedger.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 's1',
        reference: 'PSK-SPL-1',
        customerEmail: 'a@example.com',
        amountNaira: 43500,
        paidAt: new Date('2026-08-01'),
        raw: { payment_type: 'Paystack' },
      },
      {
        id: 's2',
        reference: 'BNK-2',
        customerEmail: 'b@example.com',
        amountNaira: 25000,
        paidAt: new Date('2026-08-02'),
        raw: { payment_type: 'Bank Transfer' },
      },
    ]);

    const result = await runReconciliation({ month: '2026-08' });

    expect(result.splynxOnly).toBe(1);
    expect(result.nonPaystackLedgerSkipped).toBe(1);
    expect(result.exceptionsCreated).toBe(1);
    expect(prisma.reconciliationException.create).toHaveBeenCalledTimes(1);
  });
});
