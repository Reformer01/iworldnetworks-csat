
'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { DateRange } from 'react-day-picker';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { TrendingUp, Users, Activity, CheckCircle, FileDown, Loader2, CheckCircle2, MessageSquare, History } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks, updateFeedbackStatus } from '@/hooks/use-admin-feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const NETWORK_RATING_KEYS = ['stability', 'latency', 'peakPerformance'] as const;

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

export default function AdminDashboard() {
  const [timeRange, setTimeRange] = useState('30d');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackDoc | null>(null);
  const [resNotes, setResNotes] = useState('');
  
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

    const now = Date.now();
    const rangeMsMap: Record<string, number> = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    };
    const rangeMs = rangeMsMap[timeRange] ?? 30 * 24 * 60 * 60 * 1000;

    return allFeedbacks.filter((f: FeedbackDoc) => (now - (f.timestamp ?? 0)) <= rangeMs);
  }, [allFeedbacks, timeRange, dateRange]);

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
      return scores.some(s => s === 5);
    }).length;
    
    const detractors = filteredFeedbacks.filter((f: FeedbackDoc) => {
      const scores = getNumericRatings(f);
      return scores.every(s => s <= 3) && scores.length > 0;
    }).length;

    const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

    const fcrResponses = filteredFeedbacks.filter((f: FeedbackDoc) => f.ratings?.fcr === 'Yes' || f.ratings?.fcr === 'No').length;
    const fcrYes = filteredFeedbacks.filter((f: FeedbackDoc) => f.ratings?.fcr === 'Yes').length;
    const ces = fcrResponses > 0 ? Math.round((fcrYes / fcrResponses) * 100) : 0;

    return {
      overallSatisfaction,
      networkSatisfaction,
      nps,
      ces,
      total,
      resolvedRate,
      networkResponses: networkFeedbacks.length,
    };
  }, [filteredFeedbacks]);

  const chartData = useMemo(() => {
    if (filteredFeedbacks.length === 0) return [];
    const groups: Record<string, { overall: number, overallCount: number, network: number, networkCount: number }> = {};
    
    filteredFeedbacks.slice(0, 30).forEach((f: FeedbackDoc) => {
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

    return Object.entries(groups).map(([name, data]) => ({
      name,
      overallSatisfaction: data.overallCount > 0 ? Math.round(data.overall / data.overallCount) : null,
      networkSatisfaction: data.networkCount > 0 ? Math.round(data.network / data.networkCount) : null,
    })).reverse();
  }, [filteredFeedbacks]);

  const departmentBreakdown = useMemo(() => {
    const departments = [
      { name: 'Internet Quality', category: 'Reliability' },
      { name: 'Customer Support', category: 'Support' },
      { name: 'Field Support', category: 'FieldSupport' },
      { name: 'Customer Onboarding', category: 'Installation' },
      { name: 'Payments & Billing', category: 'Billing' },
      { name: 'Success Stories', category: 'Testimonials' }
    ];

    return departments.map(dept => {
      const deptFeedbacks = filteredFeedbacks.filter((f: FeedbackDoc) => f.category === dept.category);
      const total = deptFeedbacks.length;
      
      const ratingsArray = deptFeedbacks.flatMap((f: FeedbackDoc) => Object.values(f.ratings || {}).filter(v => typeof v === 'number') as number[]);
      const avg = ratingsArray.length > 0 
        ? (ratingsArray.reduce((a, b) => a + b, 0) / ratingsArray.length).toFixed(1) + '/5' 
        : '—';

      const actioned = deptFeedbacks.filter((f: FeedbackDoc) => f.status === 'resolved').length;

      return {
        name: dept.name,
        total,
        avgRating: avg,
        actioned
      };
    });
  }, [filteredFeedbacks]);

  const handleUpdateStatus = async (feedbackId: string, status: string) => {
    if (!user) return;
    try {
      await updateFeedbackStatus(feedbackId, status, resNotes, user);
      toast({ title: "Status Updated", description: `Feedback marked as ${status}.` });
      mutate();
      setSelectedFeedback(null);
      setResNotes('');
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Update Failed", description: e instanceof Error ? e.message : 'Update failed' });
    }
  };

  const handleGeneratePdfReport = useCallback(async () => {
    if (filteredFeedbacks.length === 0) {
      toast({ variant: "destructive", title: "No Data", description: "No records found for this time range." });
      return;
    }
    setIsGeneratingReport(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const periodLabel: Record<string, string> = { '7d': 'Last 7 Days', '30d': 'Last 30 Days', '90d': 'Last Quarter', '1y': 'Annual' };
      const period = dateRange?.from || dateRange?.to
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
        ['Network Satisfaction', `${metrics.networkSatisfaction}%`, metrics.networkResponses > 0 ? (metrics.networkSatisfaction >= 70 ? 'Strong' : 'Needs Attention') : 'No Network Data'],
        ['Net Promoter Score', `${metrics.nps}`, metrics.nps >= 30 ? 'Good' : 'Fair'],
        ['First Contact Resolution', `${metrics.ces}%`, metrics.ces >= 60 ? 'Good' : 'Needs Work'],
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
      const docWithTable = doc as unknown as { lastAutoTable: { finalY: number } };
      const deptY = docWithTable.lastAutoTable.finalY + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Department Performance', 14, deptY);

      const deptBody = departmentBreakdown.map(d => [
        d.name,
        d.total.toString(),
        d.avgRating,
        `${d.actioned} resolved`,
      ]);
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

      const regions = ['Ibadan', 'Abeokuta', 'Akure', 'Osogbo'];
      const regBody = regions.map(loc => {
        const count = filteredFeedbacks.filter((f: FeedbackDoc) => f.location === loc).length;
        const pct = metrics.total > 0 ? `${Math.round((count / metrics.total) * 100)}%` : '0%';
        return [loc, count.toString(), pct];
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
      doc.save(`IWorldNetworks_FeedbackReport_${dateRange?.from || dateRange?.to ? 'custom' : timeRange}_${new Date().toISOString().slice(0,10)}.pdf`);
      toast({ title: "PDF Report Downloaded", description: `${filteredFeedbacks.length} records exported.` });
    } catch (error: unknown) {
      console.error('PDF generation error:', error);
      toast({ variant: "destructive", title: "Export Failed", description: "Could not generate the PDF. Please try again." });
    } finally {
      setIsGeneratingReport(false);
    }
  }, [filteredFeedbacks, metrics, departmentBreakdown, timeRange, dateRange, toast]);

  return (
    <AdminLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary uppercase tracking-tight">Admin Dashboard</h1>
          <div className="flex items-center gap-2 mt-2 opacity-60">
            <Activity className="w-3 h-3 text-secondary" />
            <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold">Live Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Select value={dateRange ? 'custom' : timeRange} onValueChange={(val) => { if (val !== 'custom') { setTimeRange(val); setDateRange(undefined); } }}>
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
              if (range?.from || range?.to) setTimeRange('');
            }}
          />
          <Button onClick={handleGeneratePdfReport} disabled={isGeneratingReport} className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 shadow-lg hover:scale-105 transition-transform">
            {isGeneratingReport ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <FileDown className="w-3 h-3 mr-2" />}
            Download PDF Report
          </Button>
        </div>
      </header>



      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-12">
        {[
          { label: 'Overall Score', value: metrics.overallSatisfaction, unit: '%', icon: Users, color: 'text-secondary', detail: 'Average rating' },
          { label: 'Network Score', value: metrics.networkSatisfaction, unit: '%', icon: Activity, color: 'text-green-600', detail: `${metrics.networkResponses} network ratings` },
          { label: 'Would Recommend', value: metrics.nps, unit: '', icon: TrendingUp, color: 'text-green-600', detail: 'Happy customers' },
          { label: 'Resolved First Time', value: metrics.ces, unit: '%', icon: CheckCircle2, color: 'text-orange-500', detail: 'Fixed on first try' },
          { label: 'Resolved Issues', value: metrics.resolvedRate, unit: '%', icon: CheckCircle, color: 'text-green-600', detail: 'Issues resolved' },
        ].map((item, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl whisper-shadow border border-border group hover:border-secondary transition-all min-h-[184px]">
            <div className="flex justify-between items-start mb-5">
              <item.icon className={cn("w-6 h-6", item.color)} />
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <span className="font-mono text-[10px] text-on-surface-variant font-bold uppercase">LIVE</span>
              </div>
            </div>
            <p className="font-mono text-[10px] uppercase text-on-surface-variant mb-1 font-bold">{item.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-mono font-black text-primary">{item.value}</span>
              <span className="text-xl font-display text-on-surface-variant font-bold">{item.unit}</span>
            </div>
            <p className="mt-4 font-mono text-[9px] text-on-surface-variant/60 uppercase font-bold tracking-wider">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-12">
        <div className="col-span-12 lg:col-span-8 bg-white p-8 rounded-2xl whisper-shadow border border-border h-[400px]">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-8">Satisfaction Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorOverallSatisfaction" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#448515" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#448515" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorNetworkSatisfaction" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#111827" stopOpacity={0.08}/>
                    <stop offset="95%" stopColor="#111827" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }} />
                <Area type="monotone" dataKey="overallSatisfaction" name="Overall" stroke="#448515" fill="url(#colorOverallSatisfaction)" strokeWidth={3} connectNulls />
                <Area type="monotone" dataKey="networkSatisfaction" name="Network" stroke="#111827" fill="url(#colorNetworkSatisfaction)" strokeWidth={2} strokeDasharray="6 4" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white p-8 rounded-2xl whisper-shadow border border-border">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-8">Regional Pulse</h3>
          <div className="space-y-6">
            {['Ibadan', 'Abeokuta', 'Akure', 'Osogbo'].map((loc) => {
              const count = filteredFeedbacks.filter((f: FeedbackDoc) => f.location === loc).length;
              const percent = metrics.total > 0 ? (count / metrics.total) * 100 : 0;
              return (
                <div key={loc} className="space-y-2">
                  <div className="flex justify-between font-mono text-[10px] font-bold uppercase">
                    <span>{loc}</span>
                    <span className="text-secondary">{count} Feedbacks</span>
                  </div>
                  <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full" style={{ width: `${percent}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl whisper-shadow border border-border p-8 mb-12">
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
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold font-mono",
                      dept.actioned > 0 ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-500"
                    )}>
                      {dept.actioned} Resolved
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl whisper-shadow border border-border p-8 mb-24">
        <div className="flex items-center gap-3 mb-8">
          <History className="w-5 h-5 text-secondary" />
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">Recent Activity</h3>
        </div>
        <div className="space-y-4">
          {filteredFeedbacks.slice(0, 10).map((f: FeedbackDoc) => (
            <div key={f.id} className="group p-6 border border-border rounded-xl hover:border-secondary transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-surface-container-lowest">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase",
                    f.status === 'resolved' ? "bg-green-100 text-green-600" : 
                    f.status === 'open' ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50" : "bg-green-50 text-green-600 border border-green-200/50"
                  )}>
                    {f.status}
                  </span>
                  <span className="font-mono text-[10px] text-on-surface-variant uppercase font-bold">{f.category}</span>
                  <span className="text-[10px] text-on-surface-variant/40">{new Date(f.timestamp ?? 0).toLocaleDateString()}</span>
                </div>
                <p className="font-bold text-primary mb-1">{f.customerName} <span className="font-mono text-[10px] font-normal opacity-40 ml-2">({f.location})</span></p>
                <p className="text-sm text-on-surface-variant line-clamp-2 italic">"{f.comment}"</p>
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
                    <Button variant="outline" className="rounded-full px-6 font-mono text-[10px] uppercase font-bold" onClick={() => { setSelectedFeedback(f); setResNotes(f.resolutionNotes || ''); }}>
                      <MessageSquare className="w-3 h-3 mr-2" /> Review
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-3xl">
                    <DialogHeader>
                      <DialogTitle className="font-display uppercase tracking-tight">Handle Feedback</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                      <div className="p-4 bg-muted rounded-xl text-sm italic">"{f.comment}"</div>
                      <div className="space-y-2">
                        <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Resolution Notes</label>
                        <Textarea placeholder="What was done to resolve this issue?" className="min-h-[120px] rounded-2xl" value={resNotes} onChange={(e) => setResNotes(e.target.value)} />
                      </div>
                    </div>
                    <DialogFooter className="flex gap-2">
                      <Button variant="outline" className="rounded-full font-mono text-[10px] uppercase font-bold" onClick={() => handleUpdateStatus(f.id, 'escalated')}>Escalate</Button>
                      <Button className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8" onClick={() => handleUpdateStatus(f.id, 'resolved')}>
                        <CheckCircle2 className="w-3 h-3 mr-2" /> Mark Resolved
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))}
          {filteredFeedbacks.length === 0 && (
            <div className="py-20 text-center border-2 border-dashed border-border rounded-xl">
              <p className="font-mono text-sm text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">No feedback found for this period</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
