import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runReconciliation } from '../runReconciliation';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customer: { findMany: vi.fn() },
    salesRecordEntry: { findMany: vi.fn(), update: vi.fn() },
    reconciliationLog: { create: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';

const NOW = 1_700_000_000_000;

const matchedCustomer = {
  id: 'cust1',
  customerName: 'Adisa Ridwan',
  btsName: 'Sijuwola House',
  mrrTotal: 1000,
  category: 'RESIDENTIAL',
  accountType: null,
};

const record = (over: Partial<{ id: string; customerName: string; bts: string; mrc: number; segment: string }> = {}) => ({
  id: 'rec1',
  customerName: 'ADISA RIDWAN',
  bts: '',
  mrc: 1000,
  segment: 'HOME',
  ...over,
});

beforeEach(() => {
  vi.mocked(prisma.customer.findMany).mockReset();
  vi.mocked(prisma.salesRecordEntry.findMany).mockReset();
  vi.mocked(prisma.salesRecordEntry.update).mockReset();
  vi.mocked(prisma.reconciliationLog.create).mockReset();
  vi.mocked(prisma.salesRecordEntry.update).mockResolvedValue({ id: 'rec1' } as never);
  vi.mocked(prisma.reconciliationLog.create).mockResolvedValue({ id: 'log1' } as never);
  process.env.RECONCILE_ENABLED = 'true';
});

afterEach(() => {
  delete process.env.RECONCILE_ENABLED;
});

describe('runReconciliation', () => {
  it('fills an empty record bts and logs it', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([record()] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([matchedCustomer] as never);
    // Segment 'HOME' vs category RESIDENTIAL would also auto-fix — silence it
    // by making the record segment already match.
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([record({ segment: 'RESIDENTIAL' })] as never);

    const stats = await runReconciliation(NOW);

    expect(stats).toMatchObject({ recordsScanned: 1, filled: 1, autoFixed: 0, flagged: 0, unchanged: 0 });
    expect(prisma.salesRecordEntry.update).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: { bts: 'Sijuwola House', updatedAt: BigInt(NOW) },
    });
    expect(prisma.reconciliationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'record',
        recordId: 'rec1',
        field: 'bts',
        beforeValue: { value: '' },
        afterValue: { value: 'Sijuwola House' },
        action: 'auto',
        reason: 'filled from unified truth',
        createdAt: BigInt(NOW),
      }),
    });
  });

  it('auto-fixes mrc within ±20% and logs it', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([record({ bts: 'Sijuwola House', mrc: 1100, segment: 'RESIDENTIAL' })] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([matchedCustomer] as never);

    const stats = await runReconciliation(NOW);

    expect(stats.autoFixed).toBe(1);
    expect(prisma.salesRecordEntry.update).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: { mrc: 1000, updatedAt: BigInt(NOW) },
    });
    expect(prisma.reconciliationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ field: 'mrc', action: 'auto', afterValue: { value: 1000 } }),
    });
  });

  it('flags mrc beyond ±20% without touching the record', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([record({ bts: 'Sijuwola House', mrc: 1400, segment: 'RESIDENTIAL' })] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([matchedCustomer] as never);

    const stats = await runReconciliation(NOW);

    expect(stats.flagged).toBe(1);
    expect(stats.autoFixed).toBe(0);
    expect(prisma.salesRecordEntry.update).not.toHaveBeenCalled();
    expect(prisma.reconciliationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ field: 'mrc', action: 'flag', beforeValue: { value: 1400 }, afterValue: { value: 1000 } }),
    });
  });

  it('remaps segment from the Splynx category and logs it', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([record({ bts: 'Sijuwola House', mrc: 1000, segment: 'HOME' })] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([matchedCustomer] as never);

    const stats = await runReconciliation(NOW);

    expect(stats.autoFixed).toBe(1);
    expect(prisma.salesRecordEntry.update).toHaveBeenCalledWith({
      where: { id: 'rec1' },
      data: { segment: 'RESIDENTIAL', updatedAt: BigInt(NOW) },
    });
    expect(prisma.reconciliationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ field: 'segment', action: 'auto', afterValue: { value: 'RESIDENTIAL' } }),
    });
  });

  it('skips records with no customer match (unchanged, no logs)', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([record({ customerName: 'Nobody Known' })] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([matchedCustomer] as never);

    const stats = await runReconciliation(NOW);

    expect(stats).toMatchObject({ recordsScanned: 1, unchanged: 1, autoFixed: 0, filled: 0, flagged: 0 });
    expect(prisma.salesRecordEntry.update).not.toHaveBeenCalled();
    expect(prisma.reconciliationLog.create).not.toHaveBeenCalled();
  });

  it('skips records whose customer is not matched/manual or was deleted', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([record()] as never);
    // Only pending + deleted customers exist → query returns none of them.
    vi.mocked(prisma.customer.findMany).mockResolvedValue([] as never);

    const stats = await runReconciliation(NOW);

    expect(stats.unchanged).toBe(1);
    expect(prisma.salesRecordEntry.update).not.toHaveBeenCalled();
  });

  it('never touches period/dates/agent fields', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([
      record({ bts: 'Sijuwola House', mrc: 1100, segment: 'HOME' }),
    ] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([matchedCustomer] as never);

    await runReconciliation(NOW);

    const data = vi.mocked(prisma.salesRecordEntry.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(['mrc', 'segment', 'updatedAt']);
  });

  it('counts an in-sync record as unchanged with no writes', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([
      record({ bts: 'Sijuwola House', mrc: 1000, segment: 'RESIDENTIAL' }),
    ] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([matchedCustomer] as never);

    const stats = await runReconciliation(NOW);

    expect(stats).toMatchObject({ unchanged: 1, autoFixed: 0, filled: 0, flagged: 0 });
    expect(prisma.salesRecordEntry.update).not.toHaveBeenCalled();
    expect(prisma.reconciliationLog.create).not.toHaveBeenCalled();
  });

  it('skips mrc when the customer has no mrrTotal truth', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([
      record({ bts: 'Sijuwola House', mrc: 1400, segment: 'RESIDENTIAL' }),
    ] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ ...matchedCustomer, mrrTotal: null }] as never);

    const stats = await runReconciliation(NOW);

    expect(stats).toMatchObject({ unchanged: 1, flagged: 0, autoFixed: 0 });
    expect(prisma.salesRecordEntry.update).not.toHaveBeenCalled();
    expect(prisma.reconciliationLog.create).not.toHaveBeenCalled();
  });

  it('is a no-op when RECONCILE_ENABLED=false', async () => {
    process.env.RECONCILE_ENABLED = 'false';

    const stats = await runReconciliation(NOW);

    expect(stats).toEqual({ recordsScanned: 0, autoFixed: 0, flagged: 0, filled: 0, unchanged: 0, elapsedMs: 0 });
    expect(prisma.salesRecordEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('survives a failing record and keeps sweeping', async () => {
    vi.mocked(prisma.salesRecordEntry.findMany).mockResolvedValue([
      record({ id: 'rec1', bts: 'Sijuwola House', mrc: 1100, segment: 'RESIDENTIAL' }),
      record({ id: 'rec2', customerName: 'Other Customer', bts: 'Sijuwola House', mrc: 1100, segment: 'RESIDENTIAL' }),
    ] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      matchedCustomer,
      { ...matchedCustomer, id: 'cust2', customerName: 'Other Customer' },
    ] as never);
    vi.mocked(prisma.salesRecordEntry.update).mockRejectedValueOnce(new Error('db boom'));

    const stats = await runReconciliation(NOW);

    // rec1's auto-fix failed → retried next run, counted unchanged; rec2 applied.
    expect(stats).toMatchObject({ recordsScanned: 2, unchanged: 1, autoFixed: 2 });
    expect(prisma.salesRecordEntry.update).toHaveBeenCalledTimes(2);
  });
});