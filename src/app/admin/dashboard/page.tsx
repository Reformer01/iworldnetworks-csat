
'use client';

import React, { useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { TrendingUp, Headset, Wrench, AlertCircle } from 'lucide-react';
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
    return query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(100));
  }, [firestore]);

  const { data: feedbacks, loading } = useCollection(feedbackQuery);

  const stats = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return { csat: '0', total: 0, growth: '+0%' };
    
    const total = feedbacks.length;
    const highRatings = feedbacks.filter((f: any) => {
      // Calculate avg from all numeric ratings provided
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

  const regionalData = useMemo(() => {
    const counts: Record<string, number> = { Lagos: 0, Abuja: 0, Ibadan: 0, Others: 0 };
    if (!feedbacks) return counts;
    feedbacks.forEach((f: any) => {
      if (counts[f.location] !== undefined) counts[f.location]++;
      else counts.Others++;
    });
    return counts;
  }, [feedbacks]);

  return (
    <AdminLayout>
      <section className="mb-12 flex justify-between items-end">
        <div className="max-w-2xl">
          <h1 className="font-display text-display-lg text-primary tracking-tight mb-2">Overview</h1>
          <p className="text-on-surface-variant font-body-lg">Monitoring customer happiness and network performance across all hubs.</p>
        </div>
        <div className="flex gap-4 items-center font-mono text-label-mono text-on-surface-variant">
          <span className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-border whisper-shadow">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Network Stable
          </span>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-gutter">
        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
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

        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <p className="font-mono text-label-mono text-on-surface-variant uppercase mb-4">Total Responses</p>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[56px] leading-none font-bold text-primary">{stats.total}</span>
          </div>
          <p className="mt-6 text-on-surface-variant font-body-md">Real customer evaluations</p>
        </div>

        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <p className="font-mono text-label-mono text-on-surface-variant uppercase mb-4">Uptime</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[56px] leading-none font-bold text-secondary">99.8</span>
            <span className="font-mono text-display-xl text-secondary">%</span>
          </div>
          <p className="mt-6 text-on-surface-variant font-body-md">Network consistency</p>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-gutter mt-16 pb-24">
        <div className="col-span-12 lg:col-span-7">
          <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
            <h3 className="font-mono text-label-mono uppercase mb-8">Recent Feed</h3>
            <div className="space-y-4">
              {feedbacks?.map((item: any) => {
                const isRisk = Object.values(item.ratings || {}).some((v: any) => Number(v) <= 2);
                return (
                  <div key={item.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center">
                        {item.category === 'Installation' ? <Wrench className="w-5 h-5 text-secondary" /> : <Headset className="w-5 h-5 text-secondary" />}
                      </div>
                      <div>
                        <p className="font-body font-bold">{item.customerName || 'Customer'}</p>
                        <p className="font-mono text-xs text-on-surface-variant">{item.location} • {item.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isRisk && (
                        <Badge variant="destructive" className="animate-pulse flex gap-1 items-center">
                          <AlertCircle className="w-3 h-3" /> Risk
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
                <p className="text-center text-on-surface-variant py-12 font-mono text-sm">No feedback records found yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 lg:col-start-9 space-y-gutter">
          <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
            <h4 className="font-mono text-label-mono uppercase mb-8">Volume by Region</h4>
            <div className="space-y-3">
              {[
                { label: 'Lagos', color: 'bg-secondary', count: regionalData.Lagos },
                { label: 'Abuja', color: 'bg-primary', count: regionalData.Abuja },
                { label: 'Ibadan', color: 'bg-orange-500', count: regionalData.Ibadan },
                { label: 'Others', color: 'bg-muted-foreground', count: regionalData.Others },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-xs font-mono">
                  <span className="flex items-center gap-2"><span className={cn("w-2 h-2 rounded-full", item.color)}></span> {item.label}</span>
                  <span>{stats.total > 0 ? ((item.count / stats.total) * 100).toFixed(1) : 0}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden h-64 whisper-shadow relative group">
            <Image src={infraImg.imageUrl} alt="Infrastructure" fill className="object-cover grayscale brightness-90 group-hover:grayscale-0 transition-all duration-700" data-ai-hint="data center" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-6">
              <p className="text-white font-headline text-[20px]">Lagos Central Hub</p>
              <span className="text-white font-mono text-xs uppercase tracking-widest opacity-80">Network Status: Online</span>
            </div>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}
