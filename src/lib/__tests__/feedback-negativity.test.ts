import { describe, expect, it } from 'vitest';
import { isNegativeFeedback } from '../feedback-negativity';

describe('isNegativeFeedback', () => {
  it('flags a feedback with any rating below 4', () => {
    expect(isNegativeFeedback({ ratings: { accuracy: 3, reconnection: 5 } })).toBe(true);
    expect(isNegativeFeedback({ ratings: { overall: 1 } })).toBe(true);
  });

  it('does not flag feedback with ratings of 4 or 5', () => {
    expect(isNegativeFeedback({ ratings: { accuracy: 4, reconnection: 5, portalEase: 5 } })).toBe(false);
    expect(isNegativeFeedback({ ratings: { overall: 5 } })).toBe(false);
  });

  it('flags an explicit "no" on the satisfied question', () => {
    expect(isNegativeFeedback({ ratings: { overall: 4 }, satisfied: 'no' })).toBe(true);
  });

  it('does not flag "yes" or "partially" satisfied responses', () => {
    expect(isNegativeFeedback({ ratings: { overall: 4 }, satisfied: 'yes' })).toBe(false);
    expect(isNegativeFeedback({ ratings: { overall: 4 }, satisfied: 'partially' })).toBe(false);
  });

  it('ignores non-numeric rating values (enums like fcr/usedPortal)', () => {
    expect(isNegativeFeedback({ ratings: { fcr: 'No', usedPortal: 'No', overall: 5 } })).toBe(false);
  });

  it('does not flag feedback with no ratings at all', () => {
    expect(isNegativeFeedback({ ratings: {}, satisfied: null })).toBe(false);
    expect(isNegativeFeedback({})).toBe(false);
  });
});
