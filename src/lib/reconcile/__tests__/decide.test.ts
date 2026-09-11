import { describe, it, expect } from 'vitest';
import { decideRecordBts, decideMrr, decideSegment, segmentForCategory, SEGMENT_FOR_CATEGORY } from '../decide';

describe('decideRecordBts', () => {
  it('fills an empty record bts from truth', () => {
    expect(decideRecordBts('', 'Sijuwola House')).toEqual({ action: 'fill', reason: expect.stringContaining('filled') });
    expect(decideRecordBts(null, 'Sijuwola House').action).toBe('fill');
    expect(decideRecordBts(undefined, 'Sijuwola House').action).toBe('fill');
  });

  it('flags a differing bts (case-insensitive)', () => {
    expect(decideRecordBts('Old Tower', 'Sijuwola House').action).toBe('flag');
    expect(decideRecordBts('sijuwola house', 'Sijuwola House').action).toBe('none');
  });

  it('returns none when equal or no truth', () => {
    expect(decideRecordBts('Sijuwola House', 'Sijuwola House').action).toBe('none');
    expect(decideRecordBts('Anything', null).action).toBe('none');
    expect(decideRecordBts('Anything', '').action).toBe('none');
    expect(decideRecordBts('', '').action).toBe('none');
  });
});

describe('decideMrr (±20% tolerance)', () => {
  it('auto-fixes within tolerance (10% off)', () => {
    expect(decideMrr(1100, 1000).action).toBe('auto');
    expect(decideMrr(900, 1000).action).toBe('auto');
    expect(decideMrr(1200, 1000).action).toBe('auto'); // exactly 20% → auto
  });

  it('flags beyond tolerance (40% off)', () => {
    expect(decideMrr(1400, 1000).action).toBe('flag');
    expect(decideMrr(600, 1000).action).toBe('flag');
    expect(decideMrr(1201, 1000).action).toBe('flag'); // just over 20%
  });

  it('returns none when equal', () => {
    expect(decideMrr(1000, 1000).action).toBe('none');
  });

  it('flags a non-zero current against a zero truth', () => {
    expect(decideMrr(500, 0).action).toBe('flag');
  });

  it('returns none when both zero', () => {
    expect(decideMrr(0, 0).action).toBe('none');
  });
});

describe('decideSegment', () => {
  it('remaps a mismatched segment to the category-derived truth', () => {
    const decision = decideSegment('HOME', 'RESIDENTIAL');
    expect(decision.action).toBe('auto');
    expect(decision.reason).toContain('RESIDENTIAL');
  });

  it('auto-fixes empty segment when a mapping exists', () => {
    expect(decideSegment('', 'ENTERPRISE').action).toBe('auto');
  });

  it('returns none when in sync (case-insensitive)', () => {
    expect(decideSegment('sme', 'SME').action).toBe('none');
  });

  it('returns none when the category has no mapping', () => {
    expect(decideSegment('ENTERPRISE', 'WHATEVER').action).toBe('none');
    expect(decideSegment('ENTERPRISE', null).action).toBe('none');
  });
});

describe('segmentForCategory', () => {
  it('maps every contract category', () => {
    expect(segmentForCategory('ENTERPRISE')).toBe('ENTERPRISE');
    expect(segmentForCategory('sme')).toBe('SME');
    expect(segmentForCategory('RESIDENTIAL')).toBe('RESIDENTIAL');
    expect(segmentForCategory('RETAIL')).toBe('RETAIL');
    expect(segmentForCategory('PARTNERS_HOSTS')).toBe('PARTNERS_HOSTS');
    expect(segmentForCategory('NEIGHBOURHOOD')).toBe('NEIGHBOURHOOD');
    expect(Object.keys(SEGMENT_FOR_CATEGORY)).toHaveLength(6);
  });

  it('returns null for unmapped or empty categories', () => {
    expect(segmentForCategory('OTHER')).toBeNull();
    expect(segmentForCategory('')).toBeNull();
    expect(segmentForCategory(null)).toBeNull();
  });
});