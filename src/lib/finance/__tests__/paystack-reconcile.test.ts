import { describe, it, expect } from 'vitest';
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
