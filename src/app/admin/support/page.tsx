
'use client';

import React, { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Clock, ShieldCheck, Brain, ArrowDown, Sparkles, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function AdminSupport() {
  const [barsAnimated, setBarsAnimated] = useState(false);
  const techTeamImg = PlaceHolderImages.find(img => img.id === 'hero-customer')!;

  useEffect(() => {
    const timer = setTimeout(() => setBarsAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AdminLayout>
      <div className="mb-12">
        <h1 className="font-display text-display-lg text-primary tracking-tight mb-2">Support Desk Deep-Dive</h1>
        <p className="text-on-surface-variant mt-2 max-w-2xl font-body-md">Real-time performance metrics and sentiment analysis for I-World Networks global support operations.</p>
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-gutter">
        <div className="col-span-12 md:col-span-4 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <div className="flex justify-between items-start mb-6">
            <Clock className="w-10 h-10 text-secondary" />
            <span className="text-secondary font-mono text-[12px] bg-secondary/10 px-2 py-1 rounded">LIVE</span>
          </div>
          <p className="font-mono text-label-mono text-on-surface-variant uppercase tracking-widest">Avg Resolution Time</p>
          <h3 className="font-display text-display-lg font-black mt-2 font-mono">18<span className="text-headline-lg">m</span> 12<span class="text-headline-lg">s</span></h3>
          <div className="flex items-center gap-2 mt-4 text-green-600 font-bold">
            <ArrowDown className="w-4 h-4" />
            <span className="text-sm">2.4% vs last week</span>
          </div>
        </div>

        <div className="col-span-12 md:col-span-5 md:mt-16 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <div className="flex justify-between items-start mb-6">
            <ShieldCheck className="w-10 h-10 text-secondary" />
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="w-4 h-4 rounded-full bg-yellow-500 opacity-80" />
              ))}
            </div>
          </div>
          <p className="font-mono text-label-mono text-on-surface-variant uppercase tracking-widest mb-4">Agent Professionalism</p>
          <h3 className="font-display text-display-lg font-black mt-2 font-mono">4.8<span className="text-headline-lg text-on-surface-variant">/5</span></h3>
          <p className="text-on-surface-variant mt-2 text-sm">Based on 1,240 post-call surveys.</p>
        </div>

        <div className="col-span-12 md:col-span-3 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <div className="flex justify-between items-start mb-6">
            <Brain className="w-10 h-10 text-secondary" />
          </div>
          <p className="font-mono text-label-mono text-on-surface-variant uppercase tracking-widest mb-4">Clarity Score</p>
          <h3 className="font-display text-display-lg font-black mt-2 font-mono">4.6<span className="text-headline-lg text-on-surface-variant">/5</span></h3>
          <div className="w-full bg-surface-container-high h-1 rounded-full mt-6">
            <div className="bg-secondary h-1 rounded-full" style={{ width: '92%' }}></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter items-start mb-32">
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h4 className="font-headline text-[24px] text-primary font-bold">Support Ticket Volume</h4>
              <p className="font-mono text-label-mono text-on-surface-variant">Past 30 Days Trend</p>
            </div>
            <div className="flex gap-2">
              <Button variant="muted" size="sm" className="rounded-full text-xs font-bold">DAILY</Button>
              <Button variant="ghost" size="sm" className="rounded-full text-xs font-bold">WEEKLY</Button>
            </div>
          </div>
          
          <div className="relative h-64 w-full bg-gradient-to-b from-secondary/5 to-transparent border-b border-border">
             <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 300">
                <path d="M0,250 L100,230 L200,260 L300,180 L400,210 L500,150 L600,190 L700,120 L800,140 L900,80 L1000,110 L1000,300 L0,300 Z" fill="rgba(0, 88, 190, 0.1)"></path>
                <polyline fill="none" points="0,250 100,230 200,260 300,180 400,210 500,150 600,190 700,120 800,140 900,80 1000,110" stroke="#0058be" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></polyline>
             </svg>
          </div>
          <div className="flex justify-between mt-4 font-mono text-[10px] text-on-surface-variant px-2">
            <span>OCT 01</span>
            <span>OCT 10</span>
            <span>OCT 20</span>
            <span>OCT 30</span>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 lg:mt-32 bg-surface-container-lowest p-8 border border-border whisper-shadow rounded-xl">
          <h4 className="font-headline text-[24px] mb-2 text-primary font-bold">Technician Sentiment</h4>
          <p className="font-mono text-label-mono text-on-surface-variant mb-8 uppercase tracking-widest text-[11px]">Emotional Pulse Check</p>
          <div className="space-y-6">
            {[
              { label: 'Positive', val: 68, color: 'bg-secondary' },
              { label: 'Neutral', val: 24, color: 'bg-on-surface-variant' },
              { label: 'Frustrated', val: 8, color: 'bg-destructive' },
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
              <p className="text-xs text-on-surface-variant italic">AI Insight: Sentiment is up 12% following the new hardware rollout in Abuja.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-24">
        <div className="col-span-12 lg:col-span-7 h-96 rounded-2xl overflow-hidden grayscale hover:grayscale-0 transition-all duration-700 relative">
          <Image 
            src={techTeamImg.imageUrl} 
            alt="Support Team" 
            fill 
            className="object-cover" 
            data-ai-hint={techTeamImg.imageHint}
          />
        </div>
        <div className="col-span-12 lg:col-span-4 lg:col-start-9 flex flex-col justify-center">
          <h2 className="font-display text-[40px] leading-tight mb-6 tracking-tighter font-bold">Operational Excellence at the Edge.</h2>
          <p className="text-on-surface-variant font-body-lg">Every data point tells a story of connectivity. Our support teams don't just solve tickets; they engineer stability for the West African digital frontier.</p>
          <a className="mt-8 font-mono text-label-mono text-secondary flex items-center gap-2 group" href="#">
            Explore Team Metrics
            <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
          </a>
        </div>
      </div>
    </AdminLayout>
  );
}
