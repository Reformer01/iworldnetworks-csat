import { describe, it, expect } from 'vitest';
import { extractSplynxCustomerId } from '../paystack-normalize';

describe('extractSplynxCustomerId', () => {
  it('reads metadata.customer_id as number', () => {
    expect(extractSplynxCustomerId({ metadata: { customer_id: 2272 } })).toBe('2272');
  });

  it('reads metadata.customer_id as numeric string', () => {
    expect(extractSplynxCustomerId({ metadata: { customer_id: ' 423 ' } })).toBe('423');
  });

  it('falls back to referrer customer_id param', () => {
    expect(
      extractSplynxCustomerId({
        metadata: { referrer: 'https://portal.iwn.ng/paystack/index?customer_id=1506&amount=100' },
      }),
    ).toBe('1506');
  });

  it('returns null when metadata is missing or malformed', () => {
    expect(extractSplynxCustomerId(null)).toBeNull();
    expect(extractSplynxCustomerId({})).toBeNull();
    expect(extractSplynxCustomerId({ metadata: {} })).toBeNull();
    expect(extractSplynxCustomerId({ metadata: { customer_id: 'abc' } })).toBeNull();
  });
});

describe('WAT day and month bounds', () => {
  it('buckets a late-night UTC transaction into the WAT day', async () => {
    const { watDayOf } = await import('../paystack-reconcile');
    // 2026-09-30 23:30 UTC = 2026-10-01 00:30 WAT → October, not September.
    expect(watDayOf('2026-09-30T23:30:00.000Z')).toBe('2026-10-01');
    expect(watDayOf('2026-09-01T00:30:00.000Z')).toBe('2026-09-01');
    expect(watDayOf(null)).toBeNull();
  });

  it('computes WAT month bounds as a Date range', async () => {
    const { watMonthBounds } = await import('../paystack-reconcile');
    const { start, end } = watMonthBounds('2026-09');
    expect(start.toISOString()).toBe('2026-08-31T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-30T22:59:59.999Z');
  });
});

describe('matchByCustomerIdAmountDate', () => {
  it('matches on customer id + amount ±₦1 + same WAT day', async () => {
    const { matchByCustomerIdAmountDate } = await import('../paystack-reconcile');
    const rows = [
      { id: 's1', reference: 'X', email: 'a@x.com', amountNaira: 72000, paidAt: '2026-09-01T00:00:00.000Z', customerId: '2272' },
    ];
    const ps = {
      reference: '6a96b0ad5aefa',
      email: 'other@y.com', // email differs — golden key still wins
      amountNaira: 72000.5,
      paidAt: '2026-09-01T11:06:57.000Z',
      splynxCustomerId: '2272',
    };
    expect(matchByCustomerIdAmountDate(ps, rows)?.id).toBe('s1');
  });

  it('returns null without a customer id', async () => {
    const { matchByCustomerIdAmountDate } = await import('../paystack-reconcile');
    const rows = [
      { id: 's1', reference: 'X', email: 'a@x.com', amountNaira: 72000, paidAt: '2026-09-01T00:00:00.000Z', customerId: '2272' },
    ];
    expect(matchByCustomerIdAmountDate({ reference: 'r', email: '', amountNaira: 72000, paidAt: '2026-09-01' }, rows)).toBeNull();
  });

  it('amounts beyond ₦1 tolerance are not a match', async () => {
    const { matchByCustomerIdAmountDate } = await import('../paystack-reconcile');
    const rows = [
      { id: 's1', reference: 'X', email: 'a@x.com', amountNaira: 72500, paidAt: '2026-09-01T00:00:00.000Z', customerId: '2272' },
    ];
    const ps = { reference: 'r', email: '', amountNaira: 72000, paidAt: '2026-09-01T11:00:00.000Z', splynxCustomerId: '2272' };
    expect(matchByCustomerIdAmountDate(ps, rows)).toBeNull();
  });
});
import { classifyReconciliation, matchByEmailAmount, matchByEmailAmountDate, matchByReference } from '../paystack-reconcile';

const paystack = { reference: 'PSK-1', email: 'a@example.com', amountNaira: 43500, paidAt: '2026-08-01' };
const splynx = { id: 's1', reference: 'PSK-1', email: 'a@example.com', amountNaira: 43500, paidAt: '2026-08-01' };

describe('reconciliation engine', () => {
  it('matches identical references', () => {
    expect(matchByReference(paystack, [splynx])?.id).toBe('s1');
  });

  it('falls back to email, amount, and date', () => {
    const renamed = { ...splynx, reference: 'OTHER' };
    expect(matchByEmailAmountDate(paystack, [renamed])?.id).toBe('s1');
  });

  it('matches by email and amount across different days', () => {
    const otherDay = { ...splynx, reference: 'OTHER', paidAt: '2026-08-05' };
    expect(matchByEmailAmount(paystack, [otherDay])?.id).toBe('s1');
    expect(matchByEmailAmount(paystack, [{ ...otherDay, amountNaira: 1 }])).toBeNull();
  });

  it('classifies missing and mismatched rows', () => {
    expect(classifyReconciliation(paystack, []).kind).toBe('paystack-only');
    expect(classifyReconciliation(paystack, [{ ...splynx, amountNaira: 1 }]).kind).toBe('amount-mismatch');
  });
});
