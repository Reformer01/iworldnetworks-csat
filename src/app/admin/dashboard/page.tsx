'use client';

import React, { useMemo, useEffect, useState } from 'react';
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
  const [mounted, setMounted] = useState(false);
  const infraImg = PlaceHolderImages.find(img => img.id === 'infra-status')!;
  const firestore = useFirestore();

  useEffect(() => {
    setMounted(true);
  }, []);

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
      <section className="mb-8 md:mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="max-w-2xl">
          <p className="font-mono text-label-mono text-secondary mb-2 uppercase text-xs">Head of NOC: Gyang</p>
          <h1 className="font-display text-3xl md:text-display-lg text-primary tracking-tight mb-2">Operational Overview</h1>
          <p className="text-on-surface-variant font-body-md text-sm md:text-base">Real-time monitoring for the I-World backbone across regional hubs.</p>
        </div>
        <div className="flex flex-wrap gap-4 items-center font-mono text-label-mono text-on-surface-variant">
          <span className="flex items-center gap-2 bg-white px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-border whisper-shadow text-[10px] md:text-xs">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Network Stable
          </span>
          <span className="bg-white px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-border whisper-shadow text-[10px] md:text-xs">
            {mounted ? new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) + ', 2026' : '---'}
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-gutter mb-6 md:mb-gutter">
        <div className="bg-white p-6 md:p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-[10px] md:text-label-mono text-on-surface-variant uppercase mb-4">CSAT Index</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl md:text-[56px] leading-none font-bold text-primary">{stats.csat}</span>
            <span className="font-mono text-xl md:text-display-xl text-primary">%</span>
          </div>
          <div className="mt-4 md:mt-6 flex items-center gap-2 text-secondary">
            <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
            <span className="font-mono text-[10px] md:text-label-mono">{stats.growth} this month</span>
          </div>
        </div>

        <div className="bg-white p-6 md:p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-[10px] md:text-label-mono text-on-surface-variant uppercase mb-4">Total Responses</p>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-4xl md:text-[56px] leading-none font-bold text-primary">{stats.total}</span>
          </div>
          <p className="mt-4 md:mt-6 text-on-surface-variant text-sm font-body-md">Active feedback cycles</p>
        </div>

        <div className="bg-white p-6 md:p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-[10px] md:text-label-mono text-on-surface-variant uppercase mb-4">Network Uptime</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl md:text-[56px] leading-none font-bold text-secondary">99.8</span>
            <span className="font-mono text-xl md:text-display-xl text-secondary">%</span>
          </div>
          <p className="mt-4 md:mt-6 text-on-surface-variant text-sm font-body-md">Core node consistency</p>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-6 md:gap-gutter mt-8 md:mt-16 pb-16 md:pb-24">
        <div className="col-span-12 lg:col-span-8 space-y-6 md:space-y-gutter">
          <div className="bg-white p-6 md:p-10 border border-border whisper-shadow rounded-xl min-h-[400px] md:h-[500px] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 md:mb-12">
              <div>
                <h3 className="font-headline text-xl md:text-[24px] text-primary font-bold">Performance Trends</h3>
                <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Real-time Node Activity</p>
              </div>
              <div className="flex gap-4 md:gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 md:w-3 h-2 md:h-3 rounded-full bg-secondary"></div>
                  <span className="font-mono text-[10px]">Reliability</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 md:w-3 h-2 md:h-3 rounded-full bg-primary"></div>
                  <span className="font-mono text-[10px]">Satisfaction</span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-[250px]">
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

          <div className="bg-white p-6 md:p-8 border border-border whisper-shadow rounded-xl">
            <h3 className="font-mono text-xs md:text-label-mono uppercase mb-6 md:mb-8">Node Activity Stream</h3>
            <div className="space-y-4">
              {feedbacks?.map((item: any) => {
                const isRisk = Object.values(item.ratings || {}).some((v: any) => Number(v) <= 2);
                return (
                  <div key={item.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-surface-container flex items-center justify-center">
                        {item.category === 'Installation' ? <Wrench className="w-4 h-4 md:w-5 md:h-5 text-secondary" /> : <Activity className="w-4 h-4 md:w-5 md:h-5 text-secondary" />}
                      </div>
                      <div>
                        <p className="text-sm md:text-base font-body font-bold truncate max-w-[120px] md:max-w-none">{item.customerName || 'Subscriber'}</p>
                        <p className="font-mono text-[10px] text-on-surface-variant">{item.location} • {item.category}</p>
                      </div>
                    </div>
                    <div className="flex flex-col md:flex-row items-end md:items-center gap-2 md:gap-3 text-right">
                      {isRisk && (
                        <Badge variant="destructive" className="animate-pulse flex gap-1 items-center bg-destructive text-white rounded-full text-[8px] md:text-[10px] px-2 py-0">
                          <AlertCircle className="w-2 h-2 md:w-3 md:h-3" /> Risk
                        </Badge>
                      )}
                      <span className="font-mono text-[10px] font-bold text-on-surface-variant">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
              {(!feedbacks || feedbacks.length === 0) && !loading && (
                <p className="text-center text-on-surface-variant py-8 md:py-12 font-mono text-[10px] md:text-sm">No activity recorded yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-6 md:space-y-gutter">
          <div className="bg-white p-6 md:p-8 border border-border whisper-shadow rounded-xl">
            <h4 className="font-mono text-xs md:text-label-mono uppercase mb-6 md:mb-8">Volume by Region</h4>
            <div className="h-[200px] md:h-64 mb-6 md:mb-8">
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
                <div key={item.name} className="flex justify-between text-[10px] font-mono">
                  <span className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", i === 0 ? "bg-secondary" : "bg-primary")}></span> {item.name}</span>
                  <span>{stats.total > 0 ? ((item.value / stats.total) * 100).toFixed(1) : 0}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden h-[180px] md:h-64 whisper-shadow relative group">
            <Image src={infraImg.imageUrl} alt="Infrastructure" fill className="object-cover grayscale brightness-90 group-hover:grayscale-0 transition-all duration-700" data-ai-hint="data center" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-4 md:p-6">
              <p className="text-white font-headline text-lg md:text-[20px]">Regional Data Hub</p>
              <span className="text-white font-mono text-[10px] uppercase tracking-widest opacity-80">System Status: Normal</span>
            </div>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}
