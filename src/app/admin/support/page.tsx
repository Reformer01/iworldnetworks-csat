
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Clock, ShieldCheck, Brain, ArrowDown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export default function AdminSupport() {
  const [barsAnimated, setBarsAnimated] = useState(false);
  const firestore = useFirestore();

  const feedbackQuery = useMemo(() => firestore ? query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(500)) : null, [firestore]);
  const { data: feedbacks } = useCollection(feedbackQuery);

  const stats = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return { professionalism: '0', clarity: '0', fcrRate: 0, sentiment: { pos: 0, neu: 0, frust: 0 } };
    
    const supportItems = feedbacks.filter((f: any) => f.category === 'Support');
    if (supportItems.length === 0) return { professionalism: '5.0', clarity: '5.0', fcrRate: 100, sentiment: { pos: 100, neu: 0, frust: 0 } };

    const totalProf = supportItems.reduce((acc, f: any) => acc + Number(f.ratings?.professionalism || 0), 0);
    const totalClarity = supportItems.reduce((acc, f: any) => acc + Number(f.ratings?.clarity || 0), 0);
    const fcrCount = supportItems.filter((f: any) => f.ratings?.fcr === 'Yes').length;

    const pos = supportItems.filter((f: any) => Number(f.ratings?.professionalism || 0) >= 4).length;
    const frust = supportItems.filter((f: any) => Number(f.ratings?.professionalism || 0) <= 2).length;
    const neu = supportItems.length - pos - frust;

    return {
      professionalism: (totalProf / supportItems.length).toFixed(1),
      clarity: (totalClarity / supportItems.length).toFixed(1),
      fcrRate: Math.round((fcrCount / supportItems.length) * 100),
      sentiment: {
        pos: Math.round((pos / supportItems.length) * 100),
        neu: Math.round((neu / supportItems.length) * 100),
        frust: Math.round((frust / supportItems.length) * 100)
      }
    };
  }, [feedbacks]);

  const volumeData = useMemo(() => [
    { date: 'Mon', tickets: 45 }, { date: 'Tue', tickets: 52 }, { date: 'Wed', tickets: 48 },
    { date: 'Thu', tickets: 61 }, { date: 'Fri', tickets: 55 }, { date: 'Sat', tickets: 67 }, { date: 'Sun', tickets: 59 },
  ], []);

  useEffect(() => {
    const timer = setTimeout(() => setBarsAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AdminLayout>
      <div className="mb-12">
        <p className="font-mono text-label-mono text-secondary mb-2 uppercase text-[10px]">Head of Support: Adeolu</p>
        <h1 className="font-display text-3xl md:text-display-lg text-primary tracking-tight mb-2">Support Desk Review</h1>
        <p className="text-on-surface-variant mt-2 max-w-2xl font-body-md">Detailed performance and sentiment analysis for our customer engagement teams.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-12">
        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <Clock className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Avg Response</p>
          <h3 className="font-mono text-4xl font-black mt-2">18m</h3>
          <div className="flex items-center gap-2 mt-4 text-green-600 font-bold text-xs"><Zap className="w-4 h-4" /> Within target</div>
        </div>

        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <ShieldCheck className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Team Helpful</p>
          <h3 className="font-mono text-4xl font-black mt-2">{stats.professionalism}/5</h3>
          <p className="text-on-surface-variant mt-2 text-[10px]">Customer Rating</p>
        </div>

        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <Brain className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">FCR Rate</p>
          <h3 className="font-mono text-4xl font-black mt-2">{stats.fcrRate}%</h3>
          <div className="w-full bg-muted h-1 rounded-full mt-6">
            <div className="bg-secondary h-1 rounded-full transition-all duration-1000" style={{ width: `${stats.fcrRate}%` }}></div>
          </div>
        </div>

        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <Zap className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Clarity Score</p>
          <h3 className="font-mono text-4xl font-black mt-2">{stats.clarity}/5</h3>
          <p className="text-on-surface-variant mt-2 text-[10px]">Explain quality</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-24">
        <div className="col-span-12 lg:col-span-8 bg-white p-8 border border-border whisper-shadow rounded-xl h-[450px] flex flex-col">
          <h4 className="font-display text-xl text-primary font-bold mb-10">Ticket Volume Trend</h4>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeData}>
                <defs><linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0058be" stopOpacity={0.1}/><stop offset="95%" stopColor="#0058be" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="tickets" stroke="#0058be" fill="url(#colorTickets)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl">
          <h4 className="font-display text-xl mb-8 text-primary font-bold">Feedback Sentiment</h4>
          <div className="space-y-6">
            {[
              { label: 'Positive', val: stats.sentiment.pos, color: 'bg-secondary' },
              { label: 'Neutral', val: stats.sentiment.neu, color: 'bg-slate-400' },
              { label: 'Frustrated', val: stats.sentiment.frust, color: 'bg-destructive' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider">{item.label}</span>
                  <span className="font-bold text-xs">{item.val}%</span>
                </div>
                <div className="w-full bg-muted h-3 rounded-full overflow-hidden">
                  <div className={cn("h-full transition-all duration-1000", item.color)} style={{ width: barsAnimated ? `${item.val}%` : '0%' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
