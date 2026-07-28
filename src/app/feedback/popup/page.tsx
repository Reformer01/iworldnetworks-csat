'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Star, Loader2, CheckCircle2, AlertCircle, ThumbsUp, ThumbsDown, Smile, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { mapSplynxEventToCategory } from '@/lib/splynx-categories';

type PageState = 'loading' | 'form' | 'submitting' | 'success' | 'error';

interface CustomerData {
  customerName: string;
  customerEmail: string;
  servicePlan: string;
  location: string;
  serviceDate: string;
  sourceEvent: string;
}

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

export default function FeedbackPopup() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const isEmbed = searchParams.get('embed') === 'true';

  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [category, setCategory] = useState<string>('Billing');

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [satisfied, setSatisfied] = useState<'yes' | 'no' | 'partially' | undefined>(undefined);
  const [invoiceAccuracy, setInvoiceAccuracy] = useState(0);
  const [hoveredInvoiceAccuracy, setHoveredInvoiceAccuracy] = useState(0);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMessage('No feedback token provided.');
      setPageState('error');
      return;
    }

    let cancelled = false;
    async function validateToken() {
      try {
        const res = await fetch(`/api/feedback-token/validate?token=${encodeURIComponent(token!)}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          if (!cancelled) {
            setErrorMessage(data.error || 'Invalid token.');
            setPageState('error');
          }
          return;
        }

        if (!cancelled) {
          setCustomer({
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            servicePlan: data.servicePlan,
            location: data.location,
            serviceDate: data.serviceDate,
            sourceEvent: data.sourceEvent,
          });

          const mappedCat = mapSplynxEventToCategory(data.sourceEvent || '');
          setCategory(mappedCat);
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
    if (rating === 0 || pageState === 'submitting') return;
    if (category === 'Billing' && invoiceAccuracy === 0) return;

    setPageState('submitting');
    try {
      const res = await fetch('/api/submit-splynx-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          rating,
          satisfied,
          invoiceAccuracy: category === 'Billing' ? invoiceAccuracy : undefined,
          comment,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Submission failed. Please try again.');
        setPageState('error');
        return;
      }

      setPageState('success');
      if (isEmbed && window.parent !== window) {
        window.parent.postMessage({ type: 'FEEDBACK_SUBMITTED', payload: data }, '*');
      }
    } catch {
      setErrorMessage('Network error. Your feedback was not submitted.');
      setPageState('error');
    }
  }

  function handleClose() {
    if (isEmbed && window.parent !== window) {
      window.parent.postMessage({ type: 'FEEDBACK_CLOSED' }, '*');
    } else {
      window.close();
    }
  }

  const starColor = (star: number) => {
    if (star <= hoveredRating) return 'text-amber-400 fill-amber-400';
    if (hoveredRating === 0 && star <= rating) return 'text-amber-400 fill-amber-400';
    return 'text-muted-foreground/30 dark:text-muted-foreground/20';
  };

  const invoiceStarColor = (star: number) => {
    if (star <= hoveredInvoiceAccuracy) return 'text-amber-400 fill-amber-400';
    if (hoveredInvoiceAccuracy === 0 && star <= invoiceAccuracy) return 'text-amber-400 fill-amber-400';
    return 'text-muted-foreground/30 dark:text-muted-foreground/20';
  };

  if (pageState === 'loading') {
    return (
      <div className="min-h-[300px] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 py-8">
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
      <div className="min-h-[300px] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-6">{errorMessage}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="min-h-[300px] flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-t-4 border-green-500 rounded-3xl">
          <CardContent className="pt-12 pb-10 text-center space-y-4">
            <div className="mx-auto w-20 h-20 bg-green-50 dark:bg-green-950/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-primary">Thank you!</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
              Your feedback has been recorded. We appreciate you helping us improve.
            </p>
            <Button
              onClick={handleClose}
              className="w-full max-w-xs mx-auto mt-4 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold py-3"
            >
              Close
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const containerClass = isEmbed
    ? 'w-full max-w-md mx-auto'
    : 'min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4 py-12';

  return (
    <div className={containerClass}>
      <Card className={cn('w-full max-w-xl shadow-2xl rounded-3xl overflow-hidden border border-border', isEmbed && 'max-w-md')}>
        <div className="bg-primary px-6 py-6 text-white relative overflow-hidden flex flex-col items-center text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-secondary mb-1">Payment Feedback</p>
          <CardTitle className="text-xl font-display font-bold">I-World Networks</CardTitle>
          <CardDescription className="text-white/70 text-xs mt-1">How was your payment experience?</CardDescription>
          {!isEmbed && (
            <button onClick={handleClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <CardContent className="space-y-6 p-6 md:p-8">
          {customer && (
            <div className="rounded-2xl bg-muted/40 p-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs border border-border/40">
              <div>
                <span className="text-muted-foreground block">Customer</span>
                <span className="font-semibold text-primary">{customer.customerName}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Location</span>
                <span className="font-semibold text-primary">{customer.location}</span>
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground block">Plan</span>
                <span className="font-semibold text-primary">{customer.servicePlan || 'Enterprise'}</span>
              </div>
            </div>
          )}

          {/* 1. Overall Rating */}
          <div className="text-center space-y-3 border-b border-border/50 pb-4">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-mono">Overall Experience</h3>
            <div className="flex justify-center gap-2" onMouseLeave={() => setHoveredRating(0)}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="transition-all duration-150 hover:scale-125 active:scale-90"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  aria-label={`Rate ${star} of 5`}
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
              <p className="text-xs text-muted-foreground">Select a rating</p>
            )}
          </div>

          {rating > 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {/* 2. Satisfaction */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-primary block uppercase tracking-wider font-mono">Satisfaction Status</label>
                <p className="text-xs text-muted-foreground">Are you satisfied with this payment?</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSatisfied('yes')}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all',
                      satisfied === 'yes'
                        ? 'bg-green-500/10 border-green-500 text-green-600'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Satisfied
                  </button>
                  <button
                    type="button"
                    onClick={() => setSatisfied('partially')}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all',
                      satisfied === 'partially'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-600'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    <Smile className="w-4 h-4" />
                    Partial
                  </button>
                  <button
                    type="button"
                    onClick={() => setSatisfied('no')}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all',
                      satisfied === 'no'
                        ? 'bg-red-500/10 border-red-500 text-red-600'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Unsatisfied
                  </button>
                </div>
              </div>

              {/* 3. Invoice Accuracy (Billing only) */}
              {category === 'Billing' && (
                <div className="space-y-3 border-t border-border/50 pt-4">
                  <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-mono">Invoice Accuracy</h3>
                  <p className="text-xs text-muted-foreground">Was the invoice amount correct and clear?</p>
                  <div className="flex justify-center gap-2" onMouseLeave={() => setHoveredInvoiceAccuracy(0)}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className="transition-transform duration-100 hover:scale-110"
                        onClick={() => setInvoiceAccuracy(star)}
                        onMouseEnter={() => setHoveredInvoiceAccuracy(star)}
                      >
                        <Star className={cn('w-7 h-7', invoiceStarColor(star))} />
                      </button>
                    ))}
                  </div>
                  {invoiceAccuracy > 0 ? (
                    <p className="text-sm font-bold text-amber-500 text-center">{invoiceAccuracy} / 5</p>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center">Select accuracy rating</p>
                  )}
                </div>
              )}

              {/* 4. Optional Comment */}
              <div className="space-y-2 border-t border-border/50 pt-4">
                <label className="text-sm font-semibold text-primary block uppercase tracking-wider font-mono">Comments (Optional)</label>
                <textarea
                  placeholder="Anything else about this payment?"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="w-full rounded-xl border border-border/70 focus-visible:ring-secondary focus-visible:border-secondary px-3 py-2 text-sm bg-background"
                />
                <p className="text-[10px] text-muted-foreground text-right">{comment.length} / 500</p>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-2 p-6 bg-muted/10 border-t border-border/50">
          <Button
            className="w-full py-4 rounded-full font-mono text-xs uppercase tracking-widest font-bold shadow-lg"
            size="lg"
            disabled={rating === 0 || (category === 'Billing' && invoiceAccuracy === 0) || pageState === 'submitting'}
            onClick={handleSubmit}
          >
            {pageState === 'submitting' ? 'Submitting...' : 'Submit Feedback'}
          </Button>
          <a href="/" target="_blank" className="text-[10px] text-secondary font-mono font-bold underline hover:no-underline">
            Want to share more details? Visit our full feedback page
          </a>
          {!isEmbed && <p className="text-[10px] text-muted-foreground font-mono">I-World Networks &mdash; reliably connected</p>}
        </CardFooter>
      </Card>
    </div>
  );
}
