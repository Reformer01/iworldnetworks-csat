import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeedbackQuote from '../FeedbackQuote';
import type { FeedbackDoc } from '@/lib/feedback-types';

function makeFeedback(overrides: Partial<FeedbackDoc> = {}): FeedbackDoc {
  return {
    id: 'fb-1',
    customerName: 'Ada Customer',
    category: 'Reliability',
    location: 'Best Fibre (Ota)',
    ...overrides,
  };
}

describe('FeedbackQuote', () => {
  it('shows the comment AND the star rating when both exist', () => {
    render(
      <FeedbackQuote
        feedback={makeFeedback({
          comment: 'My networ is very very slow and bad',
          ratings: { overall: 2 },
        })}
      />,
    );

    // Comment quote present
    expect(screen.getByText('“My networ is very very slow and bad”')).toBeDefined();
    // Rating chip present with stars + numeric value
    expect(screen.getByText('Overall Experience')).toBeDefined();
    expect(screen.getByText('2/5')).toBeDefined();
    expect(screen.getByLabelText('2 out of 5')).toBeDefined();
  });

  it('shows the comment alone when there is no rating', () => {
    render(
      <FeedbackQuote
        feedback={makeFeedback({
          comment: 'Just a note, no score given',
          ratings: {},
        })}
      />,
    );

    expect(screen.getByText('“Just a note, no score given”')).toBeDefined();
    expect(screen.queryByText('Overall Experience')).toBeNull();
    expect(screen.queryByLabelText(/out of 5/)).toBeNull();
  });

  it('shows rating chips as the fallback when the customer left no comment', () => {
    render(
      <FeedbackQuote
        feedback={makeFeedback({
          comment: '',
          ratings: { overall: 5, invoiceAccuracy: 4 },
        })}
      />,
    );

    expect(screen.getByText('Rated — no comment left')).toBeDefined();
    expect(screen.getByText('Overall Experience')).toBeDefined();
    expect(screen.getByText('Invoice Accuracy')).toBeDefined();
    expect(screen.getByText('5/5')).toBeDefined();
    expect(screen.getByText('4/5')).toBeDefined();
    expect(screen.getByLabelText('5 out of 5')).toBeDefined();
    expect(screen.getByLabelText('4 out of 5')).toBeDefined();
  });

  it('renders nothing when there is neither a comment nor a rating', () => {
    render(
      <FeedbackQuote
        feedback={makeFeedback({
          comment: '',
          ratings: {},
        })}
      />,
    );

    expect(screen.queryByText(/“/)).toBeNull();
    expect(screen.queryByText('Overall Experience')).toBeNull();
  });

  it('respects showFallback=false for rating-only records', () => {
    render(
      <FeedbackQuote
        feedback={makeFeedback({
          comment: '',
          ratings: { overall: 3 },
        })}
        showFallback={false}
      />,
    );

    expect(screen.queryByText('Overall Experience')).toBeNull();
    expect(screen.queryByLabelText(/out of 5/)).toBeNull();
  });
});
