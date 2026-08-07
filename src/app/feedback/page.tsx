'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Star, Loader2, CheckCircle2, AlertCircle, ThumbsUp, ThumbsDown, Smile } from 'lucide-react';
import { cn, formatLocalDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveCategory, getCategoryLabel } from '@/lib/splynx-categories';
import ShareFeedbackButtons from '@/components/ShareFormButtons';

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

export default function FeedbackPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const subject = searchParams.get('subject');
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [category, setCategory] = useState<string>('Reliability');

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

          setCategory(resolveCategory({ subject, tokenCategory: data.category, sourceEvent: data.sourceEvent || '' }));
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
  }, [token, subject]);

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
    } catch {
      setErrorMessage('Network error. Your feedback was not submitted.');
      setPageState('error');
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
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg shadow-2xl border-t-4 border-green-500 rounded-3xl">
          <CardContent className="pt-12 pb-10 text-center space-y-4">
            <div className="mx-auto w-20 h-20 bg-green-50 dark:bg-green-950/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-primary">Thank you!</h2>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
              Your feedback has been recorded. We appreciate you helping us improve our services.
            </p>
            {customer?.serviceDate && (
              <p className="text-xs text-muted-foreground">
                Experience dated <span className="font-semibold text-primary">{formatLocalDate(customer.serviceDate)}</span>
              </p>
            )}
            <ShareFeedbackButtons url="https://iwn.ng/feedback" label="Share the feedback page with someone who experienced our service" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4 py-12">
      <Card className="w-full max-w-xl shadow-2xl rounded-3xl overflow-hidden border border-border">
        <div className="bg-primary px-6 py-8 text-white relative overflow-hidden flex flex-col items-center text-center">
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-secondary mb-1">Customer Experience Survey</p>
          <CardTitle className="text-2xl font-display font-bold">I-World Networks</CardTitle>
          <CardDescription className="text-white/70 text-xs mt-1">
            Department Rated: <span className="font-bold underline text-white">{getCategoryLabel(category)}</span>
          </CardDescription>
          {customer?.serviceDate && (
            <p className="text-white/80 text-[10px] mt-2">
              Experience date: <span className="font-bold">{formatLocalDate(customer.serviceDate, 'en-US')}</span>
            </p>
          )}
          <ShareFeedbackButtons
            url={shareUrl}
            customerName={customer?.customerName}
            subject={getCategoryLabel(category)}
            label="Share this survey"
            compact
            className="absolute top-3 right-3"
          />
        </div>

        <CardContent className="space-y-8 p-6 md:p-8">
          {customer && (
            <div className="rounded-2xl bg-muted/40 p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs border border-border/40">
              <div>
                <span className="text-muted-foreground block">Customer Name</span>
                <span className="font-semibold text-primary">{customer.customerName}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Location</span>
                <span className="font-semibold text-primary">{customer.location}</span>
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground block">Email</span>
                <span className="font-semibold text-primary truncate block max-w-[200px]">{customer.customerEmail}</span>
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground block">Plan</span>
                <span className="font-semibold text-primary">{customer.servicePlan || 'Enterprise'}</span>
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground block">Experience Date</span>
                <span className="font-semibold text-primary">{formatLocalDate(customer?.serviceDate)}</span>
              </div>
            </div>
          )}

          {/* 1. Overall Rating */}
          <div className="text-center space-y-4 border-b border-border/50 pb-6">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-mono">Overall Experience Rating</h3>
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

          {rating > 0 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {/* 2. Satisfaction Status */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-primary block uppercase tracking-wider font-mono">Satisfaction Status</label>
                <p className="text-xs text-muted-foreground">Are you satisfied with the resolution?</p>

                <div className="grid grid-cols-3 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setSatisfied('yes')}
                    className={cn(
                      'flex flex-col items-center gap-2 py-3 rounded-2xl border text-xs font-bold transition-all hover:scale-[1.02]',
                      satisfied === 'yes'
                        ? 'bg-green-500/10 border-green-500 text-green-600 dark:text-green-400 shadow-sm'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    <ThumbsUp className="w-5 h-5" />
                    Satisfied
                  </button>

                  <button
                    type="button"
                    onClick={() => setSatisfied('partially')}
                    className={cn(
                      'flex flex-col items-center gap-2 py-3 rounded-2xl border text-xs font-bold transition-all hover:scale-[1.02]',
                      satisfied === 'partially'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 shadow-sm'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    <Smile className="w-5 h-5" />
                    Partially
                  </button>

                  <button
                    type="button"
                    onClick={() => setSatisfied('no')}
                    className={cn(
                      'flex flex-col items-center gap-2 py-3 rounded-2xl border text-xs font-bold transition-all hover:scale-[1.02]',
                      satisfied === 'no'
                        ? 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400 shadow-sm'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted/40',
                    )}
                  >
                    <ThumbsDown className="w-5 h-5" />
                    Unsatisfied
                  </button>
                </div>
              </div>

              {/* 3. Invoice Accuracy (Billing only) */}
              {category === 'Billing' && (
                <div className="space-y-3 border-t border-border/50 pt-6">
                  <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-mono">Invoice Accuracy</h3>
                  <p className="text-xs text-muted-foreground">Was the invoice amount correct and clear?</p>
                  <div className="flex justify-center gap-3" onMouseLeave={() => setHoveredInvoiceAccuracy(0)}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className="transition-all duration-150 hover:scale-125 active:scale-90"
                        onClick={() => setInvoiceAccuracy(star)}
                        onMouseEnter={() => setHoveredInvoiceAccuracy(star)}
                        aria-label={`Invoice accuracy ${star} out of 5`}
                      >
                        <Star className={cn('h-8 w-8 transition-colors', invoiceStarColor(star))} />
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
              <div className="space-y-2 border-t border-border/50 pt-6">
                <label className="text-sm font-semibold text-primary block uppercase tracking-wider font-mono">Additional Comments</label>
                <Textarea
                  placeholder="Anything else you'd like to share?"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  className="rounded-xl border-border/70 focus-visible:ring-secondary focus-visible:border-secondary"
                />
                <p className="text-[10px] text-muted-foreground text-right">{comment.length} / 1000</p>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3 p-6 md:p-8 bg-muted/10 border-t border-border/50">
          <ShareFeedbackButtons url={shareUrl} customerName={customer?.customerName} subject={getCategoryLabel(category)} />
          <Button
            className="w-full py-6 rounded-full font-mono text-xs uppercase tracking-widest font-bold shadow-lg transition-all"
            size="lg"
            disabled={rating === 0 || (category === 'Billing' && invoiceAccuracy === 0) || pageState === 'submitting'}
            onClick={handleSubmit}
          >
            {pageState === 'submitting' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                Submitting...
              </>
            ) : (
              'Submit Feedback'
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground font-mono">I-World Networks &mdash; reliably connected</p>
        </CardFooter>
      </Card>
    </div>
  );
}
