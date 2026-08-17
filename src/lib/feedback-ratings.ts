// Canonical per-category feedback rating configuration + helpers.
//
// Two feedback flows write ratings with DIFFERENT key names:
//   - Legacy web form: per-category keys (Billing -> accuracy/reconnection/portalEase, ...)
//   - Tokenized survey (/feedback, /feedback/popup): generic keys overall/invoiceAccuracy
// This module provides the canonical key -> label map and normalizers so every
// admin page can display "each score the customer gave" regardless of which
// flow produced the document.

import type { FeedbackDoc } from '@/lib/feedback-types';

export interface RatingQuestion {
  key: string;
  label: string;
}

export interface FeedbackRating {
  key: string;
  label: string;
  value: number;
}

/**
 * Rating questions per category (legacy web-form convention).
 * Mirrors src/app/admin/crud/page.tsx `categoryFields` and src/app/page.tsx.
 */
export const CATEGORY_RATING_QUESTIONS: Record<string, RatingQuestion[]> = {
  Reliability: [
    { key: 'stability', label: 'Stability' },
    { key: 'latency', label: 'Latency' },
    { key: 'peakPerformance', label: 'Peak Performance' },
  ],
  Support: [
    { key: 'professionalism', label: 'Professionalism' },
    { key: 'clarity', label: 'Clarity' },
    { key: 'responsiveness', label: 'Responsiveness' },
    { key: 'knowledge', label: 'Knowledge' },
    { key: 'friendliness', label: 'Friendliness' },
  ],
  FieldSupport: [
    { key: 'resolutionSpeed', label: 'Resolution Speed' },
    { key: 'repairQuality', label: 'Repair Quality' },
    { key: 'conduct', label: 'Technician Conduct' },
  ],
  Testimonials: [{ key: 'signal', label: 'Signal Coverage' }],
  Installation: [
    { key: 'punctuality', label: 'Punctuality' },
    { key: 'quality', label: 'Quality of Work' },
    { key: 'explanation', label: 'Explanation' },
    { key: 'timeliness', label: 'Timeliness' },
  ],
  Billing: [
    { key: 'accuracy', label: 'Billing Accuracy' },
    { key: 'reconnection', label: 'Internet Restoration' },
    { key: 'portalEase', label: 'Portal Ease of Use' },
  ],
};

/**
 * Generic questions the tokenized survey (/feedback, /feedback/popup) writes.
 * `invoiceAccuracy` is shown for Billing; `overall` applies to every category.
 */
export const GENERIC_RATING_QUESTIONS: RatingQuestion[] = [
  { key: 'overall', label: 'Overall Experience' },
  { key: 'invoiceAccuracy', label: 'Invoice Accuracy' },
];

/** Non-numeric (enum) rating keys — excluded from numeric aggregates. */
export const ENUM_RATING_KEYS = ['usedPortal', 'responseTime', 'fcr'] as const;

function isNumericRatingValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * All numeric ratings a feedback doc carries, normalized across both flows.
 * Legacy per-category keys are preferred; generic keys fill the gap for docs
 * produced by the tokenized survey.
 */
export function getNumericRatings(feedback: FeedbackDoc): FeedbackRating[] {
  const ratings = feedback.ratings ?? {};
  const category = feedback.category || '';
  const categoryQuestions = CATEGORY_RATING_QUESTIONS[category] ?? [];
  const genericQuestions = GENERIC_RATING_QUESTIONS;

  const seen = new Set<string>();
  const result: FeedbackRating[] = [];

  for (const q of [...categoryQuestions, ...genericQuestions]) {
    if (seen.has(q.key)) continue;
    seen.add(q.key);
    const raw = ratings[q.key];
    if (isNumericRatingValue(raw)) {
      result.push({ key: q.key, label: q.label, value: raw });
    }
  }
  return result;
}

/** True when the doc carries at least one numeric rating. */
export function hasNumericRatings(feedback: FeedbackDoc): boolean {
  return getNumericRatings(feedback).length > 0;
}

/** The customer's comment, trimmed, or '' when none was provided. */
export function getCommentText(feedback: FeedbackDoc): string {
  return (feedback.comment ?? '').trim();
}

/**
 * A text summary of the feedback suitable for copying: the comment when
 * present, otherwise "Label 4/5, Label 5/5" style breakdown of every score.
 */
export function feedbackSummaryText(feedback: FeedbackDoc): string {
  const comment = getCommentText(feedback);
  if (comment) return comment;

  const ratings = getNumericRatings(feedback);
  if (ratings.length > 0) {
    return ratings.map((r) => `${r.label}: ${r.value}/5`).join(', ');
  }
  return '';
}

/**
 * Average of a specific rating key across docs that actually carry it
 * (docs without the key are excluded, not counted as zero).
 */
export function averageRating(feedbacks: FeedbackDoc[], keys: string[]): { average: number; count: number } {
  let sum = 0;
  let count = 0;
  for (const f of feedbacks) {
    for (const key of keys) {
      const raw = f.ratings?.[key];
      if (isNumericRatingValue(raw)) {
        sum += raw;
        count += 1;
        break; // count each doc once even if it carries several of the keys
      }
    }
  }
  return { average: count > 0 ? Math.round((sum / count) * 10) / 10 : 0, count };
}
