
'use client';

import React from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { TrendingUp, Activity, Users, Zap, Clock, Wifi, Headset, Wrench } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';

export default function AdminDashboard() {
  const infraImg = PlaceHolderImages.find(img => img.id === 'infra-status')!;

  return (
    <AdminLayout>
      <section className="mb-12 flex justify-between items-end">
        <div className="max-w-2xl">
          <h1 className="font-display text-display-lg text-primary tracking-tight mb-2">Operational Overview</h1>
          <p className="text-on-surface-variant font-body-lg">Precision telemetry for the I-World backbone. Real-time satisfaction metrics across national nodes.</p>
        </div>
        <div className="flex gap-4 items-center font-mono text-label-mono text-on-surface-variant">
          <span className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-border whisper-shadow">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Network Stable
          </span>
          <span className="bg-white px-4 py-2 rounded-full border border-border whisper-shadow">Oct 24, 2026</span>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-gutter mb-gutter">
        <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-label-mono text-on-surface-variant uppercase mb-4">CSAT Index</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[56px] leading-none font-bold text-primary">94.2</span>
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
            <span className="font-mono text-[56px] leading-none font-bold text-primary">1,420</span>
          </div>
          <p className="mt-6 text-on-surface-variant font-body-md">Active session feedback cycles</p>
        </div>

        <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl hover:scale-[1.02] transition-transform duration-300">
          <p className="font-mono text-label-mono text-on-surface-variant uppercase mb-4">Conversion Rate</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[56px] leading-none font-bold text-secondary">68</span>
            <span className="font-mono text-display-xl text-secondary">%</span>
          </div>
          <p className="mt-6 text-on-surface-variant font-body-md">Lead to Installation velocity</p>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-gutter mt-16 pb-24">
        <div className="col-span-12 lg:col-span-7 space-y-gutter">
          <div className="bg-white p-10 border border-border whisper-shadow rounded-xl h-[500px] flex flex-col">
            <div className="flex justify-between items-center mb-12">
              <div>
                <h3 className="font-headline text-[24px] text-primary">Reliability Index vs. Satisfaction</h3>
                <p className="text-on-surface-variant font-mono text-sm uppercase">Real-time Node Telemetry</p>
              </div>
              <div className="flex gap-4">
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
            
            <div className="flex-1 flex items-end justify-between px-4 pb-8 border-b border-border relative">
              {[60, 80, 50, 90, 70].map((h, i) => (
                <div key={i} className="w-16 bg-secondary/10 rounded-t-lg relative group transition-all" style={{ height: `${h}%` }}>
                   <div className="absolute inset-x-0 bottom-0 bg-secondary rounded-t-lg" style={{ height: `${h+10}%` }} />
                   <div className="absolute inset-x-4 bottom-0 bg-primary rounded-t-lg" style={{ height: `${h-20}%` }} />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
            <h3 className="font-mono text-label-mono uppercase mb-8">Node Activity Stream</h3>
            <div className="flex gap-3 mb-6">
              {['All Cities', 'Lagos', 'Abuja', 'Abeokuta'].map((city, i) => (
                <button key={city} className={cn("px-4 py-1.5 rounded-full border text-xs font-mono transition-colors", i === 0 ? "border-secondary text-secondary" : "border-border text-on-surface-variant hover:border-secondary")}>
                  {city}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {[
                { title: 'New Subscription - Ikeja North', info: 'Lagos • 2 mins ago', val: '+120Mbps Plan', icon: Wifi },
                { title: 'Ticket Resolved - Garki II', info: 'Abuja • 14 mins ago', val: 'Closed', icon: Headset },
                { title: 'Maintenance Complete', info: 'Abeokuta • 1h ago', val: 'Node 4A - Stable', icon: Wrench },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <p className="font-body font-bold">{item.title}</p>
                      <p className="font-mono text-xs text-on-surface-variant">{item.info}</p>
                    </div>
                  </div>
                  <span className={cn("font-mono text-xs font-bold", item.val.includes('+') ? "text-green-600" : "text-on-surface-variant")}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 lg:col-start-9 space-y-gutter">
          <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
            <h4 className="font-mono text-label-mono uppercase mb-8">Volume by Region</h4>
            <div className="relative w-48 h-48 mx-auto mb-8">
              <div className="absolute inset-0 rounded-full border-[16px] border-surface-container"></div>
              <div className="absolute inset-0 rounded-full border-[16px] border-secondary border-t-transparent border-l-transparent rotate-[45deg]"></div>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-2xl font-bold">72%</span>
                <span className="text-[10px] text-on-surface-variant uppercase">Lagos Core</span>
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

          <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
            <h4 className="font-mono text-label-mono uppercase mb-8">Service Plan Mix</h4>
            <div className="space-y-6">
              {[
                { label: 'Fiber Enterprise', val: 42, color: 'bg-primary' },
                { label: 'Fiber Home Plus', val: 38, color: 'bg-secondary' },
                { label: 'Fiber Basic', val: 20, color: 'bg-border' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between mb-2">
                    <span className="font-mono text-xs uppercase">{item.label}</span>
                    <span className="font-mono text-xs">{item.val}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div className={cn("h-full", item.color)} style={{ width: `${item.val}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden h-64 whisper-shadow relative group">
            <Image 
              src={infraImg.imageUrl} 
              alt="Infrastructure" 
              fill 
              className="object-cover grayscale brightness-90 group-hover:grayscale-0 transition-all duration-700"
              data-ai-hint={infraImg.imageHint}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-6">
              <span className="text-white font-mono text-xs uppercase tracking-widest opacity-80 mb-1">Infrastructure Status</span>
              <p className="text-white font-headline text-[20px]">Tier-3 Lagos Data Center</p>
            </div>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}

