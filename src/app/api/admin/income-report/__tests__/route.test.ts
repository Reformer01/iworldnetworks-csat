import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findPayments: vi.fn(),
  findInvoices: vi.fn(),
  findCustomers: vi.fn(),
  findCredits: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    splynxPayment: { findMany: mocks.findPayments },
    invoice: { findMany: mocks.findInvoices },
    customer: { findMany: mocks.findCustomers },
    creditNote: { findMany: mocks.findCredits },
  },
}));
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: mocks.verifyAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { GET } from '../route';

const AUG5 = new Date(Date.UTC(2026, 7, 5, 10, 0, 0));
const AUG10 = new Date(Date.UTC(2026, 7, 10, 12, 0, 0));
const AUG12 = new Date(Date.UTC(2026, 7, 12, 9, 0, 0));

const PAYMENTS = [
  {
    paymentId: '101',
    customerId: '1',
    invoiceId: 'inv-1',
    amount: 23375,
    paymentType: 'Paystack',
    receiptNumber: 'PSK-001',
    note: 'PSK-001',
    paidAt: AUG5,
    updatedAt: AUG5,
  },
  {
    paymentId: '102',
    customerId: '2',
    invoiceId: null,
    amount: 15000,
    paymentType: 'bank transfer',
    receiptNumber: 'BNK-002',
    note: 'BNK-002',
    paidAt: AUG10,
    updatedAt: AUG10,
  },
  {
    paymentId: '103',
    customerId: '3',
    invoiceId: null,
    amount: 30000,
    paymentType: '',
    receiptNumber: 'INV-009',
    note: 'walk-in',
    paidAt: AUG12,
    updatedAt: AUG12,
  },
];

const INVOICES = [
  {
    invoiceId: 'inv-1',
    items: [
      { description: 'U-Pro Monthly', price: 27500 },
      { description: 'Loyalty discount', price: -4125 },
    ],
  },
];

const CUSTOMERS = [
  {
    customerId: '1',
    customerName: 'SME One',
    email: 'one@sme.ng',
    category: 'retail',
    servicePlan: 'U-Pro',
    state: 'Lagos',
    splynxDateAdded: BigInt(Date.UTC(2026, 7, 3)),
  },
  {
    customerId: '2',
    customerName: 'SME Co',
    email: 's@sme.ng',
    category: 'retail',
    servicePlan: 'U-Pro',
    state: 'Oyo',
    splynxDateAdded: BigInt(Date.UTC(2026, 6, 15)),
  },
  {
    customerId: '3',
    customerName: 'Cash Walker',
    email: '',
    category: '',
    servicePlan: '',
    state: '',
    splynxDateAdded: null,
  },
];

function req(url: string, auth: string | null = 'Bearer tok') {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : n.toLowerCase() === 'host' ? 'localhost:9002' : null) },
    method: 'GET',
  } as unknown as NextRequest;
}

describe('GET /api/admin/income-report (mirror)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAdmin.mockResolvedValue({ uid: 'admin-1', email: 'admin@iworldnetworks.net' });
    // Mirror range query: respect paidAt gte/lte so from/to tests work.
    mocks.findPayments.mockImplementation(async (args: { where?: { paidAt?: { gte?: Date; lte?: Date } } }) => {
      const gte = args?.where?.paidAt?.gte ? new Date(args.where.paidAt.gte).getTime() : -Infinity;
      const lte = args?.where?.paidAt?.lte ? new Date(args.where.paidAt.lte).getTime() : Infinity;
      return PAYMENTS.filter((p) => p.paidAt.getTime() >= gte && p.paidAt.getTime() <= lte);
    });
    mocks.findInvoices.mockResolvedValue(INVOICES);
    mocks.findCustomers.mockResolvedValue(CUSTOMERS);
    mocks.findCredits.mockResolvedValue([]);
  });

  it('returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08', null));
    expect(res.status).toBe(401);
  });

  it('reads the mirror with a bounded range query and derives discounts', async () => {
    const res = await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(mocks.findPayments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paidAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }) }),
        orderBy: { paidAt: 'desc' },
        take: 20000,
      }),
    );
    expect(body.data.month).toBe('2026-08');
    expect(body.data.source).toBe('splynx-payments-mirror');
    expect(body.data.paymentsSyncedAt).toBe(AUG12.toISOString());
    expect(body.data.rows).toHaveLength(3);

    const sme = body.data.rows.find((r: { reference: string }) => r.reference === 'PSK-001');
    expect(sme.amount).toBe(23375);
    expect(sme.sme).toBe(27500);
    expect(sme.discounts).toBe(4125);
    expect(sme.remark).toBe('');
    expect(sme.region).toBe('Lagos');
    expect(sme.isNew).toBe(1);
    expect(body.data.summary.creditNotes).toEqual({ count: 0, total: 0 });

    const walkin = body.data.rows.find((r: { reference: string }) => r.reference === 'INV-009');
    expect(walkin.others).toBe(30000);
    expect(walkin.discounts).toBe(0);
    expect(walkin.region).toBe('');
  });

  it('from/to override month and filter inclusively', async () => {
    const res = await GET(req('http://localhost:9002/api/admin/income-report?from=2026-08-01&to=2026-08-06'));
    const body = await res.json();
    expect(body.data.month).toBeNull();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].reference).toBe('PSK-001');
  });

  it('rejects partial or invalid ranges', async () => {
    expect((await GET(req('http://localhost:9002/api/admin/income-report?from=2026-08-01'))).status).toBe(400);
    expect((await GET(req('http://localhost:9002/api/admin/income-report?from=nope&to=2026-08-01'))).status).toBe(400);
  });

  it('filters by exact region', async () => {
    const res = await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&region=Oyo'));
    const body = await res.json();
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].reference).toBe('BNK-002');
  });

  it('filters by segment from buckets', async () => {
    const other = await (await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&segment=other'))).json();
    expect(other.data.rows).toHaveLength(1);
    expect(other.data.rows[0].reference).toBe('INV-009');
    const sme = await (await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&segment=sme'))).json();
    expect(sme.data.rows).toHaveLength(2);
  });

  it('filters by channel and search', async () => {
    const ps = await (await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&channel=paystack'))).json();
    expect(ps.data.rows).toHaveLength(1);
    const byName = await (await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&search=SME One'))).json();
    expect(byName.data.rows).toHaveLength(1);
  });

  it('adds applied credit notes as Others rows with a creditNotes summary', async () => {
    mocks.findCredits.mockResolvedValue([
      {
        creditId: 'cn-1',
        customerId: '2',
        number: 'CN202501000002',
        total: 5000,
        status: 'not_refunded',
        paymentId: null,
        invoiceLink: null,
        dateCreated: BigInt(Date.UTC(2026, 7, 11)),
        paidAt: new Date(Date.UTC(2026, 7, 11, 9, 0, 0)),
        items: [{ description: 'Goodwill credit' }],
      },
      {
        creditId: 'cn-void',
        customerId: '2',
        number: 'CN202501000003',
        total: 9999,
        status: 'void',
        paymentId: null,
        invoiceLink: null,
        dateCreated: BigInt(Date.UTC(2026, 7, 11)),
        paidAt: new Date(Date.UTC(2026, 7, 11, 9, 0, 0)),
        items: [],
      },
    ]);
    const res = await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08'));
    const body = await res.json();
    expect(body.data.rows).toHaveLength(4);
    const cn = body.data.rows.find((r: { reference: string }) => r.reference === 'CN202501000002');
    expect(cn.amount).toBe(5000);
    expect(cn.others).toBe(5000);
    expect(cn.discounts).toBe(0);
    expect(cn.tax).toBe(0);
    expect(cn.balance).toBe(5000);
    expect(cn.remark).toBe('');
    expect(cn.note).toContain('Credit note');
    expect(cn.region).toBe('Oyo');
    expect(body.data.summary.creditNotes).toEqual({ count: 1, total: 5000 });

    const credit = await (await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&channel=credit'))).json();
    expect(credit.data.rows).toHaveLength(1);
    expect(credit.data.rows[0].reference).toBe('CN202501000002');
  });
});
