import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { ticket: mocks },
}));

import { ticketFromRow, ticketRowData, createTicketDb, updateTicketDb, softDeleteTicketDb, listTicketsDb, countTicketsDb } from '../ticket-db';

const ROW = {
  id: 't1',
  ticketNumber: BigInt(7),
  customerName: 'Alice',
  customerPhone: '08012345678',
  customerEmail: 'alice@example.com',
  location: 'Sagamu',
  region: 'Ogun',
  bts: 'Sagamu GRA',
  complaintType: 'Support',
  description: 'No internet',
  createdBy: 'agent@iwn.ng',
  assignedTo: 'tech@iwn.ng',
  escalatedTo: null,
  status: 'open',
  createdAt: BigInt(1786004484793),
  assignedAt: BigInt(1786004484794),
  escalatedAt: null,
  resolvedAt: null,
  closedAt: null,
  slaBreached: false,
  resolutionNotes: null,
  firstTimeFix: null,
  priority: 2,
  delayReasons: ['awaiting part'],
  delayNotes: null,
  followUps: [{ at: 1786004484795, note: 'called' }],
  createdByAgent: 'agent@iwn.ng',
  updatedAt: BigInt(1786004484796),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ticketFromRow', () => {
  it('maps a full row to a Ticket with numbers and defaults', () => {
    const t = ticketFromRow(ROW);
    expect(t.id).toBe('t1');
    expect(t.ticketNumber).toBe(7);
    expect(t.customerName).toBe('Alice');
    expect(t.customerEmail).toBe('alice@example.com');
    expect(t.region).toBe('Ogun');
    expect(t.status).toBe('open');
    expect(t.createdAt).toBe(1786004484793);
    expect(t.assignedAt).toBe(1786004484794);
    expect(t.escalatedAt).toBeUndefined();
    expect(t.slaBreached).toBe(false);
    expect(t.delayReasons).toEqual(['awaiting part']);
    expect(t.followUps).toEqual([{ at: 1786004484795, note: 'called' }]);
    expect(t.deletedAt).toBeUndefined();
  });

  it('applies defaults for null columns', () => {
    const t = ticketFromRow({
      ...ROW,
      customerName: null,
      customerPhone: null,
      customerEmail: null,
      location: null,
      region: null,
      bts: null,
      complaintType: null,
      description: null,
      createdBy: null,
      assignedTo: null,
      status: null,
      createdAt: null,
      updatedAt: null,
      slaBreached: null,
      delayReasons: null,
      followUps: null,
      ticketNumber: 0,
    });
    expect(t.customerName).toBe('');
    expect(t.customerPhone).toBe('');
    expect(t.customerEmail).toBeUndefined();
    expect(t.location).toBe('');
    expect(t.region).toBe('Oyo');
    expect(t.bts).toBeUndefined();
    expect(t.complaintType).toBe('Support');
    expect(t.description).toBe('');
    expect(t.createdBy).toBe('');
    expect(t.assignedTo).toBeUndefined();
    expect(t.status).toBe('open');
    expect(t.createdAt).toBe(0);
    expect(t.updatedAt).toBe(0);
    expect(t.slaBreached).toBe(false);
    expect(t.delayReasons).toEqual([]);
    expect(t.followUps).toEqual([]);
  });
});

describe('ticketRowData', () => {
  it('converts a Ticket to row values with bigints and DbNull for empty arrays', () => {
    const row = ticketRowData({
      id: 't1',
      ticketNumber: 7,
      customerName: 'Alice',
      customerPhone: '08012345678',
      customerEmail: 'alice@example.com',
      location: 'Sagamu',
      region: 'Ogun',
      bts: 'Sagamu GRA',
      complaintType: 'Support',
      description: 'No internet',
      createdBy: 'agent@iwn.ng',
      assignedTo: 'tech@iwn.ng',
      escalatedTo: undefined,
      status: 'open',
      createdAt: 1786004484793,
      assignedAt: 1786004484794,
      escalatedAt: undefined,
      resolvedAt: undefined,
      closedAt: undefined,
      slaBreached: false,
      resolutionNotes: undefined,
      firstTimeFix: undefined,
      delayReasons: [],
      delayNotes: undefined,
      followUps: [],
      createdByAgent: 'agent@iwn.ng',
      updatedAt: 1786004484796,
      deletedAt: undefined,
    });
    expect(row.ticketNumber).toBe(7);
    expect(row.createdAt).toBe(BigInt(1786004484793));
    expect(row.assignedAt).toBe(BigInt(1786004484794));
    expect(row.escalatedAt).toBeNull();
    expect(row.delayReasons).toBe(Prisma.DbNull);
    expect(row.followUps).toBe(Prisma.DbNull);
    expect(row.customerEmail).toBe('alice@example.com');
    expect(row.deletedAt).toBeNull();
  });

  it('keeps non-empty arrays as JSON values', () => {
    const row = ticketRowData({
      ...ROW,
      ticketNumber: 7,
      delayReasons: ['awaiting part'],
      followUps: [{ at: 1, note: 'x' }],
    } as never);
    expect(row.delayReasons).toEqual(['awaiting part']);
    expect(row.followUps).toEqual([{ at: 1, note: 'x' }]);
  });
});

describe('createTicketDb', () => {
  it('auto-increments ticketNumber from the max aggregate', async () => {
    mocks.aggregate.mockResolvedValue({ _max: { ticketNumber: BigInt(178) } });
    mocks.create.mockResolvedValue({ ...ROW, ticketNumber: BigInt(179) });

    const t = await createTicketDb({ ...ROW, ticketNumber: 0 } as never);

    expect(mocks.aggregate).toHaveBeenCalledWith({ _max: { ticketNumber: true } });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ticketNumber: 179 }),
      }),
    );
    expect(t.ticketNumber).toBe(179);
  });

  it('starts at 1 when the table is empty', async () => {
    mocks.aggregate.mockResolvedValue({ _max: { ticketNumber: null } });
    mocks.create.mockResolvedValue({ ...ROW, ticketNumber: BigInt(1) });

    const t = await createTicketDb({ ...ROW, ticketNumber: 0 } as never);

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ticketNumber: 1 }),
      }),
    );
    expect(t.ticketNumber).toBe(1);
  });
});

describe('updateTicketDb', () => {
  it('returns the mapped row on success', async () => {
    mocks.update.mockResolvedValue({ ...ROW, status: 'resolved' });

    const t = await updateTicketDb('t1', { status: 'resolved' });

    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: expect.any(Object) });
    expect(t?.status).toBe('resolved');
  });

  it('returns null when the row does not exist', async () => {
    mocks.update.mockRejectedValue(new Error('Record not found'));

    const t = await updateTicketDb('missing', { status: 'resolved' });

    expect(t).toBeNull();
  });
});

describe('softDeleteTicketDb', () => {
  it('returns true on success and writes bigint timestamps', async () => {
    mocks.update.mockResolvedValue({ ...ROW, deletedAt: BigInt(1786004484799) });

    const ok = await softDeleteTicketDb('t1', 1786004484799, 1786004484800);

    expect(ok).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { deletedAt: BigInt(1786004484799), updatedAt: BigInt(1786004484800) },
    });
  });

  it('returns false when the update fails', async () => {
    mocks.update.mockRejectedValue(new Error('boom'));

    const ok = await softDeleteTicketDb('missing', 1, 2);

    expect(ok).toBe(false);
  });
});

describe('listTicketsDb', () => {
  it('filters by status and maps rows', async () => {
    mocks.findMany.mockResolvedValue([ROW]);

    const tickets = await listTicketsDb({ status: 'open' }, 10);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      skip: 0,
    });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].ticketNumber).toBe(7);
  });

  it('omits empty filters', async () => {
    mocks.findMany.mockResolvedValue([]);

    await listTicketsDb({}, 1000);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      skip: 0,
    });
  });

  it('searches name/email and exact ticket number', async () => {
    mocks.findMany.mockResolvedValue([]);

    await listTicketsDb({ search: 'ada' }, 50, 100);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [{ customerName: { contains: 'ada' } }, { customerEmail: { contains: 'ada' } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 100,
    });
  });

  it('counts with the same filters', async () => {
    mocks.count.mockResolvedValue(42);

    await expect(countTicketsDb({ status: 'open' })).resolves.toBe(42);
    expect(mocks.count).toHaveBeenCalledWith({ where: { deletedAt: null, status: 'open' } });
  });

  it('adds ticketNumber clause for numeric search', async () => {
    mocks.findMany.mockResolvedValue([]);

    await listTicketsDb({ search: '11699' }, 50);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        OR: [
          { customerName: { contains: '11699' } },
          { customerEmail: { contains: '11699' } },
          { ticketNumber: 11699 },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip: 0,
    });
  });
});