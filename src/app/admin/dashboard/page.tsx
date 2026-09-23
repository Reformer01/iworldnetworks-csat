'use client';

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import { TrendingUp, Users, Activity, CheckCircle, FileDown, Loader2, CheckCircle2, MessageSquare, History } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks, updateFeedbackStatus } from '@/hooks/use-admin-feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';
import FeedbackQuote from '@/components/FeedbackQuote';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/ui/reveal';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { jsPDF } from 'jspdf';

const NETWORK_RATING_KEYS = ['stability', 'latency', 'peakPerformance'] as const;

type TimeRange = '7d' | '30d' | '90d' | '1y';

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

function isTimeRange(value: string): value is TimeRange {
  return value === '7d' || value === '30d' || value === '90d' || value === '1y';
}

function getNumericRatings(feedback: FeedbackDoc, keys?: readonly string[]) {
  const ratings = feedback?.ratings || {};
  const values = keys ? keys.map((key) => ratings[key]) : Object.values(ratings);
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function toSatisfactionPercent(ratings: number[]) {
  if (ratings.length === 0) return 0;
  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  return Math.round((total / (ratings.length * 5)) * 100);
}

/** Regional breakdown computed from actual feedback locations (no hardcoded
 *  city list), sorted by submission count desc. Unspecified locations are
 *  grouped under "Unspecified". */
function regionBreakdown(feedbacks: FeedbackDoc[]): Array<{ name: string; count: number; percent: number }> {
  const counts = new Map<string, number>();
  for (const f of feedbacks) {
    const loc = (f.location || '').trim() || 'Unspecified';
    counts.set(loc, (counts.get(loc) || 0) + 1);
  }
  const total = feedbacks.length;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
}

export default function AdminDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [csvExporting, setCsvExporting] = useState<string | null>(null);
  const [resNotes, setResNotes] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const ACTIVITY_PAGE_SIZE = 10;
  const [regionPage, setRegionPage] = useState(1);
  const REGION_PAGE_SIZE = 6;

  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();

  const { feedbacks: allFeedbacks, loading: allFeedbacksLoading, mutate } = useAdminFeedbacks();

  const filteredFeedbacks = useMemo(() => {
    if (!allFeedbacks) return [];

    // Custom date range takes precedence
    if (dateRange?.from || dateRange?.to) {
      return allFeedbacks.filter((f: FeedbackDoc) => {
        const ts = f.timestamp ?? 0;
        if (dateRange.from && ts < dateRange.from.getTime()) return false;
        if (dateRange.to) {
          const endOfDay = new Date(dateRange.to);
          endOfDay.setHours(23, 59, 59, 999);
          if (ts > endOfDay.getTime()) return false;
        }
        return true;
      });
    }

    const rangeMsMap = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    } satisfies Record<TimeRange, number>;
    const rangeMs = rangeMsMap[timeRange] ?? 30 * 24 * 60 * 60 * 1000;

    const now = Date.now();
    return allFeedbacks.filter((f: FeedbackDoc) => now - (f.timestamp ?? 0) <= rangeMs);
  }, [allFeedbacks, timeRange, dateRange]);

  // List pagination — back to page 1 whenever the period changes.
  useEffect(() => {
    setActivityPage(1);
    setRegionPage(1);
  }, [timeRange, dateRange]);

  const allRegions = useMemo(() => regionBreakdown(filteredFeedbacks), [filteredFeedbacks]);
  const regionTotalPages = Math.max(1, Math.ceil(allRegions.length / REGION_PAGE_SIZE));
  const safeRegionPage = Math.min(regionPage, regionTotalPages);
  const regionItems = allRegions.slice((safeRegionPage - 1) * REGION_PAGE_SIZE, safeRegionPage * REGION_PAGE_SIZE);

  const activityTotalPages = Math.max(1, Math.ceil(filteredFeedbacks.length / ACTIVITY_PAGE_SIZE));
  const safeActivityPage = Math.min(activityPage, activityTotalPages);
  const activityItems = filteredFeedbacks.slice((safeActivityPage - 1) * ACTIVITY_PAGE_SIZE, safeActivityPage * ACTIVITY_PAGE_SIZE);
  const activityStart = filteredFeedbacks.length === 0 ? 0 : (safeActivityPage - 1) * ACTIVITY_PAGE_SIZE + 1;
  const activityEnd = Math.min(safeActivityPage * ACTIVITY_PAGE_SIZE, filteredFeedbacks.length);

  const metrics = useMemo(() => {
    const total = filteredFeedbacks.length;
    if (total === 0) {
      return {
        overallSatisfaction: 0,
        networkSatisfaction: 0,
        nps: 0,
        ces: 0,
        total: 0,
        resolvedRate: 0,
        networkResponses: 0,
        fcrResponses: 0,
      };
    }

    const resolved = filteredFeedbacks.filter((f: FeedbackDoc) => f.status === 'resolved').length;
    const resolvedRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    const allRatings = filteredFeedbacks.flatMap((f: FeedbackDoc) => getNumericRatings(f));
    const overallSatisfaction = toSatisfactionPercent(allRatings);

    const networkFeedbacks = filteredFeedbacks.filter((f: FeedbackDoc) => f.category === 'Reliability');
    const networkRatings = networkFeedbacks.flatMap((f: FeedbackDoc) => getNumericRatings(f, NETWORK_RATING_KEYS));
    const networkSatisfaction = toSatisfactionPercent(networkRatings);

    const promoters = filteredFeedbacks.filter((f: FeedbackDoc) => {
      const scores = getNumericRatings(f);
      return scores.some((s) => s === 5);
    }).length;

    const detractors = filteredFeedbacks.filter((f: FeedbackDoc) => {
      const scores = getNumericRatings(f);
      return scores.every((s) => s <= 3) && scores.length > 0;
    }).length;

    const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

    const fcrResponses = filteredFeedbacks.filter((f: FeedbackDoc) => f.ratings?.fcr === 'Yes' || f.ratings?.fcr === 'No').length;
    const fcrYes = filteredFeedbacks.filter((f: FeedbackDoc) => f.ratings?.fcr === 'Yes').length;
    const ces = fcrResponses > 0 ? Math.round((fcrYes / fcrResponses) * 100) : 0;
    // Count docs that actually answered a network question — not every
    // Reliability doc carries stability/latency/peakPerformance ratings.
    const networkResponses = networkFeedbacks.filter((f: FeedbackDoc) =>
      NETWORK_RATING_KEYS.some((k) => typeof f.ratings?.[k] === 'number'),
    ).length;

    return {
      overallSatisfaction,
      networkSatisfaction,
      nps,
      ces,
      total,
      resolvedRate,
      networkResponses,
      fcrResponses,
    };
  }, [filteredFeedbacks]);

  const chartData = useMemo(() => {
    if (filteredFeedbacks.length === 0) return [];
    const groups: Record<string, { overall: number; overallCount: number; network: number; networkCount: number }> = {};

    filteredFeedbacks.forEach((f: FeedbackDoc) => {
      const date = new Date(f.timestamp ?? 0);
      const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const ratings = getNumericRatings(f);
      if (!groups[label]) groups[label] = { overall: 0, overallCount: 0, network: 0, networkCount: 0 };

      if (ratings.length > 0) {
        groups[label].overall += toSatisfactionPercent(ratings);
        groups[label].overallCount += 1;
      }

      if (f.category === 'Reliability') {
        const networkRatings = getNumericRatings(f, NETWORK_RATING_KEYS);
        if (networkRatings.length > 0) {
          groups[label].network += toSatisfactionPercent(networkRatings);
          groups[label].networkCount += 1;
        }
      }
    });

    return Object.entries(groups)
      .map(([name, data]) => ({
        name,
        overallSatisfaction: data.overallCount > 0 ? Math.round(data.overall / data.overallCount) : null,
        networkSatisfaction: data.networkCount > 0 ? Math.round(data.network / data.networkCount) : null,
      }))
      .reverse();
  }, [filteredFeedbacks]);

  const departmentBreakdown = useMemo(() => {
    const departments = [
      { name: 'Internet Quality', category: 'Reliability' },
      { name: 'Customer Support', category: 'Support' },
      { name: 'Field Support', category: 'FieldSupport' },
      { name: 'Customer Onboarding', category: 'Installation' },
      { name: 'Payments & Billing', category: 'Billing' },
      { name: 'Success Stories', category: 'Testimonials' },
    ];

    return departments.map((dept) => {
      const deptFeedbacks = filteredFeedbacks.filter((f: FeedbackDoc) => f.category === dept.category);
      const total = deptFeedbacks.length;

      const ratingsArray = deptFeedbacks.flatMap((f: FeedbackDoc) =>
        Object.values(f.ratings || {}).filter((v): v is number => typeof v === 'number'),
      );
      const avg = ratingsArray.length > 0 ? (ratingsArray.reduce((a, b) => a + b, 0) / ratingsArray.length).toFixed(1) + '/5' : '—';

      const actioned = deptFeedbacks.filter((f: FeedbackDoc) => f.status === 'resolved').length;

      return {
        name: dept.name,
        total,
        avgRating: avg,
        actioned,
      };
    });
  }, [filteredFeedbacks]);

  const handleUpdateStatus = async (feedbackId: string, status: string) => {
    if (!user) return;
    try {
      await updateFeedbackStatus(feedbackId, status, resNotes, user);
      toast({ title: 'Status Updated', description: `Feedback marked as ${status}.` });
      mutate();
      setResNotes('');
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Update Failed', description: e instanceof Error ? e.message : 'Update failed' });
    }
  };

  const handleGeneratePdfReport = useCallback(async () => {
    if (filteredFeedbacks.length === 0) {
      toast({ variant: 'destructive', title: 'No Data', description: 'No records found for this time range.' });
      return;
    }
    setIsGeneratingReport(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const periodLabel = { '7d': 'Last 7 Days', '30d': 'Last 30 Days', '90d': 'Last Quarter', '1y': 'Annual' } satisfies Record<
        TimeRange,
        string
      >;
      const period =
        dateRange?.from || dateRange?.to
          ? `${dateRange.from ? dateRange.from.toLocaleDateString() : 'Start'} – ${dateRange.to ? dateRange.to.toLocaleDateString() : 'Now'}`
          : (periodLabel[timeRange] ?? timeRange);

      // ---- Cover / Header ----
      doc.setFillColor(89, 175, 23);
      doc.rect(0, 0, 297, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('I-World Networks — Feedback Report', 14, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${period}  |  Generated: ${reportDate}  |  Total Records: ${filteredFeedbacks.length}`, 14, 30);

      // ---- Key Metrics ----
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Key Metrics', 14, 52);

      const metricsBody = [
        ['Overall Satisfaction', `${metrics.overallSatisfaction}%`, metrics.overallSatisfaction >= 70 ? 'Strong' : 'Needs Attention'],
        [
          'Network Satisfaction',
          `${metrics.networkSatisfaction}%`,
          metrics.networkResponses > 0 ? (metrics.networkSatisfaction >= 70 ? 'Strong' : 'Needs Attention') : 'No Network Data',
        ],
        ['Net Promoter Score', `${metrics.nps}`, metrics.nps >= 30 ? 'Good' : 'Fair'],
        metrics.fcrResponses > 0
          ? ['First Contact Resolution', `${metrics.ces}%`, metrics.ces >= 60 ? 'Good' : 'Needs Work']
          : ['First Contact Resolution', 'No data (not asked)', 'Collecting'],
        ['Resolution Rate', `${metrics.resolvedRate}%`, metrics.resolvedRate >= 80 ? 'Excellent' : 'Improving'],
        ['Total Responses', `${metrics.total}`, '-'],
      ];
      autoTable(doc, {
        startY: 56,
        head: [['Metric', 'Value', 'Status']],
        body: metricsBody,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [89, 175, 23] },
        alternateRowStyles: { fillColor: [240, 246, 255] },
      });

      // ---- Department Breakdown ----
      // SAFETY: autoTable attaches lastAutoTable.finalY to the jsPDF instance after running.
      const docWithTable = doc as JsPdfWithAutoTable;
      const deptY = docWithTable.lastAutoTable.finalY + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Department Performance', 14, deptY);

      const deptBody = departmentBreakdown.map((d) => [d.name, d.total.toString(), d.avgRating, `${d.actioned} resolved`]);
      autoTable(doc, {
        startY: deptY + 4,
        head: [['Department', 'Total Submissions', 'Avg Rating', 'Resolved']],
        body: deptBody,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [89, 175, 23] },
        alternateRowStyles: { fillColor: [240, 246, 255] },
      });

      // ---- Regional Summary ----
      const regY = docWithTable.lastAutoTable.finalY + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Regional Breakdown', 14, regY);

      const regBody = allRegions.map((reg) => {
        const pct = metrics.total > 0 ? `${reg.percent}%` : '0%';
        return [reg.name, reg.count.toString(), pct];
      });
      autoTable(doc, {
        startY: regY + 4,
        head: [['Region', 'Submissions', 'Share']],
        body: regBody,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [89, 175, 23] },
        alternateRowStyles: { fillColor: [240, 246, 255] },
      });

      // ---- Individual Submissions ----
      doc.addPage();
      doc.setFillColor(89, 175, 23);
      doc.rect(0, 0, 297, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Individual Feedback Log', 14, 14);

      const rows = filteredFeedbacks.map((f: FeedbackDoc) => [
        f.customerName || '—',
        f.location || '—',
        f.category || '—',
        f.status || '—',
        f.comment ? f.comment.substring(0, 80) + (f.comment.length > 80 ? '…' : '') : '—',
        f.serviceDate || (f.timestamp ? new Date(f.timestamp).toLocaleDateString() : '—'),
      ]);

      autoTable(doc, {
        startY: 24,
        head: [['Customer', 'Region', 'Department', 'Status', 'Comment', 'Date']],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [89, 175, 23] },
        alternateRowStyles: { fillColor: [240, 246, 255] },
        columnStyles: { 4: { cellWidth: 80 } },
      });

      // Save
      doc.save(
        `IWorldNetworks_FeedbackReport_${dateRange?.from || dateRange?.to ? 'custom' : timeRange}_${new Date().toISOString().slice(0, 10)}.pdf`,
      );
      toast({ title: 'PDF Report Downloaded', description: `${filteredFeedbacks.length} records exported.` });
    } catch (error: unknown) {
      console.error('PDF generation error:', error);
      toast({ variant: 'destructive', title: 'Export Failed', description: 'Could not generate the PDF. Please try again.' });
    } finally {
      setIsGeneratingReport(false);
    }
  }, [filteredFeedbacks, metrics, departmentBreakdown, timeRange, dateRange, toast]);

  /** Download a mirrored Splynx dataset as CSV (customers / invoices / plans). */
  const handleCsvExport = useCallback(
    async (kind: 'customers' | 'invoices' | 'plans') => {
      if (!user) return;
      setCsvExporting(kind);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/${kind}/export`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `splynx-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'Export ready', description: 'CSV downloaded.' });
      } catch (e) {
        toast({
          variant: 'destructive',
          title: 'Export failed',
          description: e instanceof Error ? e.message : 'Unknown error',
        });
      } finally {
        setCsvExporting(null);
      }
    },
    [user, toast],
  );

  return (
    <AdminLayout>
      <>
        <Reveal index={0}>
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
            <div>
              <h1 className="text-[26px] font-medium tracking-[-0.03em] text-primary">Admin Dashboard</h1>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Satisfaction, resolution and regional pulse at a glance.</p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <Select
                value={dateRange ? 'custom' : timeRange}
                onValueChange={(val) => {
                  if (val !== 'custom') {
                    setTimeRange(isTimeRange(val) ? val : '30d');
                    setDateRange(undefined);
                  }
                }}
              >
                <SelectTrigger className="w-[180px] rounded-full font-mono text-[10px] uppercase font-bold bg-white border-border">
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last Quarter</SelectItem>
                  <SelectItem value="1y">Last Year</SelectItem>
                </SelectContent>
              </Select>
              <DateRangePicker
                from={dateRange?.from}
                to={dateRange?.to}
                onSelect={(range) => {
                  setDateRange(range);
                  if (range?.from || range?.to) setTimeRange('30d');
                }}
              />
              <Button
                onClick={handleGeneratePdfReport}
                disabled={isGeneratingReport}
                className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 shadow-lg hover:scale-105 transition-transform"
              >
                {isGeneratingReport ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <FileDown className="w-3 h-3 mr-2" />}
                Download PDF Report
              </Button>
              <div className="flex items-center gap-2">
                {(
                  [
                    ['customers', 'Customers CSV'],
                    ['invoices', 'Invoices CSV'],
                    ['plans', 'Plans CSV'],
                  ] as const
                ).map(([kind, label]) => (
                  <Button
                    key={kind}
                    onClick={() => handleCsvExport(kind)}
                    disabled={csvExporting !== null}
                    variant="outline"
                    className="rounded-full font-mono text-[10px] uppercase font-bold px-6"
                  >
                    {csvExporting === kind ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <FileDown className="w-3 h-3 mr-2" />}
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </header>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-12">
          {[
            {
              label: 'Overall Score',
              value: metrics.overallSatisfaction,
              unit: '%',
              icon: Users,
              color: 'text-secondary',
              chip: 'bg-secondary/10',
              detail: 'Average rating',
            },
            {
              label: 'Network Score',
              value: metrics.networkSatisfaction,
              unit: '%',
              icon: Activity,
              color: 'text-green-600',
              chip: 'bg-green-500/10',
              detail: `${metrics.networkResponses} network responses`,
            },
            {
              label: 'Would Recommend',
              value: metrics.nps,
              unit: '%',
              icon: TrendingUp,
              color: 'text-green-600',
              chip: 'bg-green-500/10',
              detail: `Based on ${metrics.total} feedbacks`,
            },
            {
              // The form never asks an FCR question, so 0 answers is "no data",
              // not "nobody fixed first try" — show a dash instead of 0%.
              label: 'Resolved First Time',
              value: metrics.fcrResponses > 0 ? metrics.ces : '—',
              unit: metrics.fcrResponses > 0 ? '%' : '',
              icon: CheckCircle2,
              color: 'text-orange-500',
              chip: 'bg-orange-500/10',
              detail: metrics.fcrResponses > 0 ? 'Fixed on first try' : 'Not asked on form yet',
            },
            {
              label: 'Resolved Issues',
              value: metrics.resolvedRate,
              unit: '%',
              icon: CheckCircle,
              color: 'text-green-600',
              chip: 'bg-green-500/10',
              detail: 'Issues resolved',
            },
          ].map((item, i) => (
            <Reveal key={i} index={Math.min(i + 1, 4)}>
              <div className="rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(68,133,21,0.25)]">
                <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', item.chip)}>
                  <item.icon className={cn('h-4 w-4', item.color)} />
                </div>
                <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-headline text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  {item.value}
                  {item.unit && <span className="text-lg font-semibold text-muted-foreground">{item.unit}</span>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-gutter mb-12">
          <div className="col-span-12 lg:col-span-8 bg-white p-8 rounded-xl card-shadow border border-border h-[400px]">
            <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-8">Satisfaction Over Time</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorOverallSatisfaction" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#448515" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#448515" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorNetworkSatisfaction" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#111827" stopOpacity={0.08} />
                      <stop offset="95%" stopColor="#111827" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666' }} />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <Legend
                    verticalAlign="top"
                    height={24}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="overallSatisfaction"
                    name="Overall"
                    stroke="#448515"
                    fill="url(#colorOverallSatisfaction)"
                    strokeWidth={3}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="networkSatisfaction"
                    name="Network"
                    stroke="#111827"
                    fill="url(#colorNetworkSatisfaction)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 bg-white p-8 rounded-xl card-shadow border border-border">
            <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-8">Regional Pulse</h3>
            <div className="space-y-6">
              {regionItems.map((reg) => {
                const percent = metrics.total > 0 ? (reg.count / metrics.total) * 100 : 0;
                return (
                  <div key={reg.name} className="space-y-2">
                    <div className="flex justify-between font-mono text-[10px] font-bold uppercase">
                      <span>{reg.name}</span>
                      <span className="text-secondary">{reg.count} Feedbacks</span>
                    </div>
                    <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full" style={{ width: `${percent}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
            {regionTotalPages > 1 && (
              <div className="flex items-center justify-between pt-6">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full font-mono text-[10px] uppercase font-bold px-4"
                  disabled={safeRegionPage <= 1}
                  onClick={() => setRegionPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous regions page"
                >
                  Prev
                </Button>
                <span className="font-mono text-[10px] font-bold text-on-surface-variant/60" aria-live="polite">
                  {safeRegionPage} of {regionTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full font-mono text-[10px] uppercase font-bold px-4"
                  disabled={safeRegionPage >= regionTotalPages}
                  onClick={() => setRegionPage((p) => Math.min(regionTotalPages, p + 1))}
                  aria-label="Next regions page"
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl card-shadow border border-border p-8 mb-12">
          <div className="flex items-center gap-3 mb-8">
            <Activity className="w-5 h-5 text-secondary" />
            <h3 className="font-display font-bold text-lg uppercase tracking-tight">Team Performance</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                  <th className="pb-4">Department</th>
                  <th className="pb-4 text-center">Total</th>
                  <th className="pb-4 text-center">Avg Rating</th>
                  <th className="pb-4 text-right">Resolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-body text-sm">
                {departmentBreakdown.map((dept, index) => (
                  <tr key={index} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="py-4 font-bold text-primary">{dept.name}</td>
                    <td className="py-4 text-center font-mono font-bold">{dept.total}</td>
                    <td className="py-4 text-center font-mono font-bold text-secondary">{dept.avgRating}</td>
                    <td className="py-4 text-right font-mono">
                      <span
                        className={cn(
                          'px-3 py-1 rounded-full text-[10px] font-bold font-mono',
                          dept.actioned > 0 ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {dept.actioned} Resolved
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl card-shadow border border-border p-8 mb-24">
          <div className="flex items-center gap-3 mb-8">
            <History className="w-5 h-5 text-secondary" />
            <h3 className="font-display font-bold text-lg uppercase tracking-tight">Recent Activity</h3>
          </div>
          <div className="space-y-4">
            {activityItems.map((f: FeedbackDoc) => (
              <div
                key={f.id}
                className="group p-6 border border-border rounded-xl hover:border-secondary transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-surface-container-lowest"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={cn(
                        'px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase',
                        f.status === 'resolved'
                          ? 'bg-green-100 text-green-600'
                          : f.status === 'open'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50'
                            : 'bg-green-50 text-green-600 border border-green-200/50',
                      )}
                    >
                      {f.status}
                    </span>
                    <span className="font-mono text-[10px] text-on-surface-variant uppercase font-bold">{f.category}</span>
                    <span className="text-[10px] text-on-surface-variant/40">{new Date(f.timestamp ?? 0).toLocaleDateString()}</span>
                  </div>
                  <p className="font-bold text-primary mb-1">
                    {f.customerName} <span className="font-mono text-[10px] font-normal opacity-40 ml-2">({f.location})</span>
                  </p>
                  <FeedbackQuote feedback={f} className="text-sm text-on-surface-variant line-clamp-2" />
                  {f.resolutionNotes && (
                    <div className="mt-4 p-4 bg-muted rounded-xl text-xs font-mono border-l-4 border-secondary shadow-sm">
                      <div className="flex items-center gap-2 mb-2 text-secondary font-bold uppercase tracking-wider">
                        <CheckCircle2 className="w-3 h-3" />
                        Action Taken
                      </div>
                      {f.resolutionNotes}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-full px-6 font-mono text-[10px] uppercase font-bold"
                        onClick={() => {
                          setResNotes(f.resolutionNotes || '');
                        }}
                      >
                        <MessageSquare className="w-3 h-3 mr-2" /> Review
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md rounded-3xl">
                      <DialogHeader>
                        <DialogTitle className="font-display uppercase tracking-tight">Handle Feedback</DialogTitle>
                        <DialogDescription className="sr-only">Review and resolve this customer feedback entry.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-6 py-4">
                        <div className="p-4 bg-muted rounded-xl text-sm">
                          <FeedbackQuote feedback={f} />
                        </div>
                        <div className="space-y-2">
                          <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Resolution Notes</label>
                          <Textarea
                            placeholder="What was done to resolve this issue?"
                            className="min-h-[120px] rounded-2xl"
                            value={resNotes}
                            onChange={(e) => setResNotes(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter className="flex gap-2">
                        <Button
                          variant="outline"
                          className="rounded-full font-mono text-[10px] uppercase font-bold"
                          onClick={() => handleUpdateStatus(f.id, 'escalated')}
                        >
                          Escalate
                        </Button>
                        <Button
                          className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8"
                          onClick={() => handleUpdateStatus(f.id, 'resolved')}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-2" /> Mark Resolved
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ))}
            {activityTotalPages > 1 && !allFeedbacksLoading && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
                <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/60">
                  Showing {activityStart}–{activityEnd} of {filteredFeedbacks.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full font-mono text-[10px] uppercase font-bold px-4"
                    disabled={safeActivityPage <= 1}
                    onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous activity page"
                  >
                    Prev
                  </Button>
                  {(() => {
                    const pages: Array<number | '…'> = [];
                    for (let p = 1; p <= activityTotalPages; p++) {
                      if (p === 1 || p === activityTotalPages || Math.abs(p - safeActivityPage) <= 1) {
                        const prev = pages[pages.length - 1];
                        if (typeof prev === 'number' && p - prev > 1) pages.push('…');
                        pages.push(p);
                      }
                    }
                    return pages;
                  })().map((p, i) =>
                    p === '…' ? (
                      <span key={`gap-${i}`} className="font-mono text-[10px] text-on-surface-variant/40 px-1">
                        …
                      </span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === safeActivityPage ? 'default' : 'outline'}
                        size="sm"
                        className={cn(
                          'rounded-full font-mono text-[10px] font-bold w-8 h-8 p-0',
                          p === safeActivityPage && 'bg-secondary text-white',
                        )}
                        onClick={() => setActivityPage(p)}
                        aria-label={`Go to activity page ${p}`}
                        aria-current={p === safeActivityPage ? 'page' : undefined}
                      >
                        {p}
                      </Button>
                    ),
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full font-mono text-[10px] uppercase font-bold px-4"
                    disabled={safeActivityPage >= activityTotalPages}
                    onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
                    aria-label="Next activity page"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            {allFeedbacksLoading && (
              <div className="py-20 text-center">
                <div className="w-8 h-8 border-4 border-secondary/20 border-t-secondary rounded-full animate-spin mx-auto" />
              </div>
            )}
            {!allFeedbacksLoading && filteredFeedbacks.length === 0 && (
              <div className="py-20 text-center border-2 border-dashed border-border rounded-xl">
                <p className="font-mono text-sm text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">
                  No feedback found for this period
                </p>
              </div>
            )}
          </div>
        </div>
      </>
    </AdminLayout>
  );
}
