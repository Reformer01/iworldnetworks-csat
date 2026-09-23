'use client';

import React, { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Search, UsersRound, AlertTriangle, MessageSquare, Star, Activity } from 'lucide-react';
import { useAdminFeedbacks } from '@/hooks/use-admin-feedbacks';
import { cn } from '@/lib/utils';
import { staffRoster, type FeedbackCategory, type StaffProfile } from '@/lib/staff';
import FeedbackQuote from '@/components/FeedbackQuote';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/ui/chart-card';
import { TrendAreaChart } from '@/components/charts/trend-area-chart';
import { EmptyState } from '@/components/ui/empty-state';

import type { JsonValue } from '@/lib/feedback-types';

type FeedbackRecord = {
  id: string;
  staffName?: string;
  category?: FeedbackCategory;
  customerName?: string;
  location?: string;
  comment?: string;
  status?: string;
  timestamp?: number;
  serviceDate?: string;
  ratings?: Record<string, JsonValue>;
};

type RatingDimension = {
  key: string;
  label: string;
};

const CATEGORY_DIMENSIONS: Partial<Record<FeedbackCategory, RatingDimension[]>> = {
  Support: [
    { key: 'professionalism', label: 'Helpfulness' },
    { key: 'clarity', label: 'Clarity' },
    { key: 'responsiveness', label: 'Response Speed' },
    { key: 'knowledge', label: 'Agent Knowledge' },
    { key: 'friendliness', label: 'Friendliness' },
  ],
  Billing: [
    { key: 'accuracy', label: 'Billing Accuracy' },
    { key: 'reconnection', label: 'Internet Restoration' },
    { key: 'portalEase', label: 'Portal Ease' },
  ],
  FieldSupport: [
    { key: 'resolutionSpeed', label: 'Resolution Speed' },
    { key: 'repairQuality', label: 'Repair Quality' },
    { key: 'conduct', label: 'Technician Conduct' },
  ],
  Installation: [
    { key: 'punctuality', label: 'Punctuality' },
    { key: 'quality', label: 'Installation Quality' },
    { key: 'explanation', label: 'Orientation' },
    { key: 'timeliness', label: 'Installation Speed' },
  ],
};

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function getDimensions(staff: StaffProfile) {
  const dimensions = staff.categories.flatMap((category) => CATEGORY_DIMENSIONS[category] || []);
  return Array.from(new Map(dimensions.map((dimension) => [dimension.key, dimension])).values());
}

function getNumericRatings(feedback: FeedbackRecord, dimensions: RatingDimension[]) {
  const keys = dimensions.map((dimension) => dimension.key);
  return Object.entries(feedback.ratings || {})
    .filter(([key, value]) => keys.includes(key) && typeof value === 'number' && Number.isFinite(value))
    .map(([, value]) => value as number);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDate(timestamp?: number, fallback?: string) {
  if (timestamp) return new Date(timestamp).toLocaleDateString();
  return fallback || 'No date';
}

export default function StaffPerformancePage() {
  const [search, setSearch] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState(staffRoster[0]?.id || '');
  const { feedbacks, loading } = useAdminFeedbacks();

  const staffAnalytics = useMemo(() => {
    const feedbackList = (feedbacks || []) as FeedbackRecord[];

    return staffRoster
      .map((staff) => {
        const dimensions = getDimensions(staff);
        const staffFeedbacks = feedbackList
          .filter((feedback) => feedback.staffName === staff.name && staff.categories.includes(feedback.category as FeedbackCategory))
          .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));

        const ratingValues = staffFeedbacks.flatMap((feedback) => getNumericRatings(feedback, dimensions));
        const avgRating = average(ratingValues);
        const resolvedCount = staffFeedbacks.filter((feedback) => feedback.status === 'resolved').length;
        const resolvedRate = staffFeedbacks.length > 0 ? Math.round((resolvedCount / staffFeedbacks.length) * 100) : 0;

        const competency = dimensions.map((dimension) => {
          const values = staffFeedbacks
            .map((feedback) => feedback.ratings?.[dimension.key])
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

          return {
            ...dimension,
            score: average(values),
          };
        });

        const trend = staffFeedbacks
          .slice(0, 8)
          .reverse()
          .map((feedback) => {
            const values = getNumericRatings(feedback, dimensions);
            return {
              date: formatDate(feedback.timestamp, feedback.serviceDate),
              score: Number(average(values).toFixed(2)),
            };
          });

        return {
          staff,
          feedbacks: staffFeedbacks,
          avgRating,
          feedbackCount: staffFeedbacks.length,
          resolvedRate,
          competency,
          trend,
          lastActivity: staffFeedbacks[0]?.timestamp,
        };
      })
      .sort((a, b) => b.feedbackCount - a.feedbackCount || b.avgRating - a.avgRating || a.staff.name.localeCompare(b.staff.name));
  }, [feedbacks]);

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return staffAnalytics;

    return staffAnalytics.filter(({ staff }) => {
      const haystack = [staff.name, staff.role, staff.department, staff.region, staff.id].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [search, staffAnalytics]);

  const selectedStaff = staffAnalytics.find((item) => item.staff.id === selectedStaffId) || filteredStaff[0] || staffAnalytics[0];

  const overallStats = useMemo(() => {
    const totalFeedback = staffAnalytics.reduce((sum, item) => sum + item.feedbackCount, 0);
    const activeStaff = staffAnalytics.filter((item) => item.feedbackCount > 0).length;
    const ratedStaff = staffAnalytics.filter((item) => item.avgRating > 0);
    const avgRating = average(ratedStaff.map((item) => item.avgRating));

    return {
      totalStaff: staffAnalytics.length,
      activeStaff,
      totalFeedback,
      avgRating,
    };
  }, [staffAnalytics]);

  /** Daily average satisfaction across all staff-linked feedback. */
  const satisfactionTrend = useMemo(() => {
    const feedbackList = (feedbacks || []) as FeedbackRecord[];
    if (feedbackList.length === 0) return [];

    const groups: Record<string, { total: number; count: number }> = {};
    for (const f of feedbackList) {
      if (!f.staffName) continue;
      const date = new Date(f.timestamp ?? 0);
      const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const values = Object.values(f.ratings || {}).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (values.length === 0) continue;
      const pct = Math.round((values.reduce((s, v) => s + v, 0) / (values.length * 5)) * 100);
      if (!groups[label]) groups[label] = { total: 0, count: 0 };
      groups[label].total += pct;
      groups[label].count += 1;
    }

    return Object.entries(groups)
      .map(([name, d]) => ({ name, satisfaction: Math.round(d.total / d.count) }))
      .reverse();
  }, [feedbacks]);

  return (
    <AdminLayout>
      <div className="space-y-6 pb-24">
        <PageHeader
          eyebrow="Staff Intelligence"
          title="Staff Performance"
          description="Search agents, technicians, and billing staff, then review the feedback tied directly to each person."
        />

        <StatCardGrid columns={4}>
          <StatCard label="Total Staff" value={overallStats.totalStaff} icon={UsersRound} detail="In roster" />
          <StatCard label="Active" value={overallStats.activeStaff} icon={Activity} detail="With feedback" />
          <StatCard label="Feedback" value={overallStats.totalFeedback} icon={MessageSquare} detail="Total entries" />
          <StatCard
            label="Avg Rating"
            value={overallStats.avgRating > 0 ? overallStats.avgRating.toFixed(1) : '0.0'}
            icon={Star}
            detail="Across active staff"
          />
        </StatCardGrid>

        {/* Satisfaction trend — full width */}
        <ChartCard
          title="Satisfaction over time"
          description="Daily average score across all staff-linked feedback."
          legend={[
            {
              label: 'Satisfaction',
              color: 'var(--chart-1)',
              value: `${overallStats.avgRating > 0 ? Math.round((overallStats.avgRating / 5) * 100) : 0}%`,
            },
          ]}
          footer={`${overallStats.totalFeedback} total responses`}
          loading={loading}
        >
          {satisfactionTrend.length === 0 ? (
            <EmptyState
              title="No feedback yet"
              description="Staff satisfaction data will appear here once feedback is submitted."
              className="border-0"
            />
          ) : (
            <TrendAreaChart
              data={satisfactionTrend}
              xKey="name"
              height={280}
              yDomain={[0, 100]}
              yTickFormatter={(v) => `${v}%`}
              valueFormatter={(v) => `${v}%`}
              series={[{ key: 'satisfaction', label: 'Satisfaction', color: 'var(--chart-1)' }]}
            />
          )}
        </ChartCard>

        <div className="grid grid-cols-12 gap-4 items-start">
          <section className="col-span-12 xl:col-span-7 space-y-4">
            <div className="relative max-w-xl group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                className="w-full bg-card border border-border rounded-xl py-3 pl-12 pr-4 outline-none focus:ring-2 focus:ring-ring transition-all text-sm font-medium"
                placeholder="Search by name, role, department, region or ID..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredStaff.map((item) => {
                const isSelected = selectedStaff?.staff.id === item.staff.id;
                const initials = getInitials(item.staff.name);
                const tags = [
                  item.feedbackCount === 0 ? 'No feedback yet' : null,
                  item.avgRating >= 4.5 ? 'Top Performer' : null,
                  item.avgRating > 0 && item.avgRating < 3 ? 'Needs Review' : null,
                  item.resolvedRate >= 80 && item.feedbackCount > 0 ? 'Strong Closure' : null,
                ].filter(Boolean);

                return (
                  <button
                    key={item.staff.id}
                    type="button"
                    onClick={() => setSelectedStaffId(item.staff.id)}
                    className={cn(
                      'text-left bg-card p-5 rounded-xl border shadow-sm transition-all hover:-translate-y-0.5 hover:border-ring/50',
                      isSelected ? 'border-ring ring-2 ring-ring/10' : 'border-border',
                    )}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={cn(
                          'size-11 rounded-full border flex items-center justify-center font-mono font-bold text-sm',
                          isSelected
                            ? 'bg-secondary text-secondary-foreground border-secondary'
                            : 'bg-muted text-muted-foreground border-border',
                        )}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{item.staff.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.staff.role} {item.staff.region ? `| ${item.staff.region}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-between items-end gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Avg Rating</p>
                        <p
                          className={cn(
                            'font-headline text-2xl font-semibold leading-none tabular-nums',
                            isSelected ? 'text-secondary' : 'text-foreground',
                          )}
                        >
                          {item.avgRating > 0 ? item.avgRating.toFixed(2) : '0.00'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Feedback</p>
                        <p className="text-sm font-medium text-foreground">{item.feedbackCount} entries</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/60 flex gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 bg-muted rounded-full text-[10px] text-muted-foreground uppercase font-medium">
                        {item.staff.department}
                      </span>
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className={cn(
                            'px-2.5 py-0.5 rounded-full text-[10px] uppercase font-medium',
                            tag === 'Top Performer'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : tag === 'Needs Review'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                                : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}

              {loading && (
                <div className="col-span-full bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground animate-pulse">
                  Loading staff feedback...
                </div>
              )}

              {!loading && filteredStaff.length === 0 && (
                <div className="col-span-full bg-card border border-border rounded-xl p-8 text-center">
                  <AlertTriangle className="size-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">No staff found matching that search</p>
                </div>
              )}
            </div>
          </section>

          <aside className="col-span-12 xl:col-span-5">
            {selectedStaff && (
              <div className="sticky top-28 space-y-4">
                {/* Staff overview */}
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mb-1">Selected Staff</p>
                      <h2 className="font-headline text-lg font-semibold tracking-tight text-foreground">{selectedStaff.staff.name}</h2>
                      <p className="text-xs text-muted-foreground">{selectedStaff.staff.role}</p>
                    </div>
                    <span className="px-2.5 py-0.5 bg-muted rounded-full text-[10px] text-muted-foreground uppercase font-medium">
                      {selectedStaff.staff.department}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Avg</p>
                      <p className="font-headline text-xl font-semibold tabular-nums">
                        {selectedStaff.avgRating > 0 ? selectedStaff.avgRating.toFixed(1) : '0.0'}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Entries</p>
                      <p className="font-headline text-xl font-semibold tabular-nums">{selectedStaff.feedbackCount}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Resolved</p>
                      <p className="font-headline text-xl font-semibold tabular-nums">{selectedStaff.resolvedRate}%</p>
                    </div>
                  </div>
                </div>

                {/* Performance trend chart */}
                <ChartCard title="Performance Trend" description="Average rating over recent feedback">
                  {selectedStaff.trend.length === 0 ? (
                    <EmptyState title="No trend data" description="No feedback entries for this staff member yet." className="border-0" />
                  ) : (
                    <TrendAreaChart
                      data={selectedStaff.trend}
                      xKey="date"
                      height={200}
                      yDomain={[0, 5]}
                      yTickFormatter={(v) => v.toFixed(0)}
                      valueFormatter={(v) => `${v.toFixed(1)}/5`}
                      series={[{ key: 'score', label: 'Avg Score', color: 'var(--chart-1)' }]}
                    />
                  )}
                </ChartCard>

                {/* Competency breakdown */}
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Competency Breakdown</p>
                  </div>
                  <div className="space-y-3">
                    {selectedStaff.competency.map((dimension) => {
                      const width = Math.min(100, Math.round((dimension.score / 5) * 100));
                      return (
                        <div key={dimension.key}>
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="font-medium text-foreground">{dimension.label}</span>
                            <span className="font-medium text-muted-foreground tabular-nums">
                              {dimension.score > 0 ? dimension.score.toFixed(1) : '0.0'}
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-secondary rounded-full transition-all" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent feedback */}
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Feedback</p>
                    <MessageSquare className="size-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {selectedStaff.feedbacks.slice(0, 8).map((feedback) => {
                      const score = average(getNumericRatings(feedback, getDimensions(selectedStaff.staff)));

                      return (
                        <div key={feedback.id} className="bg-muted/40 p-4 rounded-lg">
                          <div className="flex justify-between items-start gap-3 mb-2">
                            <div>
                              <p className="font-medium text-sm text-foreground">{feedback.customerName || 'Customer'}</p>
                              <p className="text-[10px] text-muted-foreground uppercase">
                                {feedback.category} | {feedback.location || 'Unknown region'}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] uppercase font-medium',
                                feedback.status === 'resolved'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                  : feedback.status === 'open'
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                                    : 'bg-muted text-muted-foreground',
                              )}
                            >
                              {feedback.status || 'open'}
                            </span>
                          </div>
                          <FeedbackQuote feedback={feedback} className="text-xs text-muted-foreground leading-relaxed" />
                          <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                            <span>{formatDate(feedback.timestamp, feedback.serviceDate)}</span>
                            <span className="tabular-nums">Rating: {score > 0 ? score.toFixed(1) : '0.0'}/5</span>
                          </div>
                        </div>
                      );
                    })}

                    {selectedStaff.feedbacks.length === 0 && (
                      <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                        <AlertTriangle className="size-5 text-muted-foreground mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground font-medium">No feedback tied to this staff member yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AdminLayout>
  );
}
