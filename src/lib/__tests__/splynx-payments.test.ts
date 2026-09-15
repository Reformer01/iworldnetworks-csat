import { describe, it, expect } from 'vitest';
import {
  mapSplynxPayment,
  nextProbeOffset,
  isShortPage,
  shouldStopBackfillProbe,
  nextBackfillOffset,
  getIncrementalStartOffset,
  maxNumericPaymentId,
  syncSplynxPayments,
} from '../splynx-payments';

describe('mapSplynxPayment', () => {
  it('maps raw payment and truncates to 191', () => {
    const m = mapSplynxPayment({
      id: 101,
      customer_id: 1,
      invoice_id: 9,
      amount: '23951.61',
      date: '2026-08-05 10:00:00',
      payment_type: 'Paystack',
      receipt_number: 'PSK-001',
      field_4: 'note',
    });
    expect(m).toMatchObject({
      paymentId: '101',
      customerId: '1',
      invoiceId: '9',
      amount: 23951.61,
      paymentType: 'Paystack',
      receiptNumber: 'PSK-001',
    });
    expect(m?.paidAt).toBeInstanceOf(Date);
  });
  it('drops rows without id or amount', () => {
    expect(mapSplynxPayment({ id: '', amount: 100 } as never)).toBeNull();
    expect(mapSplynxPayment({ id: 1, amount: 0 } as never)).toBeNull();
  });
});

describe('cursor pure functions', () => {
  it('nextProbeOffset doubles (500 seed)', () => {
    expect(nextProbeOffset(0)).toBe(500);
    expect(nextProbeOffset(500)).toBe(1000);
    expect(nextProbeOffset(1000)).toBe(2000);
  });
  it('isShortPage detects the tail', () => {
    expect(isShortPage(500)).toBe(false);
    expect(isShortPage(499)).toBe(true);
    expect(isShortPage(0)).toBe(true);
  });
  it('shouldStopBackfillProbe when last_date >= today', () => {
    const today = Date.UTC(2026, 7, 15);
    expect(shouldStopBackfillProbe(today, today)).toBe(true);
    expect(shouldStopBackfillProbe(today - 1, today)).toBe(false);
    expect(shouldStopBackfillProbe(null, today)).toBe(false);
  });
  it('nextBackfillOffset advances by fetched', () => {
    expect(nextBackfillOffset(0, 500)).toBe(500);
    expect(nextBackfillOffset(500, 200)).toBe(700);
  });
  it('getIncrementalStartOffset prefers stored cursor', () => {
    expect(getIncrementalStartOffset(1200, 5000)).toBe(1200);
    expect(getIncrementalStartOffset(null, 5000)).toBe(5000);
    expect(getIncrementalStartOffset(null, null)).toBe(0);
  });
  it('maxNumericPaymentId tracks numeric max', () => {
    expect(maxNumericPaymentId(['101', '250', 'abc'])).toBe(250);
    expect(maxNumericPaymentId([])).toBeNull();
  });
});

describe('syncSplynxPayments', () => {
  function fakePrisma(pages: Array<Array<Parameters<typeof mapSplynxPayment>[0]>>) {
    const stored = new Map<string, unknown>();
    return {
      stored,
      splynxPayment: {
        upsert: async (args: { where: { paymentId: string }; create: unknown; update: unknown }) => {
          stored.set(args.where.paymentId, args.create);
          return args.create;
        },
      },
      splynxMeta: {
        findUnique: async () => ({ paymentsBackfillOffset: 0, paymentsMaxId: null }),
        upsert: async (args: { update: unknown }) => args.update,
      },
      _pages: pages,
    };
  }

  it('pages forward, upserts by paymentId, completes on short page', async () => {
    const p1 = { id: 101, customer_id: 1, amount: 100, date: '2026-08-05 10:00:00' };
    const db = fakePrisma([[p1]]);
    const res = await syncSplynxPayments(
      {},
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prismaClient: db as any,
        fetchPage: async (offset) => (offset === 0 ? [p1] : []),
        now: Date.UTC(2026, 7, 15),
      },
    );
    expect(res).toEqual({ fetched: 1, upserted: 1, complete: true });
    expect(db.stored.has('101')).toBe(true);
  });

  it('caps at 200 pages and persists cursor (incomplete)', async () => {
    const row = { id: 1, customer_id: 1, amount: 10, date: '2026-08-05 10:00:00' };
    const full = Array.from({ length: 500 }, (_, i) => ({ ...row, id: i + 1 }));
    let cursor = -1;
    const db = fakePrisma([]);
    const upserted = await syncSplynxPayments(
      { fullBackfill: true },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prismaClient: {
          ...db,
          splynxMeta: {
            findUnique: async () => ({ paymentsBackfillOffset: 0, paymentsMaxId: null }),
            upsert: async (args: { update: { paymentsBackfillOffset: number } }) => {
              cursor = args.update.paymentsBackfillOffset;
              return args.update;
            },
          },
        } as never,
        fetchPage: async () => full,
        now: Date.UTC(2026, 7, 15),
      },
    );
    expect(upserted.complete).toBe(false);
    expect(cursor).toBe(200 * 500);
  });
});
