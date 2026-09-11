'use client';

import React, { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Activity, Calendar, Star, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks } from '@/hooks/use-admin-feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { averageRating } from '@/lib/feedback-ratings';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '@/hooks/use-toast';

const REGIONS = ['Ibadan', 'Abeokuta', 'Akure', 'Osogbo'];

function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

function ratingBand(rating: number | undefined | null): { label: string; className: string } {
  if (!rating || rating <= 0) return { label: 'N/A', className: 'bg-gray-100 text-gray-600' };
  if (rating >= 4) return { label: 'OK', className: 'bg-green-100 text-green-700' };
  if (rating === 3) return { label: 'WATCH', className: 'bg-orange-100 text-orange-700' };
  return { label: 'POOR', className: 'bg-red-100 text-red-700' };
}

export default function AdminStability() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const { feedbacks: allFeedbacks, loading: dataLoading } = useAdminFeedbacks();

  // Reliability feedback only — everything on this page is derived from
  // these real customer reports (no invented network telemetry).
  const feedbacks = useMemo(() => {
    return (allFeedbacks || []).filter((f: FeedbackDoc) => f.category === 'Reliability');
  }, [allFeedbacks]);

  const metrics = useMemo(() => {
    const { average: avgStability, count: ratedCount } = averageRating(feedbacks, ['stability']);
    const reliable = feedbacks.filter((f) => Number(f.ratings?.stability) >= 4).length;
    const poor = feedbacks.filter((f) => Number(f.ratings?.stability) <= 2).length;
    return {
      avgStability,
      ratedCount,
      reliable,
      poor,
      reliableRate: ratedCount > 0 ? Math.round((reliable / ratedCount) * 100) : 0,
    };
  }, [feedbacks]);

  const chartData = useMemo(() => {
    return feedbacks
      .slice(0, 30)
      .reverse()
      .map((f: FeedbackDoc) => ({
        date: new Date(f.timestamp ?? 0).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        time: new Date(f.timestamp ?? 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        stability: Number(f.ratings?.stability || 0) > 0 ? Number(f.ratings?.stability) : null,
        name: f.customerName || f.location || '',
      }));
  }, [feedbacks]);

  const nodeHealth = useMemo(() => {
    return REGIONS.map((region) => {
      const regionData = feedbacks.filter((f: FeedbackDoc) => f.location === region);
      const { average: avg, count } = averageRating(regionData, ['stability']);
      return {
        name: region,
        count,
        avg,
        status: count === 0 ? 'NO DATA' : avg >= 4.5 ? 'EXCELLENT' : avg >= 3.5 ? 'STABLE' : avg >= 2.5 ? 'UNSTABLE' : 'CRITICAL',
      };
    });
  }, [feedbacks]);

  const logRows = useMemo(() => {
    return [...feedbacks]
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, 12);
  }, [feedbacks]);

  const handleExport = async () => {
    if (!user || logRows.length === 0) return;
    setExporting(true);
    try {
      const header = ['Date & Time', 'Customer', 'Location', 'Stability Rating', 'Status', 'Comment'];
      const rows = logRows.map((f: FeedbackDoc) => {
        const rating = Number(f.ratings?.stability || 0) || '';
        return [
          fmtDateTime(f.timestamp ?? 0),
          f.customerName || '',
          f.location || '',
          rating,
          ratingBand(Number(rating)).label,
          (f.comment || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""'),
        ];
      });
      const csv = [header.join(','), ...rows.map((r) => r.map((v) => (String(v).includes(',') ? `"${v}"` : v)).join(','))].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stability-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export ready', description: 'CSV downloaded.' });
    } catch {
      toast({ variant: 'destructive', title: 'Export failed', description: 'Could not generate the CSV.' });
    } finally {
      setExporting(false);
    }
  };

  const regionStatusClasses: Record<string, string> = {
    EXCELLENT: 'bg-green-50 text-green-600 border-green-200',
    STABLE: 'bg-blue-50 text-blue-600 border-blue-200',
    UNSTABLE: 'bg-orange-50 text-orange-600 border-orange-200',
    CRITICAL: 'bg-red-50 text-red-600 border-red-200',
    'NO DATA': 'bg-gray-100 text-gray-500 border-gray-200',
  };

  return (
    <AdminLayout>
      <div className="max-w-container-max mx-auto">
        <header className="grid grid-cols-12 gap-gutter mb-16 items-end">
          <div className="col-span-12 md:col-span-7">
            <h2 className="font-display text-2xl md:text-2xl text-primary tracking-tight font-bold uppercase">
              Internet Quality
            </h2>
            <div className="flex items-center gap-2 mt-2 text-on-surface-variant font-mono text-[10px] font-bold uppercase tracking-widest">
              <Calendar className="w-3 h-3 text-secondary" /> Performance from customer reliability reports
            </div>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-gutter mb-16 items-start">
          <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl">
            <p className="font-mono text-[10px] text-on-surface-variant mb-2 uppercase font-bold tracking-widest">Avg Stability Rating</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[56px] leading-none font-bold text-primary">{metrics.avgStability.toFixed(1)}</span>
              <span className="font-display text-[24px] text-on-surface-variant font-bold">/ 5</span>
            </div>
            <p className="font-mono text-[10px] text-on-surface-variant mt-6 font-bold uppercase opacity-60">
              From {metrics.ratedCount} rated {metrics.ratedCount === 1 ? 'report' : 'reports'}
            </p>
            <div className="mt-4 h-1 w-full bg-surface-container rounded-full overflow-hidden">
              <div className="h-full bg-secondary transition-all duration-1000" style={{ width: `${(metrics.avgStability / 5) * 100}%` }}></div>
            </div>
          </div>

          <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl md:mt-8">
            <p className="font-mono text-[10px] text-on-surface-variant mb-2 uppercase font-bold tracking-widest">Reliable Reports</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[56px] leading-none font-bold text-primary">{metrics.reliableRate}</span>
              <span className="font-display text-[24px] text-on-surface-variant font-bold">%</span>
            </div>
            <p className="font-mono text-[10px] text-secondary mt-6 flex items-center gap-1 font-bold uppercase">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> Rated 4–5 out of {metrics.ratedCount} reports
            </p>
          </div>

          <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl">
            <p className="font-mono text-[10px] text-on-surface-variant mb-2 uppercase font-bold tracking-widest">Poor Reports</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[56px] leading-none font-bold text-primary">{metrics.poor}</span>
              <span className="font-display text-[24px] text-on-surface-variant font-bold">reports</span>
            </div>
            <p className="font-mono text-[10px] text-on-surface-variant mt-6 font-bold uppercase opacity-60">Rated 1–2 — need follow-up</p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-gutter mb-16">
          <div className="col-span-12 lg:col-span-8 bg-white p-8 border border-border whisper-shadow rounded-xl h-[450px] flex flex-col">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h3 className="font-display text-xl text-primary font-bold uppercase">Stability Trend</h3>
                <p className="font-mono text-[10px] text-on-surface-variant uppercase font-bold opacity-60">Stability rating per report (1–5)</p>
              </div>
            </div>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorStab" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#448515" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#448515" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666', fontWeight: 'bold' }} />
                  <YAxis
                    domain={[0, 5]}
                    ticks={[0, 1, 2, 3, 4, 5]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#666', fontWeight: 'bold' }}
                  />
                  <Tooltip
                    labelFormatter={(label) => `Date: ${label}`}
                    formatter={(value, name) => [`${value}/5`, String(name)]}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="stability"
                    stroke="#448515"
                    fill="url(#colorStab)"
                    strokeWidth={3}
                    name="Stability Score"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-gutter">
            <div className="bg-white p-8 border border-border whisper-shadow rounded-xl flex-1">
              <h3 className="font-display text-xl text-primary mb-8 font-bold uppercase tracking-tight">Regional Performance</h3>
              <div className="space-y-8">
                {nodeHealth.map((node) => (
                  <div key={node.name} className="flex items-center justify-between border-b border-border/50 pb-4 last:border-0 last:pb-0">
                    <div>
                      <p className="font-bold text-primary uppercase text-sm">{node.name}</p>
                      <p className="font-mono text-[8px] text-on-surface-variant font-bold tracking-widest">
                        {node.count > 0 ? `${node.count} rated · Avg ${node.avg.toFixed(1)}/5` : 'No ratings yet'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={cn(
                          'px-3 py-1 text-[10px] font-bold font-mono rounded-full border uppercase tracking-widest',
                          regionStatusClasses[node.status],
                        )}
                      >
                        {node.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-primary p-8 rounded-xl whisper-shadow flex items-center justify-between group overflow-hidden relative">
              <div className="relative z-10">
                <p className="text-white/60 font-mono text-[10px] uppercase font-bold mb-2">Reliability Reports</p>
                <h4 className="text-white font-display text-lg font-bold uppercase">
                  {feedbacks.length} total · {REGIONS.filter((r) => nodeHealth.some((n) => n.name === r && n.count > 0)).length} regions active
                </h4>
              </div>
              <Activity className="w-12 h-12 text-white/20 group-hover:text-secondary transition-colors duration-500 relative z-10" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-gutter mb-24">
          <div className="col-span-12 bg-white border border-border whisper-shadow rounded-xl p-10">
            <div className="flex justify-between items-end mb-10 border-b border-border pb-6">
              <div>
                <h3 className="font-display text-2xl text-primary font-bold uppercase tracking-tight">Reliability Report Log</h3>
                <p className="font-mono text-[10px] text-on-surface-variant uppercase font-bold mt-1">
                  Latest customer reports — rating and status come from the customer&apos;s own scores
                </p>
              </div>
              <button
                onClick={handleExport}
                disabled={exporting || logRows.length === 0}
                className="font-mono text-[10px] text-secondary border-b border-secondary pb-1 font-bold uppercase tracking-widest flex items-center gap-1 disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Export Data
              </button>
            </div>
            <div className="space-y-4 font-mono text-[12px]">
              <div className="grid grid-cols-12 gap-4 text-on-surface-variant/40 font-bold uppercase tracking-widest pb-2">
                <span className="col-span-3">Date & Time</span>
                <span className="col-span-3">Customer</span>
                <span className="col-span-2">Rating</span>
                <span className="col-span-3">Description</span>
                <span className="col-span-1 text-right">Status</span>
              </div>
              {logRows.map((f: FeedbackDoc) => {
                const stability = Number(f.ratings?.stability || 0);
                const band = ratingBand(stability);
                return (
                  <div
                    key={f.id}
                    className="grid grid-cols-12 gap-4 py-4 border-b border-surface-container border-dashed last:border-0 items-center"
                  >
                    <span className="col-span-3 text-primary font-bold">{fmtDateTime(f.timestamp ?? 0)}</span>
                    <span className="col-span-3 text-on-surface-variant truncate pr-4">
                      <span className="text-primary font-bold">{f.customerName || '—'}</span>
                      {f.location ? <span className="text-on-surface-variant/60"> · {f.location}</span> : null}
                    </span>
                    <span className="col-span-2 flex items-center gap-1 font-black">
                      {stability > 0 ? (
                        <>
                          {stability}
                          <Star
                            className={cn(
                              'w-3.5 h-3.5',
                              stability >= 4 ? 'text-amber-400 fill-amber-400' : stability === 3 ? 'text-orange-400 fill-orange-400' : 'text-red-400 fill-red-400',
                            )}
                          />
                          <span className="text-[10px] font-bold text-on-surface-variant">/5</span>
                        </>
                      ) : (
                        <span className="text-on-surface-variant/40">—</span>
                      )}
                    </span>
                    <span className="col-span-3 text-on-surface-variant truncate pr-4">
                      {f.comment || `Reported from ${f.location || 'unknown location'}.`}
                    </span>
                    <span className="col-span-1 text-right">
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-black', band.className)}>{band.label}</span>
                    </span>
                  </div>
                );
              })}
              {logRows.length === 0 && !dataLoading && (
                <div className="py-12 text-center text-on-surface-variant/40 font-bold uppercase">
                  No reliability reports yet — they will appear here as customers submit them.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
