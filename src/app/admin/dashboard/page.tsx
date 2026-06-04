
'use client';

import React, { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { TrendingUp, Users, Activity, BarChart3, AlertTriangle, Calendar, Sparkles, Loader2, Clock, CheckCircle2, MoreVertical, MessageSquare } from 'lucide-react';
import { useFirestore, useCollection, useAuth, useUser } from '@/firebase';
import { collection, query, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export default function AdminDashboard() {
  const [timeRange, setTimeRange] = useState('30d');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [resNotes, setResNotes] = useState('');
  
  const firestore = useFirestore();
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();

  const feedbackQuery = useMemo(() => {
    if (!firestore || !user?.emailVerified) return null;
    return query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(1000));
  }, [firestore, user]);

  const { data: allFeedbacks } = useCollection(feedbackQuery);

  const filteredFeedbacks = useMemo(() => {
    if (!allFeedbacks) return [];
    
    const now = Date.now();
    const rangeMs = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    }[timeRange as keyof typeof rangeMs] || 30 * 24 * 60 * 60 * 1000;

    return allFeedbacks.filter((f: any) => (now - f.timestamp) <= rangeMs);
  }, [allFeedbacks, timeRange]);

  const metrics = useMemo(() => {
    const total = filteredFeedbacks.length;
    if (total === 0) return { csat: 0, nps: 0, ces: 0, total: 0, pending: 0 };
    
    const pending = filteredFeedbacks.filter((f: any) => f.status === 'pending').length;
    
    // CSAT Calculation
    const allRatings = filteredFeedbacks.flatMap((f: any) => Object.values(f.ratings || {}).filter(v => typeof v === 'number'));
    const csat = allRatings.length > 0 ? Math.round((allRatings.reduce((a: any, b: any) => a + b, 0) / (allRatings.length * 5)) * 100) : 0;

    // NPS Logic: 5 = Promoter, 1-3 = Detractor, 4 = Neutral
    const promoters = filteredFeedbacks.filter((f: any) => {
      const scores = Object.values(f.ratings || {}).filter(v => typeof v === 'number') as number[];
      return scores.some(s => s === 5);
    }).length;
    
    const detractors = filteredFeedbacks.filter((f: any) => {
      const scores = Object.values(f.ratings || {}).filter(v => typeof v === 'number') as number[];
      return scores.every(s => s <= 3) && scores.length > 0;
    }).length;

    const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

    // CES Calculation (First Contact Resolution)
    const fcrYes = filteredFeedbacks.filter((f: any) => f.ratings?.fcr === 'Yes').length;
    const ces = total > 0 ? Math.round((fcrYes / total) * 100) : 0;

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

  const handleUpdateStatus = async (feedbackId: string, status: string) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'feedbacks', feedbackId), { 
        status, 
        resolutionNotes: resNotes 
      });
      toast({ title: "Loop Updated", description: `Feedback marked as ${status}.` });
      setSelectedFeedback(null);
      setResNotes('');
    } catch (e) {
      toast({ variant: "destructive", title: "Update Failed" });
    }
  };

  const handleGenerateReport = async () => {
    if (filteredFeedbacks.length === 0) {
      toast({
        variant: "destructive",
        title: "Insufficient Data",
        description: "No records found in this time range.",
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
        serviceDate: f.serviceDate
      }));

      const result = await generateReportExecutiveSummary({ 
        operationalData: JSON.stringify(summaryData) 
      });
      
      setAiReport(result.summary);
      toast({ title: "Intelligence Report Generated" });
    } catch (error) {
      toast({ variant: "destructive", title: "AI Generation Failed" });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <AdminLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary uppercase tracking-tight">Enterprise Telemetry Hub</h1>
          <div className="flex items-center gap-2 mt-2 opacity-60">
            <Activity className="w-3 h-3 text-secondary" />
            <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold">
              Real-time Satisfaction Engine Active
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px] rounded-full font-mono text-[10px] uppercase font-bold bg-white border-border">
              <SelectValue placeholder="Reporting Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Quarterly Pulse</SelectItem>
              <SelectItem value="1y">Annual Insight</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={handleGenerateReport} 
            disabled={isGeneratingReport}
            className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 shadow-lg hover:scale-105 transition-transform"
          >
            {isGeneratingReport ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Sparkles className="w-3 h-3 mr-2" />}
            AI Report
          </Button>
        </div>
      </header>

      {aiReport && (
        <div className="mb-12 bg-primary text-white p-10 rounded-3xl whisper-shadow border border-white/10 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-secondary rounded-2xl">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-xl uppercase tracking-widest">AI Strategic Summary</h3>
              <p className="font-mono text-[10px] text-white/40 uppercase font-bold">Period: {timeRange}</p>
            </div>
          </div>
          <p className="font-body-md text-white/80 leading-relaxed italic text-lg max-w-4xl">
            "{aiReport}"
          </p>
          <Button variant="ghost" className="mt-10 text-[10px] font-mono uppercase font-bold text-secondary hover:text-white" onClick={() => setAiReport(null)}>Dismiss Analysis</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-12">
        {[
          { label: 'Network CSAT', value: metrics.csat, unit: '%', icon: Users, color: 'text-secondary' },
          { label: 'Net Promoter', value: metrics.nps, unit: '', icon: TrendingUp, color: 'text-green-600' },
          { label: 'Customer Effort', value: metrics.ces, unit: '%', icon: Activity, color: 'text-orange-500' },
          { label: 'Pending Loops', value: metrics.pending, unit: '', icon: AlertTriangle, color: 'text-destructive' },
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
              <p className="font-mono text-[10px] opacity-40 uppercase font-bold mt-1">Daily Satisfaction Mapping</p>
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
                    <span className="text-secondary">{count} Feedbacks</span>
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

      <div className="bg-white rounded-3xl whisper-shadow border border-border overflow-hidden mb-24">
        <div className="p-8 border-b border-border flex justify-between items-center bg-surface-container-lowest">
          <div>
            <h3 className="font-display font-bold text-lg uppercase tracking-tight">Recent Resolutions Feed</h3>
            <p className="font-mono text-[10px] opacity-40 uppercase font-bold mt-1">Closed-loop Management</p>
          </div>
          <BarChart3 className="w-5 h-5 text-on-surface-variant opacity-40" />
        </div>
        <div className="divide-y divide-border">
          {filteredFeedbacks.slice(0, 10).map((f: any) => (
            <div key={f.id} className="p-8 flex items-center justify-between hover:bg-surface-container-low transition-colors group">
              <div className="flex items-center gap-6">
                <div className={cn(
                  "w-2.5 h-2.5 rounded-full",
                  f.status === 'pending' ? "bg-destructive animate-pulse" : "bg-green-500"
                )}></div>
                <div className="flex flex-col">
                  <p className="font-bold text-sm uppercase tracking-tight text-primary">{f.customerName}</p>
                  <div className="flex items-center gap-2 font-mono text-[9px] text-on-surface-variant font-bold uppercase">
                    <span>{f.location} • {f.category}</span>
                    {f.serviceDate && (
                      <span className="flex items-center gap-1 text-secondary">
                        <Calendar className="w-2.5 h-2.5" /> Experience: {f.serviceDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-12">
                <div className="hidden md:flex flex-col items-end">
                   <p className="font-mono text-[9px] font-bold opacity-40 uppercase mb-1">Status</p>
                   <span className={cn(
                    "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest",
                    f.status === 'resolved' ? "bg-green-100 text-green-700" : "bg-destructive/10 text-destructive"
                  )}>{f.status}</span>
                </div>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-full h-8 font-mono text-[8px] uppercase font-bold border-border/50">
                      Manage Loop
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-3xl border-none p-10 whisper-shadow max-w-xl">
                    <DialogHeader className="mb-6">
                      <DialogTitle className="font-display text-2xl font-bold uppercase tracking-tight">Resolve Feedback</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div className="p-6 bg-surface-container-low rounded-2xl border border-border/50">
                        <p className="font-mono text-[10px] uppercase font-bold text-secondary mb-2">Customer Context</p>
                        <p className="text-sm font-bold italic">"{f.comment}"</p>
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-[10px] uppercase font-bold">Resolution Notes</label>
                        <Textarea 
                          placeholder="What actions were taken to close the loop?" 
                          className="rounded-2xl border-border min-h-[120px] font-bold"
                          defaultValue={f.resolutionNotes}
                          onChange={(e) => setResNotes(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter className="mt-10 gap-2">
                      <Button variant="ghost" onClick={() => handleUpdateStatus(f.id, 'reviewed')} className="rounded-full font-mono text-[10px] uppercase font-bold">Mark Reviewed</Button>
                      <Button onClick={() => handleUpdateStatus(f.id, 'resolved')} className="bg-secondary text-white rounded-full px-8 font-mono text-[10px] uppercase font-bold">Close Loop</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))}
          {filteredFeedbacks.length === 0 && (
            <div className="p-20 text-center text-on-surface-variant font-mono text-[10px] font-bold uppercase opacity-20">
              Waiting for telemetry sync...
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
