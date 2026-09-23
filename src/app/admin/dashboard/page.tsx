'use client';

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Activity,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  MessageSquare,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { jsPDF } from 'jspdf';

import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks, updateFeedbackStatus } from '@/hooks/use-admin-feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';
import FeedbackQuote from '@/components/FeedbackQuote';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { BreakdownBarChart } from '@/components/charts/breakdown-bar-chart';
import { TrendAreaChart } from '@/components/charts/trend-area-chart';
import { DataTable, DataTableColumnHeader } from '@/components/data-table';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartCard } from '@/components/ui/chart-card';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

const NETWORK_RATING_KEYS = ['stability', 'latency', 'peakPerformance'] as const;

type TimeRange = '7d' | '30d' | '90d' | '1y';

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

function isTimeRange(value: string): value is TimeRange {
  return value === '7d' || value === '30d' || value === '90d' || value === '1y';
}

const RANGE_MS: Record<TimeRange, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

const PERIOD_LABEL: Record<TimeRange, string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last Quarter',
  '1y': 'Last Year',
};

const DEPARTMENTS = [
  { name: 'Internet Quality', category: 'Reliability' },
  { name: 'Customer Support', category: 'Support' },
  { name: 'Field Support', category: 'FieldSupport' },
  { name: 'Customer Onboarding', category: 'Installation' },
  { name: 'Payments & Billing', category: 'Billing' },
  { name: 'Success Stories', category: 'Testimonials' },
] as const;

const REGION_PAGE_SIZE = 6;

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

/** Regional breakdown computed from actual feedback locations (no hardcoded city list). */
function regionBreakdown(feedbacks: FeedbackDoc[]): Array<{ name: string; count: number; percent: number }> {
  const counts = new Map<string, number>();
  for (const f of feedbacks) {
    const loc = (f.location || '').trim() || 'Unspecified';
    counts.set(loc, (counts.get(loc) || 0) + 1);
  }
  const total = feedbacks.length;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 }));
}

function computeMetrics(feedbacks: FeedbackDoc[]) {
  const total = feedbacks.length;
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

  const resolved = feedbacks.filter((f) => f.status === 'resolved').length;
  const resolvedRate = Math.round((resolved / total) * 100);

  const overallSatisfaction = toSatisfactionPercent(feedbacks.flatMap((f) => getNumericRatings(f)));

  const networkFeedbacks = feedbacks.filter((f) => f.category === 'Reliability');
  const networkSatisfaction = toSatisfactionPercent(
    networkFeedbacks.flatMap((f) => getNumericRatings(f, NETWORK_RATING_KEYS)),
  );

  const promoters = feedbacks.filter((f) => getNumericRatings(f).some((s) => s === 5)).length;
  const detractors = feedbacks.filter((f) => {
    const scores = getNumericRatings(f);
    return scores.length > 0 && scores.every((s) => s <= 3);
  }).length;
  const nps = Math.round(((promoters - detractors) / total) * 100);

  const fcrResponses = feedbacks.filter((f) => f.ratings?.fcr === 'Yes' || f.ratings?.fcr === 'No').length;
  const fcrYes = feedbacks.filter((f) => f.ratings?.fcr === 'Yes').length;
  const ces = fcrResponses > 0 ? Math.round((fcrYes / fcrResponses) * 100) : 0;

  // Only count docs that actually answered a network question.
  const networkResponses = networkFeedbacks.filter((f) =>
    NETWORK_RATING_KEYS.some((k) => typeof f.ratings?.[k] === 'number'),
  ).length;

  return { overallSatisfaction, networkSatisfaction, nps, ces, total, resolvedRate, networkResponses, fcrResponses };
}

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  resolved: 'success',
  open: 'warning',
  escalated: 'danger',
};

function delta(current: number, previous: number, unit = 'pts') {
  const diff = current - previous;
  return {
    value: `${diff > 0 ? '+' : ''}${diff} ${unit}`,
    direction: diff > 0 ? ('up' as const) : diff < 0 ? ('down' as const) : ('flat' as const),
    label: `vs previous period (${previous}${unit === 'pts' ? '%' : ''})`,
  };
}

export default function AdminDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [csvExporting, setCsvExporting] = useState<string | null>(null);
  const [resNotes, setResNotes] = useState('');
  const [activeFeedback, setActiveFeedback] = useState<FeedbackDoc | null>(null);
  const [regionPage, setRegionPage] = useState(1);
  const [view, setView] = useState<'overview' | 'log'>('overview');

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

    const rangeMs = RANGE_MS[timeRange] ?? RANGE_MS['30d'];
    const now = Date.now();
    return allFeedbacks.filter((f: FeedbackDoc) => now - (f.timestamp ?? 0) <= rangeMs);
  }, [allFeedbacks, timeRange, dateRange]);

  /** Same-length window immediately before the selected one â€” powers the delta pills. */
  const previousFeedbacks = useMemo(() => {
    if (!allFeedbacks || allFeedbacks.length === 0) return [];
    const rangeMs = RANGE_MS[timeRange] ?? RANGE_MS['30d'];
    const now = Date.now();
    const start = now - rangeMs;
    const previousStart = start - rangeMs;
    return allFeedbacks.filter((f: FeedbackDoc) => {
      const ts = f.timestamp ?? 0;
      return ts < start && ts >= previousStart;
    });
  }, [allFeedbacks, timeRange]);

  const metrics = useMemo(() => computeMetrics(filteredFeedbacks), [filteredFeedbacks]);
  const previousMetrics = useMemo(() => computeMetrics(previousFeedbacks), [previousFeedbacks]);

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

  const departmentBreakdown = useMemo(
    () =>
      DEPARTMENTS.map((dept) => {
        const deptFeedbacks = filteredFeedbacks.filter((f: FeedbackDoc) => f.category === dept.category);
        const ratingsArray = deptFeedbacks.flatMap((f: FeedbackDoc) =>
          Object.values(f.ratings || {}).filter((v): v is number => typeof v === 'number'),
        );
        return {
          name: dept.name,
          total: deptFeedbacks.length,
          avgRating:
            ratingsArray.length > 0
              ? `${(ratingsArray.reduce((a, b) => a + b, 0) / ratingsArray.length).toFixed(1)}/5`
              : 'â€”',
          actioned: deptFeedbacks.filter((f: FeedbackDoc) => f.status === 'resolved').length,
        };
      }),
    [filteredFeedbacks],
  );

  const allRegions = useMemo(() => regionBreakdown(filteredFeedbacks), [filteredFeedbacks]);
  const regionTotalPages = Math.max(1, Math.ceil(allRegions.length / REGION_PAGE_SIZE));
  const safeRegionPage = Math.min(regionPage, regionTotalPages);
  const regionItems = allRegions.slice((safeRegionPage - 1) * REGION_PAGE_SIZE, safeRegionPage * REGION_PAGE_SIZE);

  // Reset the regional pager whenever the period changes.
  useEffect(() => {
    setRegionPage(1);
  }, [timeRange, dateRange]);

  const handleUpdateStatus = async (feedbackId: string, status: string) => {
    if (!user) return;
    try {
      await updateFeedbackStatus(feedbackId, status, resNotes, user);
      toast({ title: 'Status updated', description: `Feedback marked as ${status}.` });
      setActiveFeedback(null);
      setResNotes('');
      mutate();
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: e instanceof Error ? e.message : 'Update failed',
      });
    }
  };

  const handleGeneratePdfReport = useCallback(async () => {
    if (filteredFeedbacks.length === 0) {
      toast({ variant: 'destructive', title: 'No data', description: 'No records found for this time range.' });
      return;
    }
    setIsGeneratingReport(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const period =
        dateRange?.from || dateRange?.to
          ? `${dateRange.from ? dateRange.from.toLocaleDateString() : 'Start'} â€“ ${dateRange.to ? dateRange.to.toLocaleDateString() : 'Now'}`
          : PERIOD_LABEL[timeRange];

      // ---- Cover / header ----
      doc.setFillColor(89, 175, 23);
      doc.rect(0, 0, 297, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('I-World Networks â€” Feedback Report', 14, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${period}  |  Generated: ${reportDate}  |  Total Records: ${filteredFeedbacks.length}`, 14, 30);

      // ---- Key metrics ----
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Key Metrics', 14, 52);

      autoTable(doc, {
        startY: 56,
        head: [['Metric', 'Value', 'Status']],
        body: [
          ['Overall Satisfaction', `${metrics.overallSatisfaction}%`, metrics.overallSatisfaction >= 70 ? 'Strong' : 'Needs Attention'],
          [
            'Network Satisfaction',
            `${metrics.networkSatisfaction}%`,
            metrics.networkResponses > 0
              ? metrics.networkSatisfaction >= 70
                ? 'Strong'
                : 'Needs Attention'
              : 'No Network Data',
          ],
          ['Net Promoter Score', `${metrics.nps}`, metrics.nps >= 30 ? 'Good' : 'Fair'],
          metrics.fcrResponses > 0
            ? ['First Contact Resolution', `${metrics.ces}%`, metrics.ces >= 60 ? 'Good' : 'Needs Work']
            : ['First Contact Resolution', 'No data (not asked)', 'Collecting'],
          ['Resolution Rate', `${metrics.resolvedRate}%`, metrics.resolvedRate >= 80 ? 'Excellent' : 'Improving'],
          ['Total Responses', `${metrics.total}`, '-'],
        ],
        styles: { fontSize: 10 },
        headStyles: { fillColor: [89, 175, 23] },
        alternateRowStyles: { fillColor: [240, 246, 255] },
      });

      // ---- Department breakdown ----
      // SAFETY: autoTable attaches lastAutoTable.finalY to the jsPDF instance after running.
      const docWithTable = doc as JsPdfWithAutoTable;
      const deptY = docWithTable.lastAutoTable.finalY + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Department Performance', 14, deptY);

      autoTable(doc, {
        startY: deptY + 4,
        head: [['Department', 'Total Submissions', 'Avg Rating', 'Resolved']],
        body: departmentBreakdown.map((d) => [d.name, d.total.toString(), d.avgRating, `${d.actioned} resolved`]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [89, 175, 23] },
        alternateRowStyles: { fillColor: [240, 246, 255] },
      });

      // ---- Regional summary ----
      const regY = docWithTable.lastAutoTable.finalY + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Regional Breakdown', 14, regY);

      autoTable(doc, {
        startY: regY + 4,
        head: [['Region', 'Submissions', 'Share']],
        body: allRegions.map((reg) => [reg.name, reg.count.toString(), metrics.total > 0 ? `${reg.percent}%` : '0%']),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [89, 175, 23] },
        alternateRowStyles: { fillColor: [240, 246, 255] },
      });

      // ---- Individual submissions ----
      doc.addPage();
      doc.setFillColor(89, 175, 23);
      doc.rect(0, 0, 297, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Individual Feedback Log', 14, 14);

      autoTable(doc, {
        startY: 24,
        head: [['Customer', 'Region', 'Department', 'Status', 'Comment', 'Date']],
        body: filteredFeedbacks.map((f: FeedbackDoc) => [
          f.customerName || 'â€”',
          f.location || 'â€”',
          f.category || 'â€”',
          f.status || 'â€”',
          f.comment ? f.comment.substring(0, 80) + (f.comment.length > 80 ? 'â€¦' : '') : 'â€”',
          f.serviceDate || (f.timestamp ? new Date(f.timestamp).toLocaleDateString() : 'â€”'),
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [89, 175, 23] },
        alternateRowStyles: { fillColor: [240, 246, 255] },
        columnStyles: { 4: { cellWidth: 80 } },
      });

      doc.save(
        `IWorldNetworks_FeedbackReport_${dateRange?.from || dateRange?.to ? 'custom' : timeRange}_${new Date().toISOString().slice(0, 10)}.pdf`,
      );
      toast({ title: 'PDF report downloaded', description: `${filteredFeedbacks.length} records exported.` });
    } catch (error: unknown) {
      console.error('PDF generation error:', error);
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: 'Could not generate the PDF. Please try again.',
      });
    } finally {
      setIsGeneratingReport(false);
    }
  }, [filteredFeedbacks, metrics, departmentBreakdown, allRegions, timeRange, dateRange, toast]);

  /** Download a mirrored Splynx dataset as CSV (customers / invoices / plans). */
  const handleCsvExport = useCallback(
    async (kind: 'customers' | 'invoices' | 'plans') => {
      if (!user) return;
      setCsvExporting(kind);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/${kind}/export`, { headers: { Authorization: `Bearer ${token}` } });
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

  /* ---- Activity table (TanStack + shared data-table system) -------------- */

  const activityColumns = useMemo<ColumnDef<FeedbackDoc>[]>(
    () => [
      {
        accessorKey: 'customerName',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
        cell: ({ row }) => (
          <div className="min-w-[150px]">
            <p className="font-medium">{row.original.customerName || 'Anonymous'}</p>
            <p className="text-xs text-muted-foreground">{row.original.location || 'Unspecified'}</p>
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Department" />,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.category || 'â€”'}</span>,
        filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id))),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const status = row.original.status || 'open';
          return <Badge variant={STATUS_BADGE[status] ?? 'muted'}>{status.toUpperCase()}</Badge>;
        },
        filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id))),
      },
      {
        accessorKey: 'comment',
        header: 'Feedback',
        enableSorting: false,
        cell: ({ row }) => (
          <FeedbackQuote
            feedback={row.original}
            className="line-clamp-2 max-w-[340px] text-sm text-muted-foreground"
          />
        ),
      },
      {
        accessorKey: 'timestamp',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {new Date(row.original.timestamp ?? 0).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        header: '',
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setResNotes(row.original.resolutionNotes || '');
              setActiveFeedback(row.original);
            }}
          >
            <MessageSquare className="size-3.5" />
            Review
          </Button>
        ),
      },
    ],
    [],
  );

  const categoryOptions = useMemo(
    () =>
      [...new Set(filteredFeedbacks.map((f) => f.category).filter((c): c is string => Boolean(c)))]
        .sort()
        .map((category) => ({ label: category, value: category })),
    [filteredFeedbacks],
  );

  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of filteredFeedbacks) {
      const status = f.status || 'open';
      counts.set(status, (counts.get(status) || 0) + 1);
    }
    return ['open', 'resolved', 'escalated'].map((status) => ({
      label: `${status} (${counts.get(status) || 0})`,
      value: status,
    }));
  }, [filteredFeedbacks]);

  const openCount = filteredFeedbacks.filter((f) => (f.status || 'open') === 'open').length;
  const needsAttention = useMemo(
    () =>
      filteredFeedbacks
        .filter((f) => (f.status || 'open') === 'open')
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
        .slice(0, 4),
    [filteredFeedbacks],
  );

  const isCustomPeriod = Boolean(dateRange?.from || dateRange?.to);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Overview"
          title="Admin Dashboard"
          description="Satisfaction, resolution and regional pulse at a glance."
          actions={
            <>
              <Select
                value={isCustomPeriod ? 'custom' : timeRange}
                onValueChange={(val) => {
                  if (val !== 'custom') {
                    setTimeRange(isTimeRange(val) ? val : '30d');
                    setDateRange(undefined);
                  }
                }}
              >
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue placeholder="Time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last quarter</SelectItem>
                  <SelectItem value="1y">Last year</SelectItem>
                  {isCustomPeriod && <SelectItem value="custom">Custom range</SelectItem>}
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
              <Button size="sm" onClick={handleGeneratePdfReport} disabled={isGeneratingReport}>
                {isGeneratingReport ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                PDF report
              </Button>
              {(['customers', 'invoices', 'plans'] as const).map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCsvExport(kind)}
                  disabled={csvExporting !== null}
                >
                  {csvExporting === kind ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                  {kind}
                </Button>
              ))}
            </>
          }
        />

        <StatCardGrid columns={5}>
          <StatCard
            label="Overall Score"
            value={metrics.overallSatisfaction}
            unit="%"
            icon={Users}
            detail="Average of every rating given"
            delta={delta(metrics.overallSatisfaction, previousMetrics.overallSatisfaction)}
            loading={allFeedbacksLoading}
          />
          <StatCard
            label="Network Score"
            value={metrics.networkSatisfaction}
            unit="%"
            icon={Activity}
            detail={`${metrics.networkResponses} network responses`}
            delta={delta(metrics.networkSatisfaction, previousMetrics.networkSatisfaction)}
            loading={allFeedbacksLoading}
          />
          <StatCard
            label="Would Recommend"
            value={metrics.nps}
            unit="%"
            icon={TrendingUp}
            detail={`Net promoter score - ${metrics.total} responses`}
            delta={delta(metrics.nps, previousMetrics.nps)}
            loading={allFeedbacksLoading}
          />
          <StatCard
            label="Resolved First Time"
            value={metrics.fcrResponses > 0 ? metrics.ces : '-'}
            unit={metrics.fcrResponses > 0 ? '%' : ''}
            icon={CheckCircle2}
            detail={metrics.fcrResponses > 0 ? `Fixed on first try (${metrics.fcrResponses} answers)` : 'Not asked on form yet'}
            loading={allFeedbacksLoading}
          />
          <StatCard
            label="Resolved Issues"
            value={metrics.resolvedRate}
            unit="%"
            icon={CheckCircle}
            detail={`${openCount} still open`}
            delta={delta(metrics.resolvedRate, previousMetrics.resolvedRate)}
            loading={allFeedbacksLoading}
          />
        </StatCardGrid>
        <Tabs value={view} onValueChange={(value) => setView(value as 'overview' | 'log')}>
          <TabsList variant="segmented">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="log">Feedback log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ChartCard
                className="lg:col-span-2"
                title="Satisfaction over time"
                description="Daily average score - overall versus network quality answers."
                legend={[
                  { label: 'Overall', color: 'var(--chart-1)', value: `${metrics.overallSatisfaction}%` },
                  { label: 'Network', color: 'var(--chart-2)', dashed: true, value: `${metrics.networkSatisfaction}%` },
                ]}
                footer={`${metrics.total} responses in period - ${openCount} awaiting action`}
                loading={allFeedbacksLoading}
              >
                {chartData.length === 0 ? (
                  <EmptyState
                    title="No feedback in this period"
                    description="Widen the date range to see the satisfaction trend."
                    className="border-0"
                  />
                ) : (
                  <TrendAreaChart
                    data={chartData}
                    xKey="name"
                    height={280}
                    yDomain={[0, 100]}
                    yTickFormatter={(value) => `${value}%`}
                    valueFormatter={(value) => `${value}%`}
                    series={[
                      { key: 'overallSatisfaction', label: 'Overall', color: 'var(--chart-1)' },
                      {
                        key: 'networkSatisfaction',
                        label: 'Network',
                        color: 'var(--chart-2)',
                        variant: 'line',
                        dashed: true,
                      },
                    ]}
                  />
                )}
              </ChartCard>

              <Card className="flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle>Regional pulse</CardTitle>
                  <CardDescription>
                    {allRegions.length} region{allRegions.length === 1 ? '' : 's'} - {metrics.total} responses
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 pt-0">
                  <BreakdownBarChart
                    items={regionItems.map((region) => ({
                      name: region.name,
                      value: region.count,
                      percent: region.percent,
                    }))}
                    valueFormatter={(item) => `${item.value} - ${item.percent}%`}
                    emptyLabel="No regional data for this period"
                  />
                </CardContent>
                {regionTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-border px-6 py-3">
                    <p className="text-xs text-muted-foreground">
                      Page {safeRegionPage} of {regionTotalPages}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setRegionPage((p) => Math.max(1, p - 1))}
                        disabled={safeRegionPage <= 1}
                      >
                        <span className="sr-only">Previous regions page</span>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setRegionPage((p) => Math.min(regionTotalPages, p + 1))}
                        disabled={safeRegionPage >= regionTotalPages}
                      >
                        <span className="sr-only">Next regions page</span>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle>Department performance</CardTitle>
                  <CardDescription>Submissions, average rating and resolutions per department</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Submissions</TableHead>
                        <TableHead className="text-right">Avg rating</TableHead>
                        <TableHead className="text-right">Resolved</TableHead>
                        <TableHead className="text-right">Resolution rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departmentBreakdown.map((dept) => {
                        const rate = dept.total > 0 ? Math.round((dept.actioned / dept.total) * 100) : 0;
                        return (
                          <TableRow key={dept.name}>
                            <TableCell className="font-medium">{dept.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{dept.total}</TableCell>
                            <TableCell className="text-right tabular-nums">{dept.avgRating}</TableCell>
                            <TableCell className="text-right tabular-nums">{dept.actioned}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={rate >= 70 ? 'success' : rate >= 40 ? 'warning' : 'muted'}>{rate}%</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Needs attention</CardTitle>
                  <CardDescription>Oldest unresolved feedback in this period</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {needsAttention.length === 0 ? (
                    <EmptyState
                      title="Nothing open"
                      description="Every feedback item in this period is resolved."
                      className="border-0 py-8"
                    />
                  ) : (
                    needsAttention.map((feedback) => (
                      <button
                        key={feedback.id}
                        type="button"
                        onClick={() => {
                          setResNotes(feedback.resolutionNotes || '');
                          setActiveFeedback(feedback);
                        }}
                        className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-secondary/60 hover:bg-muted/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{feedback.customerName || 'Anonymous'}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {new Date(feedback.timestamp ?? 0).toLocaleDateString()}
                          </span>
                        </div>
                        <FeedbackQuote feedback={feedback} className="mt-1 line-clamp-2 text-xs text-muted-foreground" />
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="log">
            <DataTable
              columns={activityColumns}
              data={filteredFeedbacks}
              searchPlaceholder="Search customer, comment or region..."
              filters={[
                { columnId: 'category', title: 'Department', options: categoryOptions },
                { columnId: 'status', title: 'Status', options: statusOptions },
              ]}
              loading={allFeedbacksLoading}
              initialPageSize={10}
              emptyTitle="No feedback in this period"
              emptyDescription="Adjust the date range or clear the filters."
              totalLabel={`${filteredFeedbacks.length} submissions in this period`}
              maxHeight="580px"
            />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={activeFeedback !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveFeedback(null);
            setResNotes('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Handle feedback</DialogTitle>
            <DialogDescription>
              {activeFeedback
                ? `${activeFeedback.customerName || 'Anonymous'} - ${activeFeedback.location || 'Unspecified'} - ${new Date(
                    activeFeedback.timestamp ?? 0,
                  ).toLocaleDateString()}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {activeFeedback && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <FeedbackQuote feedback={activeFeedback} className="text-sm text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="dashboard-resolution-notes" className="text-xs font-medium text-muted-foreground">
                  Resolution notes
                </label>
                <Textarea
                  id="dashboard-resolution-notes"
                  value={resNotes}
                  onChange={(event) => setResNotes(event.target.value)}
                  placeholder="What was done to resolve this issue?"
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => activeFeedback && void handleUpdateStatus(activeFeedback.id, 'escalated')}
            >
              Escalate
            </Button>
            <Button
              variant="secondary"
              onClick={() => activeFeedback && void handleUpdateStatus(activeFeedback.id, 'resolved')}
            >
              <CheckCircle2 className="size-4" />
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}