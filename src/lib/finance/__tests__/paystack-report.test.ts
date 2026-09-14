import { describe, it, expect } from 'vitest';
import {
  buildCustomersCsv,
  buildCustomersPdfTables,
  buildMonthlySnapshotPayload,
  buildOverviewPdfTables,
  buildReconciliationCsv,
  buildReconciliationPdfTables,
  buildSnapshotPdfTables,
  buildTransactionsCsv,
  escapeCsvCell,
} from '../paystack-report';

describe('paystack report csv', () => {
  it('escapes commas, quotes, and newlines', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell(null)).toBe('');
  });

  it('builds transaction csv with escaped detail rows', () => {
    const csv = buildTransactionsCsv([
      {
        reference: 'PSK-1',
        customer: 'Ada, "Ace"',
        customerEmail: 'ada@example.com',
        amountNaira: 43500,
        channel: 'card',
        status: 'success',
        paidAt: '2026-08-01T00:00:00.000Z',
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('reference,customer,email,amountNaira,channel,status,paidAt');
    expect(lines[1]).toContain('"Ada, ""Ace"""');
  });

  it('builds reconciliation csv', () => {
    const csv = buildReconciliationCsv([
      {
        paystackReference: 'PSK-1',
        splynxLedgerId: 's1',
        method: 'reference',
        confidence: 1,
        paystackAmountNaira: 43500,
        splynxAmountNaira: 43500,
        varianceNaira: 0,
        status: 'matched',
      },
    ]);
    expect(csv.split('\n')[0]).toContain('paystackReference');
    expect(csv).toContain('matched');
  });

  it('builds customer csv', () => {
    const csv = buildCustomersCsv([
      {
        email: 'a@example.com',
        name: 'Ada',
        lifetimeNaira: 43500,
        frequency: 2,
        lastPaidAt: null,
        region: 'Ogun',
        segment: null,
        status: 'returning',
      },
    ]);
    expect(csv.split('\n')[0]).toBe('email,name,lifetimeNaira,frequency,lastPaidAt,region,segment,status');
    expect(csv).toContain('returning');
  });
});

describe('paystack snapshot payload', () => {
  it('freezes totals, breakdowns, reconciliation, and exceptions', () => {
    const payload = buildMonthlySnapshotPayload({
      month: '2026-08',
      totals: {
        collectedNaira: 43500,
        successCount: 1,
        successRate: 100,
        unmatchedNaira: 0,
        refundedNaira: 0,
        disputeCount: 0,
      },
      channels: [{ channel: 'card', collectedNaira: 43500, count: 1 }],
      regions: [{ region: 'Ogun', collectedNaira: 43500, count: 1 }],
      segments: [{ segment: 'SME', collectedNaira: 43500, count: 1 }],
      reconciliation: { matched: 1 },
      exceptions: { open: 0 },
    });
    expect(payload.totals.collectedNaira).toBe(43500);
    expect(payload.channels).toHaveLength(1);
    expect(payload.regions).toHaveLength(1);
    expect(payload.segments).toHaveLength(1);
    expect(payload.reconciliation.matched).toBe(1);
    expect(payload.exceptions.open).toBe(0);
  });
});

describe('paystack pdf tables', () => {
  const totals = {
    collectedNaira: 43500,
    successCount: 1,
    successRate: 100,
    unmatchedNaira: 0,
    refundedNaira: 0,
    disputeCount: 0,
  };

  it('covers overview, reconciliation, customers, and snapshots', () => {
    const overview = buildOverviewPdfTables({
      month: '2026-08',
      totals,
      channels: [{ channel: 'card', collectedNaira: 43500, count: 1 }],
    });
    expect(overview).toHaveLength(2);
    expect(overview[0].head).toEqual(['Metric', 'Value']);

    const reconciliation = buildReconciliationPdfTables({ matched: 1, 'paystack-only': 2 });
    expect(reconciliation).toHaveLength(1);
    expect(reconciliation[0].head).toEqual(['Queue', 'Count']);

    const customers = buildCustomersPdfTables([{ email: 'a@example.com', name: 'Ada', lifetimeNaira: 43500, frequency: 1, status: 'new' }]);
    expect(customers).toHaveLength(1);
    expect(customers[0].head).toEqual(['Customer', 'Lifetime (NGN)', 'Payments', 'Status']);

    const snapshots = buildSnapshotPdfTables({ month: '2026-08', totals });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].title).toContain('2026-08');
  });
});
