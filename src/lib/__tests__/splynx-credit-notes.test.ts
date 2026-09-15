import { describe, it, expect, vi } from 'vitest';
import { mapSplynxCreditNote, syncCreditNotes } from '../splynx-credit-notes';

describe('mapSplynxCreditNote', () => {
  it('maps fields and nulls zero-dates', () => {
    const mapped = mapSplynxCreditNote({
      id: 7,
      customer_id: 693,
      number: 'CN202501000002',
      date_created: '2026-08-11 09:00:00',
      date_payment: '0000-00-00',
      total: 5000,
      status: 'not_refunded',
      payment_id: 0,
      invoicesId: 201599,
      items: [{ description: 'Goodwill credit' }],
    });
    expect(mapped).toMatchObject({
      creditId: '7',
      customerId: '693',
      number: 'CN202501000002',
      total: 5000,
      status: 'not_refunded',
      invoiceLink: '201599',
    });
    expect(mapped?.paidAt).toBeNull();
    expect(mapped?.dateCreated).toBe(BigInt(Date.UTC(2026, 7, 11, 9, 0, 0)));
  });

  it('drops empty ids and truncates long strings', () => {
    expect(mapSplynxCreditNote({ id: '' })).toBeNull();
    const mapped = mapSplynxCreditNote({ id: 1, number: 'x'.repeat(300), status: 'not_refunded' });
    expect(mapped?.number).toHaveLength(191);
  });
});

describe('syncCreditNotes', () => {
  it('paginates until a short page and upserts by creditId', async () => {
    const upsert = vi.fn(async () => ({}));
    const page = [{ id: 1, number: 'CN202501000002', total: 5000, status: 'not_refunded' }];
    const fetchPage = vi.fn(async () => page);
    const res = await syncCreditNotes({ prismaClient: { creditNote: { upsert } }, fetchPage });
    expect(res).toEqual({ fetched: 1, upserted: 1 });
    expect(fetchPage).toHaveBeenCalledWith(0, 500);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { creditId: '1' } }));
  });
});
