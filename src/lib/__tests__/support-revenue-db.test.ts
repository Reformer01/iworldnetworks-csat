import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { supportRevenue: mocks },
}));

import {
  supportRevenueFromRow,
  supportRevenueRowData,
  createSupportRevenueDb,
  updateSupportRevenueDb,
  softDeleteSupportRevenueDb,
  listSupportRevenueDb,
} from '../support-revenue-db';

const ROW = {
  id: 'r1',
  customerName: 'Reformer Ejembi',
  location: 'Sagamu',
  region: 'Ogun',
  projectType: 'Router Sale',
  items: [{ name: 'Router', qty: 1, amount: 150000 }],
  totalAmount: 150000,
  description: 'Router sale',
  notes: 'Paid',
  date: '2026-07-01',
  agentName: 'agent@iwn.ng',
  createdAt: BigInt(1786004484793),
  updatedAt: BigInt(1786004484793),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('supportRevenueFromRow', () => {
  it('maps a full row to a doc with numbers and items array', () => {
    const d = supportRevenueFromRow(ROW);
    expect(d.id).toBe('r1');
    expect(d.customerName).toBe('Reformer Ejembi');
    expect(d.region).toBe('Ogun');
    expect(d.projectType).toBe('Router Sale');
    expect(d.items).toEqual([{ name: 'Router', qty: 1, amount: 150000 }]);
    expect(d.totalAmount).toBe(150000);
    expect(d.description).toBe('Router sale');
    expect(d.createdAt).toBe(1786004484793);
    expect(d.deletedAt).toBeUndefined();
  });

  it('applies defaults for null columns', () => {
    const d = supportRevenueFromRow({
      ...ROW,
      customerName: null,
      location: null,
      region: null,
      projectType: null,
      items: null,
      totalAmount: null,
      description: null,
      notes: null,
      date: null,
      agentName: null,
      createdAt: null,
      updatedAt: null,
    });
    expect(d.customerName).toBe('');
    expect(d.location).toBe('');
    expect(d.region).toBe('Ogun');
    expect(d.projectType).toBe('');
    expect(d.items).toEqual([]);
    expect(d.totalAmount).toBe(0);
    expect(d.description).toBeUndefined();
    expect(d.notes).toBe('');
    expect(d.date).toBe('');
    expect(d.agentName).toBe('');
    expect(d.createdAt).toBeUndefined();
  });
});

describe('supportRevenueRowData', () => {
  it('converts a doc to row values with bigints and DbNull for empty items', () => {
    const row = supportRevenueRowData({
      id: 'r1',
      customerName: 'Reformer Ejembi',
      location: 'Sagamu',
      region: 'Ogun',
      projectType: 'Router Sale',
      items: [],
      totalAmount: 150000,
      description: undefined,
      notes: 'Paid',
      date: '2026-07-01',
      agentName: 'agent@iwn.ng',
      createdAt: 1786004484793,
      updatedAt: 1786004484793,
      deletedAt: undefined,
    });
    expect(row.customerName).toBe('Reformer Ejembi');
    expect(row.items).toBe(Prisma.DbNull);
    expect(row.totalAmount).toBe(150000);
    expect(row.description).toBeNull();
    expect(row.createdAt).toBe(BigInt(1786004484793));
    expect(row.deletedAt).toBeNull();
  });

  it('keeps non-empty items as a JSON value', () => {
    const row = supportRevenueRowData({
      ...ROW,
      items: [{ name: 'Router', qty: 1, amount: 150000 }],
    } as never);
    expect(row.items).toEqual([{ name: 'Router', qty: 1, amount: 150000 }]);
  });
});

describe('createSupportRevenueDb', () => {
  it('creates with the provided id and returns the mapped doc', async () => {
    mocks.create.mockResolvedValue(ROW);

    const d = await createSupportRevenueDb({ ...ROW, id: 'r1' } as never);

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'r1', customerName: 'Reformer Ejembi' }),
      }),
    );
    expect(d.id).toBe('r1');
    expect(d.createdAt).toBe(1786004484793);
  });
});

describe('updateSupportRevenueDb', () => {
  it('returns the mapped row on success', async () => {
    mocks.update.mockResolvedValue({ ...ROW, notes: 'Updated' });

    const d = await updateSupportRevenueDb('r1', { notes: 'Updated' });

    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: expect.any(Object) });
    expect(d?.notes).toBe('Updated');
  });

  it('returns null when the row does not exist', async () => {
    mocks.update.mockRejectedValue(new Error('Record not found'));

    const d = await updateSupportRevenueDb('missing', { notes: 'x' });

    expect(d).toBeNull();
  });
});

describe('softDeleteSupportRevenueDb', () => {
  it('returns true on success and writes bigint timestamps', async () => {
    mocks.update.mockResolvedValue({ ...ROW, deletedAt: BigInt(1786004484799) });

    const ok = await softDeleteSupportRevenueDb('r1', 1786004484799, 1786004484800);

    expect(ok).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { deletedAt: BigInt(1786004484799), updatedAt: BigInt(1786004484800) },
    });
  });

  it('returns false when the update fails', async () => {
    mocks.update.mockRejectedValue(new Error('boom'));

    const ok = await softDeleteSupportRevenueDb('missing', 1, 2);

    expect(ok).toBe(false);
  });
});

describe('listSupportRevenueDb', () => {
  it('filters by projectType and maps rows', async () => {
    mocks.findMany.mockResolvedValue([ROW]);

    const docs = await listSupportRevenueDb('Router Sale', 10);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, projectType: 'Router Sale' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].customerName).toBe('Reformer Ejembi');
  });

  it('omits the projectType filter when absent', async () => {
    mocks.findMany.mockResolvedValue([]);

    await listSupportRevenueDb(null, 2000);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
  });
});