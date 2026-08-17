'use client';

import { Star } from 'lucide-react';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { getCommentText, getNumericRatings } from '@/lib/feedback-ratings';
import { cn } from '@/lib/utils';

interface FeedbackQuoteProps {
  feedback: FeedbackDoc;
  className?: string;
  /** Render inside the quote even when the customer left no comment. */
  showFallback?: boolean;
}

function RatingStars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" aria-label={`${value} out of 5`}>
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={cn(i < Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-border')}
        />
      ))}
    </span>
  );
}

/**
 * Displays a customer's feedback text AND the scores they gave. When the
 * customer left a comment, it is shown first with the rating chips below it;
 * when they skipped the comment (writers always store `comment: ''`), the
 * individual scores are shown instead — one chip per rating question — so no
 * card is ever an empty quote box.
 */
export default function FeedbackQuote({ feedback, className, showFallback = true }: FeedbackQuoteProps) {
  const comment = getCommentText(feedback);
  const ratings = getNumericRatings(feedback);
  const hasRatings = ratings.length > 0;

  // Chips render whenever a rating exists: below the comment when there is
  // one, or as the fallback display when the customer left no comment.
  const showChips = hasRatings && (comment || showFallback);
  if (!comment && !showChips) return null;

  return (
    <>
      {comment && <p className={cn('italic', className)}>&ldquo;{comment}&rdquo;</p>}
      {showChips && (
        <div className={cn('space-y-2', comment ? 'mt-1.5' : className)}>
          {!comment && (
            <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant/60 tracking-widest">Rated — no comment left</p>
          )}
          <div className="flex flex-wrap gap-2">
            {ratings.map((r) => (
              <span
                key={r.key}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-[11px] font-medium text-on-surface"
              >
                {r.label}
                <RatingStars value={r.value} size={11} />
                <span className="font-mono font-bold text-on-surface-variant">{r.value}/5</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
