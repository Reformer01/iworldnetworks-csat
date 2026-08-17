'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Star, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CHURN_REASONS } from '@/lib/churn-reasons';

type PageState = 'loading' | 'form' | 'submitting' | 'success' | 'error';

const RATING_LABELS = ['', 'Very Unsatisfied', 'Unsatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'];

export default function ChurnPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [customerName, setCustomerName] = useState('');

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [reason, setReason] = useState<string>('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMessage('No survey link provided.');
      setPageState('error');
      return;
    }

    let cancelled = false;
    async function validateToken() {
      try {
        const res = await fetch(`/api/churn-survey/validate?token=${encodeURIComponent(token!)}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          if (!cancelled) {
            setErrorMessage(data.error || 'Invalid link.');
            setPageState('error');
          }
          return;
        }

        if (!cancelled) {
          setCustomerName(data.customerName || '');
          setPageState('form');
        }
      } catch {
        if (!cancelled) {
          setErrorMessage('Network error. Please check your connection.');
          setPageState('error');
        }
      }
    }

    validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit() {
    if (rating === 0 || !reason || pageState === 'submitting') return;

    setPageState('submitting');
    try {
      const res = await fetch('/api/submit-churn-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, reason, comment }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Submission failed. Please try again.');
        setPageState('error');
        return;
      }

      setPageState('success');
    } catch {
      setErrorMessage('Network error. Your response was not submitted.');
      setPageState('error');
    }
  }

  const starColor = (star: number) => {
    if (star <= hoveredRating) return 'text-amber-400 fill-amber-400';
    if (hoveredRating === 0 && star <= rating) return 'text-amber-400 fill-amber-400';
    return 'text-muted-foreground/30 dark:text-muted-foreground/20';
  };

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <Skeleton className="h-8 w-3/4 mx-auto mb-2" />
            <Skeleton className="h-4 w-1/2 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex justify-center gap-1 pt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-8 rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-6">{errorMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg shadow-2xl border-t-4 border-green-500 rounded-3xl">
          <CardContent className="pt-12 pb-10 text-center space-y-4">
            <div className="mx-auto w-20 h-20 bg-green-50 dark:bg-green-950/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-primary">Thank you!</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
              We appreciate you taking the time to tell us what happened. Your feedback helps us improve.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4 py-12">
      <Card className="w-full max-w-xl shadow-2xl rounded-3xl overflow-hidden border border-border">
        <div className="bg-primary px-6 py-8 text-white relative overflow-hidden flex flex-col items-center text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-secondary mb-1">Reactivation Survey</p>
          <CardTitle className="text-2xl font-display font-bold">We&apos;d love to know why</CardTitle>
          <CardDescription className="text-white/70 text-xs mt-1">
            {customerName ? `Hi ${customerName},` : 'Help us understand what went wrong.'}
          </CardDescription>
        </div>

        <CardContent className="space-y-8 p-6 md:p-8">
          {/* 1. Overall Rating */}
          <div className="text-center space-y-4 border-b border-border/50 pb-6">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-mono">How was your overall experience?</h3>
            <div className="flex justify-center gap-3" onMouseLeave={() => setHoveredRating(0)}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="transition-all duration-150 hover:scale-125 active:scale-90"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  aria-label={`Rate ${star} out of 5`}
                >
                  <Star className={cn('h-10 w-10 transition-colors', starColor(star))} />
                </button>
              ))}
            </div>
            {rating > 0 ? (
              <p className="text-sm font-bold text-amber-500 animate-pulse">
                {rating} / 5 &mdash; {RATING_LABELS[rating]}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Select a star rating to proceed</p>
            )}
          </div>

          {/* 2. Reason */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-mono">Why did you leave?</h3>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {CHURN_REASONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReason(option)}
                  className={cn(
                    'py-3 px-4 rounded-2xl border text-xs font-bold transition-all hover:scale-[1.02] text-left',
                    reason === option
                      ? 'bg-primary/10 border-primary text-primary shadow-sm'
                      : 'bg-background border-border text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Optional Comment */}
          <div className="space-y-2 border-t border-border/50 pt-6">
            <label className="text-sm font-semibold text-primary block uppercase tracking-wider font-mono">Anything else?</label>
            <Textarea
              placeholder="Tell us more about your experience..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              className="rounded-xl border-border/70 focus-visible:ring-secondary focus-visible:border-secondary"
            />
            <p className="text-[10px] text-muted-foreground text-right">{comment.length} / 1000</p>
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-3 p-6 md:p-8 bg-muted/10 border-t border-border/50">
          <Button
            className="w-full py-6 rounded-full font-mono text-xs uppercase tracking-widest font-bold shadow-lg transition-all"
            size="lg"
            disabled={rating === 0 || !reason || pageState === 'submitting'}
            onClick={handleSubmit}
          >
            {pageState === 'submitting' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground font-mono">I-World Networks &mdash; reliably connected</p>
        </CardFooter>
      </Card>
    </div>
  );
}
