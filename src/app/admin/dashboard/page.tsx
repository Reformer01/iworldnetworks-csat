'use client';

import React, { useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { TrendingUp, Headset, Wrench, AlertCircle, Wifi, Activity } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LineChart,
  Line
} from 'recharts';

export default function AdminDashboard() {
  const infraImg = PlaceHolderImages.find(img => img.id === 'infra-status')!;
  const firestore = useFirestore();

  const feedbackQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(100));
  }, [firestore]);

  const { data: feedbacks, loading } = useCollection(feedbackQuery);

  const stats = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return { csat: '0', total: 0, growth: '+0%' };
    
    const total = feedbacks.length;
    const highRatings = feedbacks.filter((f: any) => {
      const ratingVals = Object.values(f.ratings || {}).map(v => Number(v));
      if (ratingVals.length === 0) return false;
      const avg = ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length;
      return avg >= 4;
    }).length;

    return {
      csat: ((highRatings / total) * 100).toFixed(1),
      total,
      growth: '+2.4%'
    };
  }, [feedbacks]);

  const regionalChartData = useMemo(() => {
    const counts: Record<string, number> = { Abeokuta: 0, Ibadan: 0, Osogbo: 0, Akure: 0 };
    if (!feedbacks) return Object.entries(counts).map(([name, value]) => ({ name, value }));
    
    feedbacks.forEach((f: any) => {
      if (counts[f.location] !== undefined) counts[f.location]++;
    });
    
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [feedbacks]);

  const timelineData = useMemo(() => {
    // Simulated activity for visual restoration
    return [
      { name: 'Mon', satisfaction: 85, reliability: 92 },
      { name: 'Tue', satisfaction: 88, reliability: 89 },
      { name: 'Wed', satisfaction: 92, reliability: 95 },
      { name: 'Thu', satisfaction: 89, reliability: 91 },
      { name: 'Fri', satisfaction: 94, reliability: 94 },
      { name: 'Sat', satisfaction: 90, reliability: 88 },
      { name: 'Sun', satisfaction: 93, reliability: 96 },
    ];
  }, []);

  return (
    <AdminLayout>
      <section className="mb-12 flex justify-between items-end">
        <div className="max-w-2xl">
          <h1 className="font-display text-display-lg text-primary tracking-tight mb-2">Operational Overview</h1>
          <p className="text-on-surface-variant font-body-lg">Real-time monitoring for the I-World backbone across regional nodes.</p>
        </div>
        <div className="flex gap-4 items-center font-mono text-label-mono text-on-surface-variant">
          <span className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-border whisper-shadow">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Network Stable
          </span>
          <span className="bg-white px-4 py-2 rounded-full border border-border whisper-shadow">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: '2026' })}
          </span>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-gutter mb-gutter">
        <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-label-mono text-on-surface-variant uppercase mb-4">CSAT Index</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[56px] leading-none font-bold text-primary">{stats.csat}</span>
            <span className="font-mono text-display-xl text-primary">%</span>
          </div>
          <div className="mt-6 flex items-center gap-2 text-secondary">
            <TrendingUp className="w-5 h-5" />
            <span className="font-mono text-label-mono">{stats.growth} this month</span>
          </div>
        </div>

        <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-label-mono text-on-surface-variant uppercase mb-4">Total Responses</p>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[56px] leading-none font-bold text-primary">{stats.total}</span>
          </div>
          <p className="mt-6 text-on-surface-variant font-body-md">Active feedback cycles</p>
        </div>

        <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-label-mono text-on-surface-variant uppercase mb-4">Network Uptime</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[56px] leading-none font-bold text-secondary">99.8</span>
            <span className="font-mono text-display-xl text-secondary">%</span>
          </div>
          <p className="mt-6 text-on-surface-variant font-body-md">Core node consistency</p>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-gutter mt-16 pb-24">
        <div className="col-span-12 lg:col-span-8 space-y-gutter">
          <div className="bg-white p-10 border border-border whisper-shadow rounded-xl h-[500px] flex flex-col">
            <div className="flex justify-between items-center mb-12">
              <div>
                <h3 className="font-headline text-[24px] text-primary font-bold">Performance Trends</h3>
                <p className="text-on-surface-variant font-mono text-xs uppercase tracking-widest">Real-time Node Activity</p>
              </div>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-secondary"></div>
                  <span className="font-mono text-xs">Reliability</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="font-mono text-xs">Satisfaction</span>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666' }} />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #eee', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Line type="monotone" dataKey="reliability" stroke="#0058be" strokeWidth={3} dot={{ r: 4, fill: '#0058be' }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="satisfaction" stroke="#000000" strokeWidth={3} dot={{ r: 4, fill: '#000000' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
            <h3 className="font-mono text-label-mono uppercase mb-8">Node Activity Stream</h3>
            <div className="space-y-4">
              {feedbacks?.map((item: any) => {
                const isRisk = Object.values(item.ratings || {}).some((v: any) => Number(v) <= 2);
                return (
                  <div key={item.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center">
                        {item.category === 'Installation' ? <Wrench className="w-5 h-5 text-secondary" /> : <Activity className="w-5 h-5 text-secondary" />}
                      </div>
                      <div>
                        <p className="font-body font-bold">{item.customerName || 'Subscriber'}</p>
                        <p className="font-mono text-xs text-on-surface-variant">{item.location} • {item.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isRisk && (
                        <Badge variant="destructive" className="animate-pulse flex gap-1 items-center bg-destructive text-white rounded-full">
                          <AlertCircle className="w-3 h-3" /> Churn Risk
                        </Badge>
                      )}
                      <span className="font-mono text-xs font-bold text-on-surface-variant">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
              {(!feedbacks || feedbacks.length === 0) && !loading && (
                <p className="text-center text-on-surface-variant py-12 font-mono text-sm">No activity recorded yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 lg:col-start-9 space-y-gutter">
          <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
            <h4 className="font-mono text-label-mono uppercase mb-8">Volume by Region</h4>
            <div className="h-64 mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionalChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#333', fontWeight: 'bold' }} width={80} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                    {regionalChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#0058be' : '#000'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {regionalChartData.map((item, i) => (
                <div key={item.name} className="flex justify-between text-xs font-mono">
                  <span className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", i === 0 ? "bg-secondary" : "bg-primary")}></span> {item.name}</span>
                  <span>{stats.total > 0 ? ((item.value / stats.total) * 100).toFixed(1) : 0}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden h-64 whisper-shadow relative group">
            <Image src={infraImg.imageUrl} alt="Infrastructure" fill className="object-cover grayscale brightness-90 group-hover:grayscale-0 transition-all duration-700" data-ai-hint="data center" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-6">
              <p className="text-white font-headline text-[20px]">Regional Data Node</p>
              <span className="text-white font-mono text-xs uppercase tracking-widest opacity-80">Infrastructure Status: Stable</span>
            </div>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}
