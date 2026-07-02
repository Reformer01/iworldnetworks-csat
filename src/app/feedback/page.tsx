'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Star, Loader2, CheckCircle2, AlertCircle, ThumbsUp, ThumbsDown, Smile, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { mapSplynxEventToCategory, getCategoryLabel } from '@/lib/splynx-categories';

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

const categoryFields: Record<string, { key: string; label: string; description: string }[]> = {
  Reliability: [
    { key: 'stability', label: 'Stability', description: 'Consistency and reliability of connection' },
    { key: 'latency', label: 'Latency / Ping', description: 'Gaming, video calls and real-time responsiveness' },
    { key: 'peakPerformance', label: 'Peak Hours Performance', description: 'Quality during high-usage evening hours (7PM-11PM)' },
  ],
  Support: [
    { key: 'professionalism', label: 'Agent Conduct', description: 'Politeness and professionalism of the representative' },
    { key: 'clarity', label: 'Solution Clarity', description: 'How well the solution or issue was explained' },
    { key: 'responsiveness', label: 'Response Speed', description: 'How quickly your support request was addressed' },
    { key: 'knowledge', label: 'Agent Knowledge', description: 'Technical expertise of the agent' },
    { key: 'friendliness', label: 'Agent Friendliness', description: 'Friendliness and approachability of the support staff' },
  ],
  FieldSupport: [
    { key: 'resolutionSpeed', label: 'Resolution Speed', description: 'Speed of physical installation, fix or maintenance work' },
    { key: 'repairQuality', label: 'Service Quality', description: 'Neatness and quality of equipment and cabling' },
    { key: 'conduct', label: 'Technician Conduct', description: 'Politeness and professionalism of the field crew' },
  ],
  Installation: [
    { key: 'punctuality', label: 'Punctuality', description: 'Did the team arrive at the scheduled time?' },
    { key: 'quality', label: 'Installation Quality', description: 'Physical appearance, neatness and layout of installation' },
    { key: 'explanation', label: 'Technician Guide', description: 'Explanation of setup, router functionality and keys' },
    { key: 'timeliness', label: 'Installation Speed', description: 'Efficiency of setup from start to finish' },
  ],
  Billing: [
    { key: 'accuracy', label: 'Invoice Accuracy', description: 'Clarity and accuracy of bill or invoice amount' },
    { key: 'reconnection', label: 'Restoration Speed', description: 'How fast connection was restored after billing clearing' },
    { key: 'portalEase', label: 'Portal Ease of Use', description: 'Usability of the client dashboard or invoice checkout' },
  ],
};

const selectFields: Record<string, { key: string; label: string; description: string; options: string[] }[]> = {
  Support: [
    { key: 'fcr', label: 'First Contact Resolved', description: 'Was your query fully resolved on the first interaction?', options: ['Yes', 'No'] }
  ],
  Billing: [
    { key: 'usedPortal', label: 'Used Payment Portal', description: 'Did you use the customer billing portal to pay?', options: ['Yes', 'No'] }
  ]
};

export default function FeedbackPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [category, setCategory] = useState<string>('Reliability');
  
  // Rating states
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [satisfied, setSatisfied] = useState<'yes' | 'no' | 'partially' | undefined>(undefined);
  const [subRatings, setSubRatings] = useState<Record<string, any>>({});
  const [comment, setComment] = useState('');

  // Track hover state for sub-ratings
  const [hoveredSubRatings, setHoveredSubRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!token) {
      setErrorMessage('No feedback token provided.');
      setPageState('error');
      return;
    }

    async function validateToken() {
      try {
        const res = await fetch(`/api/feedback-token/validate?token=${encodeURIComponent(token!)}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          setErrorMessage(data.error || 'Invalid token.');
          setPageState('error');
          return;
        }

        setCustomer({
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          servicePlan: data.servicePlan,
          location: data.location,
          serviceDate: data.serviceDate,
          sourceEvent: data.sourceEvent,
        });

        // Compute the mapped category dynamically
        const mappedCat = mapSplynxEventToCategory(data.sourceEvent || '');
        setCategory(mappedCat);
        setPageState('form');
      } catch {
        setErrorMessage('Network error. Please check your connection.');
        setPageState('error');
      }
    }

    validateToken();
  }, [token]);

  async function handleSubmit() {
    if (rating === 0 || pageState === 'submitting') return;

    setPageState('submitting');
    try {
      const res = await fetch('/api/submit-splynx-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token, 
          rating, 
          satisfied,
          comment,
          ratings: subRatings 
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

  const subStarColor = (key: string, star: number) => {
    const val = subRatings[key] || 0;
    const hoverVal = hoveredSubRatings[key] || 0;
    if (star <= hoverVal) return 'text-secondary fill-secondary';
    if (hoverVal === 0 && star <= val) return 'text-secondary fill-secondary';
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
            <Skeleton className="h-4 w-4/6" />
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
              Your comprehensive feedback has been successfully recorded. We appreciate you helping us improve our services.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4 py-12">
      <Card className="w-full max-w-xl shadow-2xl rounded-3xl overflow-hidden border border-border">
        {/* Banner header */}
        <div className="bg-primary px-6 py-8 text-white relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 opacity-10">
            <Sparkles className="w-48 h-48" />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-secondary mb-1">
            Customer Experience Survey
          </p>
          <CardTitle className="text-2xl font-display font-bold">I-World Networks</CardTitle>
          <CardDescription className="text-white/70 text-xs mt-1">
            Department Rated: <span className="font-bold underline text-white">{getCategoryLabel(category)}</span>
          </CardDescription>
        </div>

        <CardContent className="space-y-8 p-6 md:p-8">
          {customer && (
            <div className="rounded-2xl bg-muted/40 p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs border border-border/40">
              <div>
                <span className="text-muted-foreground block">Customer Name</span>
                <span className="font-semibold text-primary">{customer.customerName}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Region</span>
                <span className="font-semibold text-primary">{customer.location}</span>
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground block">Email</span>
                <span className="font-semibold text-primary truncate block max-w-[200px]">{customer.customerEmail}</span>
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground block">Connectivity Plan</span>
                <span className="font-semibold text-primary">{customer.servicePlan || 'Enterprise'}</span>
              </div>
            </div>
          )}

          {/* 1. Overall Satisfaction Score */}
          <div className="text-center space-y-4 border-b border-border/50 pb-6">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-mono">
              1. Overall Experience Rating
            </h3>
            <div
              className="flex justify-center gap-3"
              onMouseLeave={() => setHoveredRating(0)}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="transition-all duration-150 hover:scale-125 active:scale-90"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  aria-label={`Rate ${star} out of 5`}
                >
                  <Star
                    className={cn(
                      'h-10 w-10 transition-colors',
                      starColor(star)
                    )}
                  />
                </button>
              ))}
            </div>
            {rating > 0 ? (
              <p className="text-sm font-bold text-amber-500 animate-pulse">
                {rating} / 5 — {RATING_LABELS[rating]}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Select a star rating to proceed</p>
            )}
          </div>

          {/* Show the rest of the form only when the overall rating has been set */}
          {rating > 0 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              {/* 2. Yes/No/Partially Satisfaction Question */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-primary block uppercase tracking-wider font-mono">
                  2. Overall Satisfaction Status
                </label>
                <p className="text-xs text-muted-foreground">Are you satisfied with the ticket / invoice resolution?</p>
                
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setSatisfied('yes')}
                    className={cn(
                      "flex flex-col items-center gap-2 py-3 rounded-2xl border text-xs font-bold transition-all hover:scale-[1.02]",
                      satisfied === 'yes'
                        ? "bg-green-500/10 border-green-500 text-green-600 dark:text-green-400 shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    <ThumbsUp className="w-5 h-5" />
                    Satisfied
                  </button>

                  <button
                    type="button"
                    onClick={() => setSatisfied('partially')}
                    className={cn(
                      "flex flex-col items-center gap-2 py-3 rounded-2xl border text-xs font-bold transition-all hover:scale-[1.02]",
                      satisfied === 'partially'
                        ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    <Smile className="w-5 h-5" />
                    Partially
                  </button>

                  <button
                    type="button"
                    onClick={() => setSatisfied('no')}
                    className={cn(
                      "flex flex-col items-center gap-2 py-3 rounded-2xl border text-xs font-bold transition-all hover:scale-[1.02]",
                      satisfied === 'no'
                        ? "bg-red-500/10 border-red-500 text-red-600 dark:text-red-400 shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    <ThumbsDown className="w-5 h-5" />
                    Unsatisfied
                  </button>
                </div>
              </div>

              {/* 3. Department-Specific Ratings */}
              {categoryFields[category] && (
                <div className="space-y-5 border-t border-border/50 pt-6">
                  <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-mono">
                    3. Detailed Department Ratings
                  </h3>
                  <div className="space-y-4">
                    {categoryFields[category].map((field) => (
                      <div key={field.key} className="flex items-center justify-between gap-4 p-3 rounded-xl hover:bg-muted/30 transition-colors border border-transparent hover:border-border/30">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-primary block">{field.label}</span>
                          <span className="text-[10px] text-muted-foreground leading-normal block">{field.description}</span>
                        </div>
                        <div 
                          className="flex gap-1"
                          onMouseLeave={() => setHoveredSubRatings(prev => ({ ...prev, [field.key]: 0 }))}
                        >
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setSubRatings(prev => ({ ...prev, [field.key]: star }))}
                              onMouseEnter={() => setHoveredSubRatings(prev => ({ ...prev, [field.key]: star }))}
                              className="transition-transform duration-100 hover:scale-110"
                            >
                              <Star className={cn("w-5 h-5", subStarColor(field.key, star))} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Select dropdown options if any */}
              {selectFields[category] && (
                <div className="space-y-4 border-t border-border/50 pt-6">
                  {selectFields[category].map((field) => (
                    <div key={field.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl hover:bg-muted/30 transition-colors border border-transparent">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-primary block">{field.label}</span>
                        <span className="text-[10px] text-muted-foreground block">{field.description}</span>
                      </div>
                      <div className="flex bg-muted/60 p-1 rounded-full border border-border self-start sm:self-auto">
                        {field.options.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSubRatings(prev => ({ ...prev, [field.key]: opt }))}
                            className={cn(
                              "px-5 py-1.5 rounded-full font-mono text-[9px] uppercase tracking-wider font-bold transition-all",
                              subRatings[field.key] === opt 
                                ? "bg-secondary text-white shadow-sm" 
                                : "text-muted-foreground hover:bg-muted"
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 5. Dynamic Comments Field */}
              <div className="space-y-2 border-t border-border/50 pt-6">
                <label className="text-sm font-semibold text-primary block uppercase tracking-wider font-mono">
                  4. Additional Comments
                </label>
                <Textarea
                  placeholder={
                    rating >= 4 
                      ? "Thank you for the high rating! Let us know if there is anything else you would like to share..." 
                      : "We are committed to resolving your concerns. Please share details on what went wrong and how we can improve..."
                  }
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  className="rounded-xl border-border/70 focus-visible:ring-secondary focus-visible:border-secondary"
                />
                <p className="text-[10px] text-muted-foreground text-right">
                  {comment.length} / 1000 characters
                </p>
              </div>

            </div>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3 p-6 md:p-8 bg-muted/10 border-t border-border/50">
          <Button
            className="w-full py-6 rounded-full font-mono text-xs uppercase tracking-widest font-bold shadow-lg transition-all"
            size="lg"
            disabled={rating === 0 || pageState === 'submitting'}
            onClick={handleSubmit}
          >
            {pageState === 'submitting' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                Submitting Telemetry...
              </>
            ) : (
              'Submit Feedback'
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground font-mono">
            I-World Networks — reliably connected
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
