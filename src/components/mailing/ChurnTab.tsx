'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import { cn } from '@/lib/utils';
import { Loader2, MailQuestion, MessageSquareWarning, UserX, TrendingDown, Star } from 'lucide-react';
import { CHURN_REASONS } from '@/lib/churn-reasons';
import type { User } from 'firebase/auth';

interface ChurnResponse {
  token: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  rating: number | null;
  reason: string | null;
  comment: string;
  sentAt: number | null;
  submittedAt: number | null;
  clientIp: string;
}

interface ChurnSummary {
  totalSent: number;
  responded: number;
  responseRate: number;
  avgRating: number | null;
  ratingDistribution: Record<number, number>;
  reasonBreakdown: Record<string, number>;
}

const RATING_LABELS = ['', 'Very Unsatisfied', 'Unsatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'];

function fmtDate(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  return new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ChurnTab() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<ChurnSummary | null>(null);
  const [responses, setResponses] = useState<ChurnResponse[]>([]);

  const fetchChurn = useCallback(
    async (user: User) => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/churn', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed to load churn surveys');
        const data = await res.json();
        setSummary(data.summary as ChurnSummary);
        setResponses((data.responses as ChurnResponse[]) || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (user) fetchChurn(user);
  }, [user, fetchChurn]);

  const maxReasonCount = summary ? Math.max(1, ...CHURN_REASONS.map((r) => summary.reasonBreakdown[r] || 0)) : 1;

  return (
    <>
      <div className="mb-12">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">Churn Surveys</h1>
        <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
          Why customers leave — responses to the exit survey sent when a subscriber is marked inactive or disabled. Every response is
          evidence, so nothing here is editable.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-secondary" />
        </div>
      )}

      {error && !loading && (
        <div className="bg-destructive/5 border border-destructive/20 text-destructive rounded-2xl p-8 text-center font-bold">
          {error}
        </div>
      )}

      {!loading && !error && summary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
            {[
              { label: 'Surveys Sent', value: summary.totalSent.toLocaleString(), icon: MailQuestion, color: 'text-secondary' },
              { label: 'Responses', value: summary.responded.toLocaleString(), icon: MessageSquareWarning, color: 'text-secondary' },
              { label: 'Response Rate', value: `${summary.responseRate}%`, icon: UserX, color: 'text-secondary' },
              {
                label: 'Avg Rating',
                value: summary.avgRating !== null ? `${summary.avgRating} / 5` : '—',
                icon: Star,
                color: 'text-amber-500',
              },
            ].map((card) => (
              <div key={card.label} className="bg-white p-8 rounded-2xl whisper-shadow border border-border">
                <div className="flex items-center justify-between mb-6">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">{card.label}</span>
                  <card.icon className={cn('w-5 h-5', card.color)} />
                </div>
                <div className="text-3xl font-black text-primary">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            {/* Reason breakdown */}
            <div className="bg-white p-8 rounded-2xl whisper-shadow border border-border">
              <div className="flex items-center gap-3 mb-8">
                <TrendingDown className="w-5 h-5 text-destructive" />
                <h3 className="font-display font-bold text-lg uppercase tracking-tight">Why Customers Left</h3>
              </div>
              <div className="space-y-5">
                {CHURN_REASONS.map((reason) => {
                  const count = summary.reasonBreakdown[reason] || 0;
                  const percent = summary.responded > 0 ? Math.round((count / summary.responded) * 100) : 0;
                  return (
                    <div key={reason} className="space-y-2">
                      <div className="flex justify-between font-mono text-[10px] font-bold uppercase">
                        <span>{reason}</span>
                        <span className="text-on-surface-variant">
                          {count} {count === 1 ? 'response' : 'responses'} · {percent}%
                        </span>
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-destructive h-full rounded-full"
                          style={{ width: `${(count / maxReasonCount) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rating distribution */}
            <div className="bg-white p-8 rounded-2xl whisper-shadow border border-border">
              <div className="flex items-center gap-3 mb-8">
                <Star className="w-5 h-5 text-amber-500" />
                <h3 className="font-display font-bold text-lg uppercase tracking-tight">Experience Rating</h3>
              </div>
              <div className="space-y-5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = summary.ratingDistribution[star] || 0;
                  const percent = summary.responded > 0 ? Math.round((count / summary.responded) * 100) : 0;
                  return (
                    <div key={star} className="space-y-2">
                      <div className="flex justify-between font-mono text-[10px] font-bold uppercase">
                        <span className="flex items-center gap-1">
                          {star} <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> — {RATING_LABELS[star]}
                        </span>
                        <span className="text-on-surface-variant">{count} · {percent}%</span>
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-400 h-full rounded-full" style={{ width: `${percent}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Response log */}
          <div className="bg-white rounded-2xl whisper-shadow border border-border p-8 mb-12">
            <div className="flex items-center gap-3 mb-8">
              <MessageSquareWarning className="w-5 h-5 text-secondary" />
              <h3 className="font-display font-bold text-lg uppercase tracking-tight">Response Log</h3>
              <span className="ml-auto font-mono text-[10px] text-on-surface-variant uppercase font-bold">{responses.length} responses</span>
            </div>
            {responses.length === 0 ? (
              <p className="text-on-surface-variant text-center py-12">No responses yet. Surveys are sent automatically when a customer churns.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                      <th className="pb-4">Customer</th>
                      <th className="pb-4">Rating</th>
                      <th className="pb-4">Reason</th>
                      <th className="pb-4">Comment</th>
                      <th className="pb-4 text-right">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responses.map((r) => (
                      <tr key={r.token} className="border-b border-border/50 align-top">
                        <td className="py-4 pr-4">
                          <div className="font-bold text-sm">{r.customerName || '—'}</div>
                          {r.customerEmail && <div className="font-mono text-[10px] text-on-surface-variant">{r.customerEmail}</div>}
                        </td>
                        <td className="py-4 pr-4 whitespace-nowrap">
                          {r.rating ? (
                            <span className="flex items-center gap-1 font-bold text-sm">
                              {r.rating} <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          {r.reason ? (
                            <span className="inline-block bg-destructive/5 text-destructive px-3 py-1 rounded-full font-mono text-[10px] uppercase font-bold whitespace-nowrap">
                              {r.reason}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-4 pr-4 text-sm max-w-xs">{r.comment || '—'}</td>
                        <td className="py-4 text-right font-mono text-[10px] text-on-surface-variant whitespace-nowrap">
                          {fmtDate(r.submittedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}