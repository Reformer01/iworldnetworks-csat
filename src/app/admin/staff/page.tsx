'use client';

import React, { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Search, UsersRound, AlertTriangle, MessageSquare, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAdminFeedbacks } from '@/hooks/use-admin-feedbacks';
import { cn } from '@/lib/utils';
import { staffRoster, type FeedbackCategory, type StaffProfile } from '@/lib/staff';

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
  ratings?: Record<string, number | string | undefined>;
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
  const { feedbacks } = useAdminFeedbacks();

  const staffAnalytics = useMemo(() => {
    const feedbackList = (feedbacks || []) as FeedbackRecord[];

    return staffRoster.map((staff) => {
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
    }).sort((a, b) => b.feedbackCount - a.feedbackCount || b.avgRating - a.avgRating || a.staff.name.localeCompare(b.staff.name));
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

  return (
    <AdminLayout>
      <div className="max-w-container-max mx-auto pb-24">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <UsersRound className="w-4 h-4 text-secondary" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Staff Intelligence</span>
            </div>
            <h1 className="font-display text-3xl md:text-display-lg text-primary tracking-tight font-black uppercase">
              Staff Performance
            </h1>
            <p className="text-on-surface-variant mt-3 max-w-2xl text-sm">
              Search agents, technicians, and billing staff, then review the feedback tied directly to each person.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            {[
              { label: 'Staff', value: overallStats.totalStaff },
              { label: 'Active', value: overallStats.activeStaff },
              { label: 'Feedback', value: overallStats.totalFeedback },
              { label: 'Avg', value: overallStats.avgRating > 0 ? overallStats.avgRating.toFixed(1) : '0.0' },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-border rounded-xl p-4 min-w-[120px]">
                <p className="font-mono text-[9px] uppercase text-on-surface-variant font-bold">{item.label}</p>
                <p className="font-mono text-2xl font-black text-primary mt-1">{item.value}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-12 gap-gutter items-start">
          <section className="col-span-12 xl:col-span-7">
            <div className="relative max-w-xl mb-8 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
              <input
                className="w-full bg-surface-container-low border border-border rounded-xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-secondary transition-all font-bold"
                placeholder="Search by name, role, department, region or ID..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                      "text-left bg-white p-6 rounded-2xl whisper-shadow border transition-all hover:-translate-y-0.5 hover:border-secondary",
                      isSelected ? "border-secondary ring-2 ring-secondary/10" : "border-border"
                    )}
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <div className={cn(
                        "w-14 h-14 rounded-full border flex items-center justify-center font-mono font-black",
                        isSelected ? "bg-secondary text-white border-secondary" : "bg-surface-container-low text-secondary border-border"
                      )}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-primary truncate">{item.staff.name}</p>
                        <p className="font-mono text-[11px] text-on-surface-variant uppercase truncate">
                          {item.staff.role} {item.staff.region ? `| ${item.staff.region}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-between items-end gap-4">
                      <div>
                        <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest mb-1">Avg Rating</p>
                        <p className={cn("font-mono text-[30px] leading-none font-black", isSelected ? "text-secondary" : "text-primary")}>
                          {item.avgRating > 0 ? item.avgRating.toFixed(2) : '0.00'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest mb-1">Feedback</p>
                        <p className="font-mono text-sm font-bold text-primary">{item.feedbackCount} entries</p>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-border/60 flex gap-2 flex-wrap">
                      <span className="px-3 py-1 bg-surface-container-low rounded-full font-mono text-[9px] text-on-surface-variant uppercase font-bold">
                        {item.staff.department}
                      </span>
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className={cn(
                            "px-3 py-1 rounded-full font-mono text-[9px] uppercase font-bold",
                            tag === 'Needs Review' ? "bg-destructive/10 text-destructive" : "bg-secondary/10 text-secondary"
                          )}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}

              {filteredStaff.length === 0 && (
                <div className="md:col-span-2 border-2 border-dashed border-border rounded-2xl p-12 text-center">
                  <p className="font-mono text-xs uppercase text-on-surface-variant font-bold">No matching staff found</p>
                </div>
              )}
            </div>
          </section>

          <aside className="col-span-12 xl:col-span-5">
            {selectedStaff && (
              <div className="sticky top-28 space-y-6">
                <section className="bg-white p-8 rounded-3xl whisper-shadow border border-border">
                  <div className="flex justify-between items-start gap-4 mb-8">
                    <div>
                      <h2 className="font-display text-2xl font-bold text-primary">{selectedStaff.staff.name}</h2>
                      <p className="font-mono text-[10px] uppercase text-secondary font-bold tracking-widest mt-1">
                        {selectedStaff.staff.role} Analytics
                      </p>
                    </div>
                    <span className="px-4 py-2 bg-primary text-white rounded-full font-mono text-[10px] uppercase font-bold">
                      {selectedStaff.staff.department}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-8">
                    {[
                      { label: 'Avg', value: selectedStaff.avgRating > 0 ? selectedStaff.avgRating.toFixed(2) : '0.00' },
                      { label: 'Entries', value: selectedStaff.feedbackCount },
                      { label: 'Resolved', value: `${selectedStaff.resolvedRate}%` },
                    ].map((item) => (
                      <div key={item.label} className="bg-surface-container-low p-4 rounded-xl">
                        <p className="font-mono text-[9px] uppercase text-on-surface-variant font-bold">{item.label}</p>
                        <p className="font-mono text-xl font-black text-primary mt-1">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mb-8">
                    <div className="flex justify-between items-center mb-4">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Performance Trend</p>
                      <div className="flex items-center gap-1 text-secondary font-mono text-[10px] font-bold">
                        <TrendingUp className="w-3 h-3" />
                        {selectedStaff.trend.length} points
                      </div>
                    </div>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={selectedStaff.trend}>
                          <defs>
                            <linearGradient id="staffTrend" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#448515" stopOpacity={0.18}/>
                              <stop offset="95%" stopColor="#448515" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                          <XAxis dataKey="date" hide />
                          <YAxis domain={[0, 5]} hide />
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                          <Area type="monotone" dataKey="score" stroke="#448515" fill="url(#staffTrend)" strokeWidth={3} connectNulls />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Competency Breakdown</p>
                    {selectedStaff.competency.map((dimension) => {
                      const score = Number(dimension.score.toFixed(1));
                      const width = Math.min(100, Math.max(0, (score / 5) * 100));

                      return (
                        <div key={dimension.key} className="space-y-2">
                          <div className="flex justify-between font-mono text-[11px]">
                            <span>{dimension.label}</span>
                            <span className="font-bold">{score > 0 ? `${score}/5.0` : 'No data'}</span>
                          </div>
                          <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                            <div className="h-full bg-secondary rounded-full" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="bg-white p-8 rounded-3xl whisper-shadow border border-border">
                  <div className="flex items-center justify-between mb-6">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Recent Feedback</p>
                    <MessageSquare className="w-4 h-4 text-on-surface-variant/50" />
                  </div>
                  <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                    {selectedStaff.feedbacks.slice(0, 8).map((feedback) => {
                      const score = average(getNumericRatings(feedback, getDimensions(selectedStaff.staff)));

                      return (
                        <div key={feedback.id} className="bg-surface-container-low p-4 rounded-xl">
                          <div className="flex justify-between items-start gap-4 mb-2">
                            <div>
                              <p className="font-bold text-primary text-sm">{feedback.customerName || 'Customer'}</p>
                              <p className="font-mono text-[9px] text-on-surface-variant uppercase">
                                {feedback.category} | {feedback.location || 'Unknown region'}
                              </p>
                            </div>
                            <span className={cn(
                              "px-2 py-1 rounded-full font-mono text-[8px] uppercase font-bold",
                              feedback.status === 'resolved' ? "bg-green-100 text-green-600" :
                              feedback.status === 'open' ? "bg-emerald-50 text-emerald-600" :
                              "bg-blue-100 text-blue-600"
                            )}>
                              {feedback.status || 'open'}
                            </span>
                          </div>
                          {feedback.comment && (
                            <p className="text-[13px] italic text-on-surface-variant leading-relaxed">"{feedback.comment}"</p>
                          )}
                          <div className="flex items-center justify-between mt-3 font-mono text-[9px] text-on-surface-variant/70 font-bold">
                            <span>{formatDate(feedback.timestamp, feedback.serviceDate)}</span>
                            <span>Rating: {score > 0 ? score.toFixed(1) : '0.0'}/5</span>
                          </div>
                        </div>
                      );
                    })}

                    {selectedStaff.feedbacks.length === 0 && (
                      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                        <AlertTriangle className="w-6 h-6 text-on-surface-variant/40 mx-auto mb-3" />
                        <p className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">No feedback tied to this staff member yet</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AdminLayout>
  );
}
