import { describe, expect, it } from 'vitest';
import { deriveBtsAccountType, isBundledServicePlan } from '../bts-account-type';

describe('deriveBtsAccountType', () => {
  it('uses the plan when Splynx reports regular', () => {
    expect(deriveBtsAccountType('regular', 'H-Pro')).toBe('RESIDENTIAL');
    expect(deriveBtsAccountType('regular', 'Internet - H-Pro (A-1) OG - 003')).toBe('RESIDENTIAL');
    expect(deriveBtsAccountType('regular', 'H - Lite Unlimited')).toBe('RESIDENTIAL');
    expect(deriveBtsAccountType('regular', 'U-Pro')).toBe('SME');
    expect(deriveBtsAccountType('regular', 'Internet - U-Lite (A-1) OG - 003')).toBe('SME');
    expect(deriveBtsAccountType('regular', 'N-15K')).toBe('NEIGHBOURHOOD');
    expect(deriveBtsAccountType('regular', '50Mbps')).toBe('ENTERPRISE');
  });

  it('preserves meaningful explicit account types', () => {
    expect(deriveBtsAccountType('enterprise', '')).toBe('ENTERPRISE');
    expect(deriveBtsAccountType('partners & hosts', '')).toBe('PARTNERS_HOSTS');
  });

  it('uses OTHER for an unclassified regular customer', () => {
    expect(deriveBtsAccountType('regular', '')).toBe('OTHER');
    expect(deriveBtsAccountType('regular', 'Baynans Hotel')).toBe('ENTERPRISE');
    expect(deriveBtsAccountType('regular', 'H-Lite + U-Lite')).toBe('BUNDLED');
    expect(deriveBtsAccountType('residential', 'H-Lite + U-Lite')).toBe('BUNDLED');
    expect(deriveBtsAccountType('regular', 'BUNDLE: H-Lite + U-Lite')).toBe('BUNDLED');
  });

  it('detects bundled service-plan labels', () => {
    expect(isBundledServicePlan('H-Lite + U-Lite')).toBe(true);
    expect(isBundledServicePlan('BUNDLE: H-Lite')).toBe(true);
    expect(isBundledServicePlan('H-Lite')).toBe(false);
  });
});
