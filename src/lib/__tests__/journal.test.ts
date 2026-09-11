import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  journal: {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn(), logInfo: vi.fn() }));

import { journalBegin, journalComplete, journalFail, sweepStaleJournals, sweepAndReportStaleJournals } from '../journal';

const NOW = Date.UTC(2026, 7, 14, 12, 0, 0);

function journalRow(over: Record<string, unknown> = {}) {
  return {
    id: 'j-1',
    type: 'splynx-hourly-sync',
    status: 'pending',
    payload: { started: NOW },
    result: null,
    error: null,
    createdAt: new Date(NOW - 60 * 60 * 1000),
    updatedAt: new Date(NOW - 60 * 60 * 1000),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.journal.create.mockResolvedValue({ id: 'j-1' });
  prismaMock.journal.update.mockResolvedValue({});
  prismaMock.journal.findMany.mockResolvedValue([]);
});

describe('journalBegin', () => {
  it('creates a pending Journal row and returns its id', async () => {
    const id = await journalBegin({ type: 'bts-csv-import', payload: { batch: 7 } });
    expect(id).toBe('j-1');
    expect(prismaMock.journal.create).toHaveBeenCalledWith({
      data: { type: 'bts-csv-import', payload: { batch: 7 }, status: 'pending' },
    });
  });

  it('defaults payload to an empty object', async () => {
    await journalBegin({ type: 'sync' });
    expect(prismaMock.journal.create).toHaveBeenCalledWith({
      data: { type: 'sync', payload: {}, status: 'pending' },
    });
  });
});

describe('journalComplete', () => {
  it('marks the entry completed with the result', async () => {
    await journalComplete('j-1', { upserted: 5 });
    expect(prismaMock.journal.update).toHaveBeenCalledWith({
      where: { id: 'j-1' },
      data: { status: 'completed', result: { upserted: 5 } },
    });
  });
});

describe('journalFail', () => {
  it('marks the entry failed with a truncated error', async () => {
    const long = 'x'.repeat(5000);
    await journalFail('j-1', long);
    expect(prismaMock.journal.update).toHaveBeenCalledWith({
      where: { id: 'j-1' },
      data: { status: 'failed', error: 'x'.repeat(2000) },
    });
  });

  it('never throws when the DB write fails', async () => {
    prismaMock.journal.update.mockRejectedValue(new Error('db down'));
    await expect(journalFail('j-1', 'boom')).resolves.toBeUndefined();
  });
});

describe('sweepStaleJournals', () => {
  it('returns stale pending entries mapped to the JournalEntry shape', async () => {
    prismaMock.journal.findMany.mockResolvedValue([journalRow()]);
    const stale = await sweepStaleJournals({ type: 'splynx-hourly-sync' });
    expect(stale).toHaveLength(1);
    expect(stale[0]).toEqual({
      id: 'j-1',
      type: 'splynx-hourly-sync',
      status: 'pending',
      payload: { started: NOW },
      result: undefined,
      error: undefined,
      createdAt: NOW - 60 * 60 * 1000,
      updatedAt: NOW - 60 * 60 * 1000,
      expiresAt: NOW - 60 * 60 * 1000 + 30 * 60 * 1000,
    });
  });

  it('filters by type and respects the limit', async () => {
    prismaMock.journal.findMany.mockResolvedValue([
      journalRow({ id: 'a', type: 'sync' }),
      journalRow({ id: 'b', type: 'import' }),
      journalRow({ id: 'c', type: 'sync' }),
    ]);
    const stale = await sweepStaleJournals({ type: 'sync', limit: 1 });
    expect(stale.map((s) => s.id)).toEqual(['a']);
  });

  it('returns [] when the DB query fails (best-effort)', async () => {
    prismaMock.journal.findMany.mockRejectedValue(new Error('db down'));
    const stale = await sweepStaleJournals();
    expect(stale).toEqual([]);
  });
});

describe('sweepAndReportStaleJournals', () => {
  it('is a no-op when nothing is stale', async () => {
    await expect(sweepAndReportStaleJournals({ type: 'sync' })).resolves.toBeUndefined();
  });
});
