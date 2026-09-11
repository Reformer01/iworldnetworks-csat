import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminApp: () => {
    throw new Error('getAdminApp should not be called in unit tests');
  },
}));

vi.mock('@/lib/splynx-nonce', () => ({
  incrementNonce: vi.fn().mockResolvedValue(1),
}));

import { normalizeSplynxInvoice, parseSplynxApiDate } from '../splynx-api';

// Real payload captured from https://portal.iwn.ng/api/2.0/admin/finance/invoices
const RAW_INVOICE = {
  id: 137737,
  customer_id: 693,
  date_created: '2022-08-19',
  real_create_datetime: '2025-08-29 14:06:02',
  date_updated: '2025-08-29',
  date_payment: '0000-00-00',
  date_till: '2022-08-28',
  use_transactions: '1',
  note: 'We appreciate your business.',
  memo: '',
  number: '000007_0.22966300 1756472751',
  total: 69354.84,
  due: 69354.84,
  payment_id: 0,
  type: 'recurring',
  payd_from_deposit: '0',
  status: 'not_paid',
  is_sent: '1',
  added_by: 'api',
  added_by_id: 2,
  items: [
    {
      id: 145528,
      pos: 1,
      description: 'Ifetedo 30Mbps Enterprise Plan 22 Aug 2022 – 31 Aug 2022',
      quantity: 1,
      unit: '0',
      price: '64516.1290',
      tax: '7.5000',
      tax_amount: 4838.7097,
      period_from: '0000-00-00',
      period_to: '0000-00-00',
      transaction_id: 322429,
      categoryIdForTransaction: 1,
      tax_id: 3,
      sub_account_id: 0,
    },
  ],
};

describe('normalizeSplynxInvoice', () => {
  it('maps the raw snake_case API payload to SplynxInvoice', () => {
    const inv = normalizeSplynxInvoice(RAW_INVOICE);

    expect(inv.id).toBe(137737);
    expect(inv.customerId).toBe(693);
    expect(inv.number).toBe('000007_0.22966300 1756472751');
    expect(inv.title).toBe('Ifetedo 30Mbps Enterprise Plan 22 Aug 2022 – 31 Aug 2022');
    expect(inv.total).toBe(69354.84);
    expect(inv.dueDate).toBe(Date.UTC(2022, 7, 28));
    expect(inv.date).toBe(Date.UTC(2025, 7, 29, 14, 6, 2));
    expect(inv.status).toBe('not_paid');
    expect(inv.isPaid).toBe(false);
    expect(inv.paidAt).toBeNull();
  });

  it('derives isPaid/paidAt from date_payment and status', () => {
    const paid = normalizeSplynxInvoice({
      ...RAW_INVOICE,
      status: 'paid',
      date_payment: '2022-09-02',
    });
    expect(paid.isPaid).toBe(true);
    expect(paid.paidAt).toBe(Date.UTC(2022, 8, 2));

    const partiallyPaid = normalizeSplynxInvoice({
      ...RAW_INVOICE,
      status: 'partially paid',
    });
    expect(partiallyPaid.isPaid).toBe(true);
  });

  it('handles missing optional fields without crashing', () => {
    const inv = normalizeSplynxInvoice({ id: 1, customer_id: 2, status: 'not_paid' });
    expect(inv.id).toBe(1);
    expect(inv.customerId).toBe(2);
    expect(inv.number).toBe('');
    expect(inv.title).toBe('');
    expect(inv.total).toBe(0);
    expect(inv.dueDate).toBeNull();
    expect(inv.date).toBeNull();
    expect(inv.isPaid).toBe(false);
    expect(inv.paidAt).toBeNull();
  });
});

describe('parseSplynxApiDate', () => {
  it('parses plain dates and datetime strings', () => {
    expect(parseSplynxApiDate('2022-08-28')).toBe(Date.UTC(2022, 7, 28));
    expect(parseSplynxApiDate('2025-08-29 14:06:02')).toBe(Date.UTC(2025, 7, 29, 14, 6, 2));
  });

  it('returns null for zero dates and non-dates', () => {
    expect(parseSplynxApiDate('0000-00-00')).toBeNull();
    expect(parseSplynxApiDate('')).toBeNull();
    expect(parseSplynxApiDate(12345)).toBeNull();
    expect(parseSplynxApiDate(undefined)).toBeNull();
  });
});
