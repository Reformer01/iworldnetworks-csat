import type { JsonValue } from './feedback-types';

export interface NegativeFeedbackShape {
  ratings?: JsonValue;
  satisfied?: string | null;
}

/**
 * A feedback is "negative" (and therefore flagged as a discrepancy / unresolved
 * issue to be actioned) only when the customer actually reported a problem:
 * any numeric rating below 4, or an explicit "no" on the satisfied question.
 * Positive feedback is never flagged.
 */
export function isNegativeFeedback(feedback: NegativeFeedbackShape): boolean {
  const ratings = feedback.ratings ?? {};
  const hasLowRating = Object.values(ratings).some((value) => typeof value === 'number' && Number.isFinite(value) && value < 4);
  const explicitNo = feedback.satisfied === 'no';
  return hasLowRating || explicitNo;
}
