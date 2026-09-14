import { describe, it, expect } from 'vitest';
import { koboToNaira, normalizeChannel, normalizeEmail, normalizePaystackStatus, normalizeReference } from '../paystack-normalize';

describe('paystack normalization', () => {
  it('converts kobo to naira', () => {
    expect(koboToNaira(4350000)).toBe(43500);
    expect(koboToNaira(null)).toBe(0);
  });

  it('normalizes channels and statuses', () => {
    expect(normalizeChannel('Card')).toBe('card');
    expect(normalizePaystackStatus('Success')).toBe('success');
    expect(normalizePaystackStatus('Abandoned')).toBe('abandoned');
  });

  it('normalizes matching keys', () => {
    expect(normalizeReference(' Paystack Splynx / 2026-30-06188 ')).toBe('paystack splynx / 2026-30-06188');
    expect(normalizeEmail(' SOMEONE@Example.COM ')).toBe('someone@example.com');
  });
});
