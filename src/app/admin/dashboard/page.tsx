
'use client';

import React, { useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { TrendingUp, Users, Zap, Clock, Wifi, Headset, Wrench, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';

export default function AdminDashboard() {
  const infraImg = PlaceHolderImages.find(img => img.id === 'infra-status')!;
  const firestore = useFirestore();

  const feedbackQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(50));
  }, [firestore]);

  const { data: feedbacks, loading } = useCollection(feedbackQuery);

  const stats = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return { csat: 0, total: 0, velocity: 68 };
    
    const total = feedbacks.length;
    const highRatings = feedbacks.filter((f: any) => {
      const avgRating = Object.values(f.ratings || {}).reduce((a: any, b: any) => a + b, 0) / Object.values(f.ratings || {}).length;
      return avgRating >= 4;
    }).length;

    return {
      csat: ((highRatings / total) * 100).toFixed(1),
      total,
      velocity: 68
    };
  }, [feedbacks]);

  return (
    <AdminLayout>
      <section className="mb-12 flex justify-between items-end">
        <div className="max-w-2xl">
          <h1 className="font-display text-display-lg text-primary tracking-tight mb-2">Overview</h1>
          <p className="text-on-surface-variant font-body-lg">Real-time satisfaction and performance status across all regional offices.</p>
        </div>
        <div className="flex gap-4 items-center font-mono text-label-mono text-on-surface-variant">
          <span className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-border whisper-shadow">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Network Normal
          </span>
          <span className="bg-white px-4 py-2 rounded-full border border-border whisper-shadow">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
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
            <span className="font-mono text-label-mono">+2.4% vs last month</span>
          </div>
        </div>

        <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-label-mono text-on-surface-variant uppercase mb-4">Total Responses</p>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[56px] leading-none font-bold text-primary">{stats.total}</span>
          </div>
          <p className="mt-6 text-on-surface-variant font-body-md">Feedback entries collected</p>
        </div>

        <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-label-mono text-on-surface-variant uppercase mb-4">Setup Speed</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[56px] leading-none font-bold text-secondary">{stats.velocity}</span>
            <span className="font-mono text-display-xl text-secondary">%</span>
          </div>
          <p className="mt-6 text-on-surface-variant font-body-md">On-time installation rate</p>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-gutter mt-16 pb-24">
        <div className="col-span-12 lg:col-span-7 space-y-gutter">
          <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
            <h3 className="font-mono text-label-mono uppercase mb-8">Recent Feedback</h3>
            <div className="space-y-4">
              {feedbacks?.map((item: any, i: number) => {
                const isRisk = Object.values(item.ratings || {}).some((v: any) => v <= 2);
                return (
                  <div key={item.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center">
                        {item.category === 'Installation' ? <Wrench className="w-5 h-5 text-secondary" /> : <Headset className="w-5 h-5 text-secondary" />}
                      </div>
                      <div>
                        <p className="font-body font-bold">{item.customerName || 'Anonymous'}</p>
                        <p className="font-mono text-xs text-on-surface-variant">{item.location} • {item.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isRisk && (
                        <Badge variant="destructive" className="animate-pulse flex gap-1 items-center">
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
                <p className="text-center text-on-surface-variant py-12 font-mono text-sm">Waiting for new submissions...</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 lg:col-start-9 space-y-gutter">
          <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
            <h4 className="font-mono text-label-mono uppercase mb-8">Users by Region</h4>
            <div className="relative w-48 h-48 mx-auto mb-8">
              <div className="absolute inset-0 rounded-full border-[16px] border-surface-container"></div>
              <div className="absolute inset-0 rounded-full border-[16px] border-secondary border-t-transparent border-l-transparent rotate-[45deg]"></div>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-2xl font-bold">72%</span>
                <span className="text-[10px] text-on-surface-variant uppercase">Lagos</span>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Lagos', color: 'bg-secondary', val: '72%' },
                { label: 'Abuja', color: 'bg-primary', val: '18%' },
                { label: 'Others', color: 'bg-muted-foreground', val: '10%' },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-xs font-mono">
                  <span className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", item.color)}></span> {item.label}</span>
                  <span>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden h-64 whisper-shadow relative group">
            <Image src={infraImg.imageUrl} alt="Infrastructure" fill className="object-cover grayscale brightness-90 group-hover:grayscale-0 transition-all duration-700" data-ai-hint="data center" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-6">
              <span className="text-white font-mono text-xs uppercase tracking-widest opacity-80 mb-1">Status</span>
              <p className="text-white font-headline text-[20px]">Main Data Center</p>
            </div>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}
