import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findCustomers: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { customer: { findMany: mocks.findCustomers } },
}));
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: mocks.verifyAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));
vi.mock('@/lib/splynx-api', () => ({
  getSplynxConfig: () => ({ host: 'https://portal.iwn.ng', key: 'k', secret: 's', auth: 'basic' }),
  buildAuthHeader: async () => 'Basic azpz',
  // Mirrors parseSplynxApiDate: "YYYY-MM-DD HH:mm:ss" -> UTC ms.
  parseSplynxApiDate: (raw: unknown) => {
    if (typeof raw !== 'string') return null;
    const clean = raw.trim();
    if (!clean || /^0{4}-0{2}-0{2}/.test(clean)) return null;
    const ms = Date.parse(`${clean.replace(' ', 'T')}Z`);
    return Number.isNaN(ms) ? null : ms;
  },
}));

import { GET } from '../route';

const PAYMENTS = [
  { id: 101, customer_id: 1, amount: '27500', date: '2026-08-05 10:00:00', payment_type: 'Paystack', receipt_number: 'PSK-001' },
  { id: 102, customer_id: 2, amount: 15000, date: '2026-08-10 12:00:00', payment_type: 'bank transfer', receipt_number: 'BNK-002' },
  // outside the August window — must be excluded
  { id: 103, customer_id: 1, amount: 27500, date: '2026-07-20 10:00:00', payment_type: 'Paystack', receipt_number: 'PSK-099' },
];

const INVOICES = [
  {
    id: 9,
    customer_id: 3,
    number: 'INV-009',
    total: 30000,
    date_payment: '2026-08-12 00:00:00',
    status: 'paid',
    items: [{ description: 'walk-in', period_from: '2026-08-01', period_to: '2026-10-01' }],
  },
];

const CUSTOMERS = [
  {
    customerId: '1',
    customerName: 'Gloria Oyesiku',
    email: 'gloria@x.ng',
    city: 'Ikeja',
    category: 'person',
    servicePlan: 'H-Pro',
    accountType: 'regular',
    state: 'Lagos',
    discountPercent: 15,
    splynxDateAdded: BigInt(Date.UTC(2026, 7, 3)),
  },
  {
    customerId: '2',
    customerName: 'SME Co',
    email: 's@sme.ng',
    city: 'Ibadan',
    category: 'retail',
    servicePlan: 'U-Pro',
    accountType: 'regular',
    state: 'Oyo',
    discountPercent: 0,
    splynxDateAdded: BigInt(Date.UTC(2026, 6, 15)),
  },
];

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/admin/finance/payments')) {
        const offset = Number(new URL(u).searchParams.get('offset') ?? 0);
        return { ok: true, json: async () => (offset === 0 ? PAYMENTS : []) };
      }
      if (u.includes('/admin/finance/invoices')) return { ok: true, json: async () => INVOICES };
      if (u.includes('/admin/customers/customer/3')) {
        return { ok: true, json: async () => ({ name: 'Cash Walker', email: '', city: 'Ibadan', category: '', plan: '' }) };
      }
      return { ok: true, json: async () => [] };
    }),
  );
}

function req(url: string, auth: string | null = 'Bearer tok') {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : n.toLowerCase() === 'host' ? 'localhost:9002' : null) },
    method: 'GET',
  } as unknown as NextRequest;
}

describe('GET /api/admin/income-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    stubFetch();
    mocks.verifyAdmin.mockResolvedValue({ uid: 'admin-1', email: 'admin@iworldnetworks.net' });
    mocks.findCustomers.mockResolvedValue(CUSTOMERS);
  });

  it('returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08', null));
    expect(res.status).toBe(401);
  });

  it('returns the canonical shape with discount math and state-as-region', async () => {
    const res = await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.month).toBe('2026-08');
    expect(body.data.from).toBe('2026-08-01');
    expect(body.data.to).toBe('2026-08-31');
    expect(body.data.filters).toEqual({ region: '__all', segment: '__all', channel: '__all', search: '' });
    expect(body.data.source).toBe('splynx-payments');

    // July payment excluded; 2 August payments + 1 invoice-only row
    expect(body.data.rows).toHaveLength(3);

    const gloria = body.data.rows.find((r: { reference: string }) => r.reference === 'PSK-001');
    expect(gloria.amount).toBe(27500);
    expect(gloria.residential).toBe(27500);
    expect(gloria.discounts).toBe(4125);
    expect(gloria.remark).toBe('15%');
    expect(gloria.region).toBe('Lagos');
    expect(gloria.tax).toBe(2062.5);
    expect(gloria.balance).toBe(25437.5);
    expect(gloria.isNew).toBe(1);
    expect(gloria.email).toBe('gloria@x.ng');

    // city must never leak into region
    expect(body.data.rows.map((r: { region: string }) => r.region)).not.toContain('Ikeja');

    // invoice-only walk-in lands in Others with blank region, flagged prepay
    const walkin = body.data.rows.find((r: { reference: string }) => r.reference === 'INV-009');
    expect(walkin.others).toBe(30000);
    expect(walkin.region).toBe('');
    expect(walkin.isPrepay).toBe(true);

    expect(body.data.summary).toMatchObject({
      transactions: 3,
      totalGross: 72500,
      vat: 5437.5,
      netBalance: 67062.5,
      newSubscribers: 1,
      prepayments: 1,
      residential: 27500,
      sme: 15000,
      enterprise: 0,
      discounts: 4125,
      others: 30000,
    });
  });

  it('from/to override month and filter inclusively', async () => {
    const res = await GET(req('http://localhost:9002/api/admin/income-report?from=2026-08-01&to=2026-08-06'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.month).toBeNull();
    expect(body.data.from).toBe('2026-08-01');
    expect(body.data.to).toBe('2026-08-06');
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].reference).toBe('PSK-001');
  });

  it('rejects partial or invalid ranges', async () => {
    expect((await GET(req('http://localhost:9002/api/admin/income-report?from=2026-08-01'))).status).toBe(400);
    expect((await GET(req('http://localhost:9002/api/admin/income-report?from=nope&to=2026-08-01'))).status).toBe(400);
    expect((await GET(req('http://localhost:9002/api/admin/income-report?from=2026-08-06&to=2026-08-01'))).status).toBe(400);
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
    expect(sme.data.rows).toHaveLength(1);
    expect(sme.data.rows[0].reference).toBe('BNK-002');
  });

  it('rejects an invalid segment', async () => {
    expect((await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&segment=bogus'))).status).toBe(400);
  });

  it('filters by channel against reference/payment-type text', async () => {
    const ps = await (await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&channel=paystack'))).json();
    expect(ps.data.rows).toHaveLength(1);
    expect(ps.data.rows[0].reference).toBe('PSK-001');
    const bank = await (await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&channel=BANK'))).json();
    expect(bank.data.rows).toHaveLength(1);
    expect(bank.data.rows[0].reference).toBe('BNK-002');
  });

  it('searches customer/email/reference', async () => {
    const byName = await (await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&search=gloria'))).json();
    expect(byName.data.rows).toHaveLength(1);
    const byRef = await (await GET(req('http://localhost:9002/api/admin/income-report?month=2026-08&search=INV-009'))).json();
    expect(byRef.data.rows).toHaveLength(1);
  });
});
