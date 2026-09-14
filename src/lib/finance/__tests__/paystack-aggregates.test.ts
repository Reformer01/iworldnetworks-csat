import { describe, it, expect } from 'vitest';
import { buildPaystackOverview, filterPaystackTransactions } from '../paystack-aggregates';

const rows = [
  {
    reference: 'PSK-1',
    amount: 4350000,
    status: 'success',
    channel: 'card',
    customerEmail: 'a@example.com',
    customerName: 'Ada',
    paidAt: '2026-08-01T10:00:00.000Z',
    refundedNaira: 0,
    disputeStatus: null,
    raw: { metadata: { region: 'Ogun' } },
  },
  {
    reference: 'PSK-2',
    amount: 100000,
    status: 'success',
    channel: 'bank',
    customerEmail: 'b@example.com',
    customerName: 'Bola',
    paidAt: '2026-08-02T10:00:00.000Z',
    refundedNaira: 500,
    disputeStatus: 'charged',
    raw: { metadata: { region: 'Lagos' } },
  },
  {
    reference: 'PSK-3',
    amount: 200000,
    status: 'failed',
    channel: 'card',
    customerEmail: 'c@example.com',
    customerName: 'Chidi',
    paidAt: '2026-08-02T12:00:00.000Z',
    refundedNaira: 0,
    disputeStatus: null,
    raw: {},
  },
];

describe('paystack aggregates', () => {
  it('computes total collected and success rate', () => {
    const out = buildPaystackOverview(rows, [], '2026-08');
    expect(out.kpis.collectedNaira).toBe(44500);
    expect(out.kpis.successCount).toBe(2);
    expect(out.kpis.successRate).toBeCloseTo(66.7, 1);
  });

  it('builds channel totals', () => {
    const out = buildPaystackOverview(rows, [], '2026-08');
    const card = out.channels.find((c) => c.channel === 'card');
    expect(card?.collectedNaira).toBe(43500);
    expect(card?.count).toBe(1);
  });

  it('computes unmatched value from links', () => {
    const matched = buildPaystackOverview(rows, [{ paystackReference: 'PSK-1', status: 'matched' }], '2026-08');
    expect(matched.kpis.unmatchedNaira).toBe(1000);
    const allMatched = buildPaystackOverview(
      rows,
      [
        { paystackReference: 'PSK-1', status: 'matched' },
        { paystackReference: 'PSK-2', status: 'matched' },
      ],
      '2026-08',
    );
    expect(allMatched.kpis.unmatchedNaira).toBe(0);
  });

  it('handles empty input without dividing by zero', () => {
    const out = buildPaystackOverview([], [], '2026-08');
    expect(out.kpis.collectedNaira).toBe(0);
    expect(out.kpis.successRate).toBe(0);
    expect(out.series).toEqual([]);
    expect(out.channels).toEqual([]);
    expect(out.recent).toEqual([]);
  });

  it('filters transactions by month, status, and query', () => {
    expect(filterPaystackTransactions(rows, { month: '2026-08' })).toHaveLength(3);
    expect(filterPaystackTransactions(rows, { month: '2026-07' })).toHaveLength(0);
    expect(filterPaystackTransactions(rows, { status: 'success' })).toHaveLength(2);
    expect(filterPaystackTransactions(rows, { query: 'bola' })).toHaveLength(1);
  });
});
