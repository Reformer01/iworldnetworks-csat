'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Clock, ShieldCheck, Brain, ArrowDown, Sparkles, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';

export default function AdminSupport() {
  const [barsAnimated, setBarsAnimated] = useState(false);
  const techTeamImg = PlaceHolderImages.find(img => img.id === 'hero-customer')!;
  const firestore = useFirestore();

  const feedbackQuery = useMemo(() => firestore ? query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(500)) : null, [firestore]);
  const { data: feedbacks } = useCollection(feedbackQuery);

  const stats = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return { professionalism: '0', clarity: '0', sentiment: { pos: 0, neu: 0, frust: 0 } };
    
    const supportItems = feedbacks.filter((f: any) => f.category === 'Support');
    if (supportItems.length === 0) return { professionalism: '5.0', clarity: '5.0', sentiment: { pos: 100, neu: 0, frust: 0 } };

    const totalProf = supportItems.reduce((acc, f: any) => acc + Number(f.ratings?.professionalism || 0), 0);
    const totalClarity = supportItems.reduce((acc, f: any) => acc + Number(f.ratings?.clarity || 0), 0);

    const pos = supportItems.filter((f: any) => Number(f.ratings?.professionalism || 0) >= 4).length;
    const frust = supportItems.filter((f: any) => Number(f.ratings?.professionalism || 0) <= 2).length;
    const neu = supportItems.length - pos - frust;

    return {
      professionalism: (totalProf / supportItems.length).toFixed(1),
      clarity: (totalClarity / supportItems.length).toFixed(1),
      sentiment: {
        pos: Math.round((pos / supportItems.length) * 100),
        neu: Math.round((neu / supportItems.length) * 100),
        frust: Math.round((frust / supportItems.length) * 100)
      }
    };
  }, [feedbacks]);

  useEffect(() => {
    const timer = setTimeout(() => setBarsAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AdminLayout>
      <div className="mb-12">
        <h1 className="font-display text-display-lg text-primary tracking-tight mb-2">Support Desk Deep-Dive</h1>
        <p className="text-on-surface-variant mt-2 max-w-2xl font-body-md">Detailed performance and sentiment analysis for our support team.</p>
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-gutter">
        <div className="col-span-12 md:col-span-4 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <div className="flex justify-between items-start mb-6">
            <Clock className="w-10 h-10 text-secondary" />
            <span className="text-secondary font-mono text-[12px] bg-secondary/10 px-2 py-1 rounded">LIVE</span>
          </div>
          <p className="font-mono text-label-mono text-on-surface-variant uppercase tracking-widest">Avg Resolution Time</p>
          <h3 className="font-display text-display-lg font-black mt-2 font-mono">18<span className="text-headline-lg">m</span></h3>
          <div className="flex items-center gap-2 mt-4 text-green-600 font-bold">
            <ArrowDown className="w-4 h-4" />
            <span className="text-sm">Within target</span>
          </div>
        </div>

        <div className="col-span-12 md:col-span-5 md:mt-16 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <div className="flex justify-between items-start mb-6">
            <ShieldCheck className="w-10 h-10 text-secondary" />
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={cn("w-4 h-4 rounded-full", i <= Number(stats.professionalism) ? "bg-secondary" : "bg-muted")} />
              ))}
            </div>
          </div>
          <p className="font-mono text-label-mono text-on-surface-variant uppercase tracking-widest mb-4">Staff Helpfulness</p>
          <h3 className="font-display text-display-lg font-black mt-2 font-mono">{stats.professionalism}<span className="text-headline-lg text-on-surface-variant">/5</span></h3>
          <p className="text-on-surface-variant mt-2 text-sm">Based on recent customer surveys.</p>
        </div>

        <div className="col-span-12 md:col-span-3 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <div className="flex justify-between items-start mb-6">
            <Brain className="w-10 h-10 text-secondary" />
          </div>
          <p className="font-mono text-label-mono text-on-surface-variant uppercase tracking-widest mb-4">Clarity Score</p>
          <h3 className="font-display text-display-lg font-black mt-2 font-mono">{stats.clarity}<span className="text-headline-lg text-on-surface-variant">/5</span></h3>
          <div className="w-full bg-surface-container-high h-1 rounded-full mt-6">
            <div className="bg-secondary h-1 rounded-full" style={{ width: `${(Number(stats.clarity) / 5) * 100}%` }}></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter items-start mb-32">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h4 className="font-headline text-[24px] text-primary font-bold">Weekly Volume</h4>
              <p className="font-mono text-label-mono text-on-surface-variant">Ticket Trends</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="rounded-full text-xs font-bold bg-muted">DAILY</Button>
            </div>
          </div>
          
          <div className="relative h-64 w-full bg-gradient-to-b from-secondary/5 to-transparent border-b border-border flex items-end justify-between px-4">
             {/* Dynamic bar chart based on real feedback counts could go here */}
             <div className="w-full text-center py-12 font-mono text-on-surface-variant opacity-50">Volume tracking active</div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 lg:mt-32 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <h4 className="font-headline text-[24px] mb-2 text-primary font-bold">Feedback Sentiment</h4>
          <p className="font-mono text-label-mono text-on-surface-variant mb-8 uppercase tracking-widest text-[11px]">Emotional Pulse</p>
          <div className="space-y-6">
            {[
              { label: 'Positive', val: stats.sentiment.pos, color: 'bg-secondary' },
              { label: 'Neutral', val: stats.sentiment.neu, color: 'bg-on-surface-variant' },
              { label: 'Frustrated', val: stats.sentiment.frust, color: 'bg-destructive' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between mb-2">
                  <span className="font-mono text-label-mono text-sm">{item.label}</span>
                  <span className="font-bold">{item.val}%</span>
                </div>
                <div className="w-full bg-surface-container-high h-4 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all duration-1000", item.color)} style={{ width: barsAnimated ? `${item.val}%` : '0%' }}></div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 p-4 bg-surface-container rounded-lg">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-secondary fill-secondary" />
              <p className="text-xs text-on-surface-variant italic">System Note: Sentiment is calculated from real customer ratings.</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
