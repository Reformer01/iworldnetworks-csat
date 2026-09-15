import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importSplynxIncomeLedger } from '../splynx-ledger';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customer: { findMany: vi.fn().mockResolvedValue([]) },
    splynxIncomeLedger: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

const { prisma } = await import('@/lib/prisma');

function mockFetchOnce(payload: unknown) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    json: async () => payload,
    text: async () => '',
  });
}

describe('importSplynxIncomeLedger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [], text: async () => '' }));
    (prisma.customer.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.splynxIncomeLedger.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.splynxIncomeLedger.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ledger-1' });
    (prisma.splynxIncomeLedger.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ledger-1' });
  });

  it('fetches payments, invoices, upserts ledger rows, returns counts', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
    mockFetchOnce([
      { id: 1, customer_id: 'c1', amount: '43500', date: '2026-08-15', receipt_number: 'RCPT-1', field_4: '' },
      { id: 2, customer_id: 'c2', amount: '25000', date: '2026-08-20', receipt_number: 'RCPT-2', field_4: '' },
    ]);
    mockFetchOnce({ data: [] });

    const result = await importSplynxIncomeLedger({ month: '2026-08' });

    expect(result.fetched).toBe(2);
    expect(result.upserted).toBe(2);
    expect(prisma.splynxIncomeLedger.create).toHaveBeenCalledTimes(2);
  });

  it('filters out-of-month payments', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
    mockFetchOnce([
      { id: 1, customer_id: 'c1', amount: '43500', date: '2026-08-15', receipt_number: 'RCPT-1' },
      { id: 2, customer_id: 'c2', amount: '25000', date: '2026-07-10', receipt_number: 'RCPT-2' },
    ]);
    mockFetchOnce({ data: [] });

    const result = await importSplynxIncomeLedger({ month: '2026-08' });

    expect(result.fetched).toBe(1);
    expect(result.upserted).toBe(1);
  });

  it('dedupes invoice by payment invoice_id', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
    mockFetchOnce([{ id: 1, customer_id: 'c1', amount: '43500', date: '2026-08-15', receipt_number: 'RCPT-1', invoice_id: 'inv-1' }]);
    mockFetchOnce({
      data: [{ id: 'inv-1', customer_id: 'c1', number: 'INV-1', total: '43500', date_payment: '2026-08-15', status: 'paid', items: [] }],
    });

    const result = await importSplynxIncomeLedger({ month: '2026-08' });

    expect(result.fetched).toBe(1);
    expect(result.upserted).toBe(1);
  });

  it('classifies product segment from plan', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
    mockFetchOnce([{ id: 1, customer_id: 'c1', amount: '43500', date: '2026-08-15', receipt_number: 'RCPT-1' }]);
    mockFetchOnce({ data: [] });

    (prisma.customer.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        customerId: 'c1',
        customerName: 'Test Customer',
        email: 'test@example.com',
        city: 'Lagos',
        category: 'person',
        servicePlan: 'H-Pro',
      },
    ]);

    await importSplynxIncomeLedger({ month: '2026-08' });

    const createCall = (prisma.splynxIncomeLedger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.productSegment).toBe('residential');
  });

  it('updates existing rows instead of duplicating', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
    mockFetchOnce([{ id: 1, customer_id: 'c1', amount: '43500', date: '2026-08-15', receipt_number: 'RCPT-1' }]);
    mockFetchOnce({ data: [] });
    (prisma.splynxIncomeLedger.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing-1' });

    const result = await importSplynxIncomeLedger({ month: '2026-08' });

    expect(result.upserted).toBe(1);
    expect(prisma.splynxIncomeLedger.update).toHaveBeenCalledTimes(1);
    expect(prisma.splynxIncomeLedger.create).not.toHaveBeenCalled();
  });

  it('falls back to #id name and empty email for missing customers', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
    mockFetchOnce([{ id: 1, customer_id: 'c9', amount: '43500', date: '2026-08-15', receipt_number: 'RCPT-9' }]);
    mockFetchOnce({ data: [] });

    await importSplynxIncomeLedger({ month: '2026-08' });

    const createCall = (prisma.splynxIncomeLedger.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.customerName).toBe('#c9');
    expect(createCall.data.customerEmail).toBe('');
  });
});
