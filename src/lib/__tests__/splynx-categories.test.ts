import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LABELS,
  FEEDBACK_CATEGORIES,
  getCategoryLabel,
  isValidCategory,
  mapSplynxEventToCategory,
  resolveCategory,
} from '../splynx-categories';

describe('CATEGORY_MAP', () => {
  it('maps splynx events to their default category', () => {
    expect(mapSplynxEventToCategory('invoice/create')).toBe('Billing');
    expect(mapSplynxEventToCategory('ticket/new')).toBe('Support');
    expect(mapSplynxEventToCategory('customer/create')).toBe('Installation');
    expect(mapSplynxEventToCategory('field_support/create')).toBe('FieldSupport');
    expect(mapSplynxEventToCategory('cpe/update')).toBe('FieldSupport');
    expect(mapSplynxEventToCategory('repair/start')).toBe('FieldSupport');
  });

  it('falls back to Reliability for unknown events', () => {
    expect(mapSplynxEventToCategory('')).toBe('Reliability');
    expect(mapSplynxEventToCategory('something/else')).toBe('Reliability');
  });
});

describe('isValidCategory', () => {
  it('accepts the six canonical categories', () => {
    for (const c of FEEDBACK_CATEGORIES) {
      expect(isValidCategory(c)).toBe(true);
    }
  });

  it('rejects unknown, empty and null values', () => {
    expect(isValidCategory('Nope')).toBe(false);
    expect(isValidCategory('')).toBe(false);
    expect(isValidCategory(null)).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
  });
});

describe('getCategoryLabel', () => {
  it('returns the friendly label for known categories', () => {
    expect(getCategoryLabel('Reliability')).toBe('Internet Quality');
    expect(getCategoryLabel('Support')).toBe('Customer Support');
    expect(getCategoryLabel('FieldSupport')).toBe('Field Support');
    expect(getCategoryLabel('Billing')).toBe('Payments & Billing');
  });

  it('passes through unknown values', () => {
    expect(getCategoryLabel('Whatever')).toBe('Whatever');
  });

  it('CATEGORY_LABELS covers every canonical category', () => {
    for (const c of FEEDBACK_CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
});

describe('resolveCategory', () => {
  it('gives the explicit subject top priority', () => {
    expect(resolveCategory({ subject: 'FieldSupport', tokenCategory: 'Billing', sourceEvent: 'invoice/create' })).toBe('FieldSupport');
    expect(resolveCategory({ subject: 'Support', tokenCategory: '', sourceEvent: '' })).toBe('Support');
  });

  it('ignores invalid subject values', () => {
    expect(resolveCategory({ subject: 'bogus', tokenCategory: 'Billing', sourceEvent: 'invoice/create' })).toBe('Billing');
    expect(resolveCategory({ subject: '', tokenCategory: 'Reliability', sourceEvent: 'invoice/create' })).toBe('Reliability');
  });

  it('uses the token category before the source event', () => {
    expect(resolveCategory({ subject: null, tokenCategory: 'Billing', sourceEvent: 'ticket/new' })).toBe('Billing');
    expect(resolveCategory({ subject: null, tokenCategory: 'FieldSupport', sourceEvent: 'invoice/create' })).toBe('FieldSupport');
  });

  it('falls back to event mapping then Reliability', () => {
    expect(resolveCategory({ subject: null, tokenCategory: '', sourceEvent: 'ticket/new' })).toBe('Support');
    expect(resolveCategory({ subject: null, tokenCategory: '', sourceEvent: 'repair/done' })).toBe('FieldSupport');
    expect(resolveCategory({ subject: null, tokenCategory: '', sourceEvent: '' })).toBe('Reliability');
    expect(resolveCategory({})).toBe('Reliability');
  });
});
