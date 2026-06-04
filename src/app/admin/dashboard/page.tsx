
'use client';

import React, { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { TrendingUp, Users, Activity, BarChart3, AlertTriangle, Calendar, Sparkles, Loader2 } from 'lucide-react';
import { useFirestore, useCollection, useAuth, useUser } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { generateReportExecutiveSummary } from '@/ai/flows/generate-report-executive-summary-flow';
import { useToast } from '@/hooks/use-toast';

export default function AdminDashboard() {
  const [timeRange, setTimeRange] = useState('30d');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  
  const firestore = useFirestore();
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();

  const feedbackQuery = useMemo(() => {
    if (!firestore || !user?.emailVerified) return null;
    return query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(1000));
  }, [firestore, user]);

  const { data: allFeedbacks } = useCollection(feedbackQuery);

  // Filter feedbacks based on timeRange
  const filteredFeedbacks = useMemo(() => {
    if (!allFeedbacks) return [];
    
    const now = Date.now();
    const rangeMs = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    }[timeRange] || 30 * 24 * 60 * 60 * 1000;

    return allFeedbacks.filter((f: any) => (now - f.timestamp) <= rangeMs);
  }, [allFeedbacks, timeRange]);

  const metrics = useMemo(() => {
    const total = filteredFeedbacks.length;
    if (total === 0) return { csat: 0, nps: 0, ces: 0, total: 0, pending: 0 };
    
    const pending = filteredFeedbacks.filter((f: any) => f.status === 'pending').length;
    
    // CSAT: Average of all ratings
    const allRatings = filteredFeedbacks.flatMap((f: any) => Object.values(f.ratings || {}).filter(v => typeof v === 'number'));
    const csat = allRatings.length > 0 ? Math.round((allRatings.reduce((a: any, b: any) => a + b, 0) / (allRatings.length * 5)) * 100) : 0;

    // NPS: (Promoters % - Detractors %)
    const promoters = filteredFeedbacks.filter((f: any) => {
      const scores = Object.values(f.ratings || {}).filter(v => typeof v === 'number') as number[];
      return scores.some(s => s >= 4);
    }).length;
    
    const detractors = filteredFeedbacks.filter((f: any) => {
      const scores = Object.values(f.ratings || {}).filter(v => typeof v === 'number') as number[];
      return scores.every(s => s <= 2) && scores.length > 0;
    }).length;

    const nps = Math.round(((promoters - detractors) / total) * 100);

    // CES (Customer Effort Score): Based on FCR %
    const fcrYes = filteredFeedbacks.filter((f: any) => f.ratings?.fcr === 'Yes').length;
    const ces = Math.round((fcrYes / total) * 100);

    return { csat, nps, ces, total, pending };
  }, [filteredFeedbacks]);

  const chartData = useMemo(() => {
    if (filteredFeedbacks.length === 0) return [];
    
    const groups: Record<string, { csat: number, count: number }> = {};
    
    filteredFeedbacks.slice(0, 30).forEach((f: any) => {
      const date = new Date(f.timestamp);
      const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      
      const ratings = Object.values(f.ratings || {}).filter(v => typeof v === 'number') as number[];
      const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / (ratings.length * 5) * 100 : 75;
      
      if (!groups[label]) groups[label] = { csat: 0, count: 0 };
      groups[label].csat += avg;
      groups[label].count += 1;
    });

    return Object.entries(groups).map(([name, data]) => ({
      name,
      csat: Math.round(data.csat / data.count)
    })).reverse();
  }, [filteredFeedbacks]);

  const handleGenerateReport = async () => {
    if (filteredFeedbacks.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "Insufficient data in the current time range to generate a report.",
      });
      return;
    }

    setIsGeneratingReport(true);
    setAiReport(null);
    try {
      const summaryData = filteredFeedbacks.map((f: any) => ({
        location: f.location,
        category: f.category,
        sentiment: f.aiAnalysis?.sentiment,
        comment: f.comment,
        date: new Date(f.timestamp).toLocaleDateString()
      }));

      const result = await generateReportExecutiveSummary({ 
        operationalData: JSON.stringify(summaryData) 
      });
      
      setAiReport(result.summary);
      toast({
        title: "Report Generated",
        description: "AI Executive summary is ready.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: "Could not generate AI report. Please try again.",
      });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <AdminLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary uppercase tracking-tight">Intelligence Dashboard</h1>
          <div className="flex items-center gap-2 mt-2 opacity-60">
            <Calendar className="w-3 h-3 text-secondary" />
            <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold">
              Reporting: 2026 Telemetry Engine Active
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px] rounded-full font-mono text-[10px] uppercase font-bold bg-white">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="1y">Full Year Insight</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={handleGenerateReport} 
            disabled={isGeneratingReport}
            className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold flex items-center gap-2"
          >
            {isGeneratingReport ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Generate AI Report
          </Button>
        </div>
      </header>

      {aiReport && (
        <div className="mb-12 bg-secondary/5 border border-secondary/20 p-8 rounded-2xl whisper-shadow animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-5 h-5 text-secondary" />
            <h3 className="font-display font-bold text-lg uppercase tracking-tight text-secondary">AI Executive Summary ({timeRange})</h3>
          </div>
          <p className="font-body-md text-on-surface-variant leading-relaxed italic">
            "{aiReport}"
          </p>
          <Button variant="ghost" className="mt-6 text-[10px] font-mono uppercase font-bold text-secondary p-0 hover:bg-transparent" onClick={() => setAiReport(null)}>Dismiss Summary</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-12">
        {[
          { label: 'Global CSAT', value: metrics.csat, unit: '%', icon: Users, color: 'text-secondary' },
          { label: 'Net Promoter', value: metrics.nps, unit: '', icon: TrendingUp, color: 'text-green-600' },
          { label: 'Customer Effort', value: metrics.ces, unit: '%', icon: Activity, color: 'text-orange-500' },
          { label: 'Active Loops', value: metrics.pending, unit: '', icon: AlertTriangle, color: 'text-destructive' },
        ].map((item, i) => (
          <div key={i} className="bg-white p-8 rounded-2xl whisper-shadow border border-border group hover:border-secondary transition-all">
            <div className="flex justify-between items-start mb-6">
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
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-12">
        <div className="col-span-12 lg:col-span-8 bg-white p-8 rounded-2xl whisper-shadow border border-border h-[400px]">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="font-display font-bold text-lg uppercase tracking-tight">Satisfaction Trends</h3>
              <p className="font-mono text-[10px] opacity-40 uppercase font-bold">Time Window Analysis: {timeRange}</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCsat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0058be" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#0058be" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="csat" stroke="#0058be" fill="url(#colorCsat)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white p-8 rounded-2xl whisper-shadow border border-border">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-8">Regional Pulse</h3>
          <div className="space-y-6">
            {['Ibadan', 'Abeokuta', 'Akure', 'Osogbo'].map((loc) => {
              const count = filteredFeedbacks.filter((f: any) => f.location === loc).length;
              const percent = metrics.total > 0 ? (count / metrics.total) * 100 : 0;
              return (
                <div key={loc} className="space-y-2">
                  <div className="flex justify-between font-mono text-[10px] font-bold uppercase">
                    <span>{loc} Hub</span>
                    <span className="text-secondary">{count} Events</span>
                  </div>
                  <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full transition-all duration-1000" style={{ width: `${percent}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl whisper-shadow border border-border overflow-hidden mb-24">
        <div className="p-8 border-b border-border flex justify-between items-center bg-surface-container-lowest">
          <div>
            <h3 className="font-display font-bold text-lg uppercase tracking-tight">Recent Telemetry Heartbeat</h3>
            <p className="font-mono text-[10px] opacity-40 uppercase font-bold mt-1">Real-time resolution feed</p>
          </div>
          <BarChart3 className="w-5 h-5 text-on-surface-variant opacity-40" />
        </div>
        <div className="divide-y divide-border">
          {filteredFeedbacks.slice(0, 10).map((f: any) => (
            <div key={f.id} className="p-6 flex items-center justify-between hover:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-6">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  f.status === 'pending' ? "bg-destructive animate-pulse" : "bg-green-500"
                )}></div>
                <div>
                  <p className="font-bold text-sm uppercase tracking-tight">{f.customerName}</p>
                  <p className="font-mono text-[9px] text-on-surface-variant font-bold uppercase">{f.location} • {f.category} • {f.servicePlan}</p>
                </div>
              </div>
              <div className="text-right flex items-center gap-8">
                <div className="hidden md:block">
                  <p className="font-mono text-[10px] font-bold opacity-60">SENTIMENT</p>
                  <span className={cn(
                    "inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                    f.aiAnalysis?.sentiment === 'positive' ? "bg-green-100 text-green-700" : 
                    f.aiAnalysis?.sentiment === 'negative' ? "bg-destructive/10 text-destructive" : 
                    "bg-slate-100 text-slate-600"
                  )}>{f.aiAnalysis?.sentiment || 'Analyzing'}</span>
                </div>
                <div className="min-w-[100px]">
                  <p className="font-mono text-[10px] font-bold">
                    {new Date(f.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </p>
                  <p className="font-mono text-[9px] text-on-surface-variant opacity-60">
                    {new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {filteredFeedbacks.length === 0 && (
            <div className="p-12 text-center text-on-surface-variant font-mono text-[10px] font-bold uppercase opacity-20">
              No telemetry found for this time range.
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
