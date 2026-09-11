import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  salesRecordEntry: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  salesTarget: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  salesImport: {
    create: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => ({ collection: () => ({ doc: () => ({ set: async () => {}, update: async () => {} }) }) }),
}));
vi.mock('@/lib/logger', () => ({ logWarn: vi.fn() }));

import {
  salesRecordFromRow,
  salesRecordRowData,
  listSalesRecordsDb,
  createSalesRecordDb,
  updateSalesRecordDb,
  softDeleteSalesRecordDb,
  getSalesRecordByIdDb,
  listSalesTargetsDb,
  createSalesTargetDb,
} from '../sales-db';

const NOW = Date.UTC(2026, 7, 14, 12, 0, 0);

function makeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    serialNumber: 42,
    customerName: 'Acme ISP',
    location: 'Abeokuta',
    region: 'Ogun',
    segment: 'HOME',
    nrc: 1000,
    mrc: 5000,
    planCode: 'HOME-10',
    saleDate: '2026-08-01',
    quarter: 'QUARTER 3',
    month: 'August',
    packageType: 'Lease',
    salesAgent: 'John Doe',
    meansOfSale: 'Direct',
    accountStatus: 'Active',
    statusNotes: '',
    importBatchId: 'import_1',
    customerType: 'new',
    revivedByAgent: '',
    bts: 'BTS-1',
    deletedAt: null,
    createdAt: BigInt(NOW),
    updatedAt: BigInt(NOW),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.salesRecordEntry.findMany.mockResolvedValue([]);
  prismaMock.salesRecordEntry.create.mockResolvedValue(makeRow());
  prismaMock.salesRecordEntry.update.mockResolvedValue(makeRow());
  prismaMock.salesRecordEntry.findUnique.mockResolvedValue(makeRow());
  prismaMock.salesTarget.findMany.mockResolvedValue([]);
  prismaMock.salesTarget.create.mockResolvedValue({
    id: 't-1',
    month: '2026-08',
    region: 'Ogun',
    agentName: null,
    targetRevenue: 500000,
    targetCustomers: 50,
    createdAt: BigInt(NOW),
    updatedAt: null,
  });
  prismaMock.salesImport.create.mockResolvedValue({});
});

describe('salesRecordFromRow', () => {
  it('maps a row to a doc with BigInt -> number timestamps', () => {
    const doc = salesRecordFromRow(makeRow());
    expect(doc.id).toBe('rec-1');
    expect(doc.serialNumber).toBe(42);
    expect(doc.createdAt).toBe(NOW);
    expect(doc.updatedAt).toBe(NOW);
    expect(doc.deletedAt).toBeUndefined();
  });

  it('maps deletedAt to a number when present', () => {
    const doc = salesRecordFromRow(makeRow({ deletedAt: BigInt(NOW + 1000) }));
    expect(doc.deletedAt).toBe(NOW + 1000);
  });
});

describe('salesRecordRowData', () => {
  it('converts epoch-ms numbers to BigInt and omits undefined (partial updates)', () => {
    const data = salesRecordRowData({ customerName: 'Acme', updatedAt: NOW } as never);
    expect(data.createdAt).toBeUndefined();
    expect(data.deletedAt).toBeUndefined();
    expect(data.updatedAt).toBe(BigInt(NOW));
    expect(data.customerName).toBe('Acme');
  });

  it('includes deletedAt as null when explicitly null', () => {
    const data = salesRecordRowData({ deletedAt: null } as never);
    expect(data.deletedAt).toBeNull();
  });
});

describe('listSalesRecordsDb', () => {
  it('filters by region/status/agent/importBatchId and excludes soft-deleted', async () => {
    await listSalesRecordsDb({ region: 'Ogun', status: 'Active', agent: 'John Doe', importBatchId: 'import_1' });
    expect(prismaMock.salesRecordEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, region: 'Ogun', accountStatus: 'Active', salesAgent: 'John Doe', importBatchId: 'import_1' },
        orderBy: { serialNumber: 'desc' },
        take: 2000,
      }),
    );
  });

  it('omits empty filters', async () => {
    await listSalesRecordsDb({});
    expect(prismaMock.salesRecordEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
  });
});

describe('createSalesRecordDb', () => {
  it('creates a row with a generated id and returns the doc', async () => {
    const doc = await createSalesRecordDb({ customerName: 'Acme', serialNumber: 1 } as never);
    expect(doc.id).toBe('rec-1');
    expect(prismaMock.salesRecordEntry.create).toHaveBeenCalledOnce();
  });
});

describe('updateSalesRecordDb', () => {
  it('returns null when the row does not exist (404 semantics)', async () => {
    prismaMock.salesRecordEntry.update.mockRejectedValue(new Error('not found'));
    const doc = await updateSalesRecordDb('missing', { customerName: 'X' });
    expect(doc).toBeNull();
  });
});

describe('softDeleteSalesRecordDb', () => {
  it('returns false when the row does not exist', async () => {
    prismaMock.salesRecordEntry.update.mockRejectedValue(new Error('not found'));
    expect(await softDeleteSalesRecordDb('missing', NOW, NOW)).toBe(false);
  });
});

describe('getSalesRecordByIdDb', () => {
  it('returns null when not found', async () => {
    prismaMock.salesRecordEntry.findUnique.mockResolvedValue(null);
    expect(await getSalesRecordByIdDb('missing')).toBeNull();
  });
});

describe('sales targets', () => {
  it('lists targets ordered by month desc', async () => {
    await listSalesTargetsDb();
    expect(prismaMock.salesTarget.findMany).toHaveBeenCalledWith({ orderBy: { month: 'desc' }, take: 60 });
  });

  it('creates a target with epoch-ms createdAt', async () => {
    await createSalesTargetDb({ month: '2026-08', targetRevenue: 500000, targetCustomers: 50, createdAt: NOW });
    expect(prismaMock.salesTarget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ month: '2026-08', targetRevenue: 500000, createdAt: BigInt(NOW) }),
      }),
    );
  });
});
