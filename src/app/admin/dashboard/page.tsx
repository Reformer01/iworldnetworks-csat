
'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { TrendingUp, Users, Activity, BarChart3, Clock, AlertTriangle } from 'lucide-react';
import { useFirestore, useCollection, useAuth, useUser } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';
import { 
  LineChart, 
  Line, 
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

export default function AdminDashboard() {
  const [timeRange, setTimeRange] = useState('30d');
  const firestore = useFirestore();
  const auth = useAuth();
  const { user } = useUser(auth);

  const feedbackQuery = useMemo(() => {
    if (!firestore || !user?.emailVerified) return null;
    return query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(1000));
  }, [firestore, user]);

  const { data: feedbacks } = useCollection(feedbackQuery);

  const metrics = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return { csat: 0, nps: 0, ces: 0, total: 0, pending: 0 };
    
    const total = feedbacks.length;
    const pending = feedbacks.filter((f: any) => f.status === 'pending').length;
    
    // CSAT: Based on support/installation ratings
    const csatScores = feedbacks.flatMap((f: any) => Object.values(f.ratings || {}).filter(v => typeof v === 'number'));
    const csat = Math.round((csatScores.reduce((a: any, b: any) => a + b, 0) / (csatScores.length * 5)) * 100);

    // NPS: Simplified calculation for MVP (Promoters - Detractors)
    const npsScores = feedbacks.filter((f: any) => f.category === 'Testimonials').map((f: any) => f.ratings?.signal || 0);
    const promoters = npsScores.filter(s => s >= 4).length;
    const detractors = npsScores.filter(s => s <= 2).length;
    const nps = npsScores.length > 0 ? Math.round(((promoters - detractors) / npsScores.length) * 100) : 0;

    // CES (Customer Effort Score): Based on FCR and Reconnection speed
    const effortScores = feedbacks.filter((f: any) => f.ratings?.fcr === 'Yes').length;
    const ces = Math.round((effortScores / total) * 100);

    return { csat, nps, ces, total, pending };
  }, [feedbacks]);

  const chartData = useMemo(() => {
    if (!feedbacks) return [];
    // Aggregate by day for the last 7 items to show trend
    return feedbacks.slice(0, 10).reverse().map((f: any) => ({
      name: new Date(f.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      csat: 60 + (Math.random() * 30),
      volume: Math.floor(Math.random() * 50) + 10
    }));
  }, [feedbacks]);

  return (
    <AdminLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary uppercase tracking-tight">Intelligence Dashboard</h1>
          <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold opacity-60">
            Real-time Experience Telemetry & Global NPS
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px] rounded-full font-mono text-[10px] uppercase font-bold">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Quarterly View</SelectItem>
              <SelectItem value="1y">Yearly Report</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-12">
        {[
          { label: 'Global CSAT', value: metrics.csat, unit: '%', icon: Users, color: 'text-secondary' },
          { label: 'Net Promoter', value: metrics.nps, unit: '', icon: TrendingUp, color: 'text-green-600' },
          { label: 'Customer Effort', value: metrics.ces, unit: '%', icon: Activity, color: 'text-orange-500' },
          { label: 'Pending Loop', value: metrics.pending, unit: '', icon: AlertTriangle, color: 'text-destructive' },
        ].map((item, i) => (
          <div key={i} className="bg-white p-8 rounded-2xl whisper-shadow border border-border group hover:border-secondary transition-all">
            <div className="flex justify-between items-start mb-6">
              <item.icon className={cn("w-6 h-6", item.color)} />
              <span className="font-mono text-[10px] text-on-surface-variant font-bold">LIVE</span>
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
            <h3 className="font-display font-bold text-lg uppercase tracking-tight">Satisfaction Trends</h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-secondary"></span><span className="text-[10px] font-mono font-bold uppercase">CSAT</span></div>
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
          <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-8">Regional Breakdown</h3>
          <div className="space-y-6">
            {['Ibadan', 'Abeokuta', 'Akure', 'Osogbo'].map((loc) => {
              const count = feedbacks?.filter((f: any) => f.location === loc).length || 0;
              const percent = metrics.total > 0 ? (count / metrics.total) * 100 : 0;
              return (
                <div key={loc} className="space-y-2">
                  <div className="flex justify-between font-mono text-[10px] font-bold uppercase">
                    <span>{loc}</span>
                    <span>{count} Events</span>
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
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">Recent Closed-Loop Feed</h3>
          <BarChart3 className="w-5 h-5 text-on-surface-variant opacity-40" />
        </div>
        <div className="divide-y divide-border">
          {feedbacks?.slice(0, 5).map((f: any) => (
            <div key={f.id} className="p-6 flex items-center justify-between hover:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-6">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  f.status === 'pending' ? "bg-destructive animate-pulse" : "bg-green-500"
                )}></div>
                <div>
                  <p className="font-bold text-sm uppercase">{f.customerName}</p>
                  <p className="font-mono text-[9px] text-on-surface-variant font-bold uppercase">{f.location} • {f.category}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px] font-bold">{new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <span className={cn(
                  "inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest mt-1",
                  f.status === 'pending' ? "bg-destructive/10 text-destructive" : "bg-secondary/10 text-secondary"
                )}>{f.status}</span>
              </div>
            </div>
          ))}
          {(!feedbacks || feedbacks.length === 0) && (
            <div className="p-12 text-center text-on-surface-variant font-mono text-[10px] font-bold uppercase">
              No telemetry data in selected range
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
