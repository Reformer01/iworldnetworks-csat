
'use client';

import React, { useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Map, List, ChevronRight, CircleCheck, Clock } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';

export default function AdminInstallation() {
  const networkMap = PlaceHolderImages.find(img => img.id === 'network-map')!;
  const firestore = useFirestore();

  const techQuery = useMemo(() => firestore ? query(collection(firestore, 'technicians'), orderBy('name')) : null, [firestore]);
  const installFeedbackQuery = useMemo(() => firestore ? query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(500)) : null, [firestore]);

  const { data: techs } = useCollection(techQuery);
  const { data: installFeedback } = useCollection(installFeedbackQuery);

  const techLeaderboard = useMemo(() => {
    if (!techs || !installFeedback) return [];
    
    return techs.map((t: any) => {
      const completions = installFeedback.filter((f: any) => f.staffName === t.name && f.category === 'Installation').length;
      return {
        ...t,
        completions
      };
    }).sort((a, b) => b.completions - a.completions).slice(0, 5);
  }, [techs, installFeedback]);

  const completionRate = useMemo(() => {
    if (!installFeedback || installFeedback.length === 0) return '0';
    const installs = installFeedback.filter((f: any) => f.category === 'Installation');
    if (installs.length === 0) return '100';
    const goodInstalls = installs.filter((f: any) => Number(f.ratings?.quality || 0) >= 4).length;
    return ((goodInstalls / installs.length) * 100).toFixed(1);
  }, [installFeedback]);

  return (
    <AdminLayout>
      <div className="grid grid-cols-12 gap-gutter mb-16">
        <div className="col-span-12 md:col-span-7">
          <h1 className="font-headline text-headline-lg mb-4 text-primary">Setup Performance</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            Detailed view of installation speed and regional fiber setup for our field teams.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9 flex flex-col justify-end">
          <div className="bg-surface-container-lowest p-6 whisper-shadow rounded-xl border border-border">
            <span className="font-mono text-[12px] uppercase text-secondary">Efficiency Boost</span>
            <div className="text-display-lg text-[48px] font-black mt-2"><span className="font-mono">+{completionRate}%</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter">
        <section className="col-span-12 md:col-span-5 bg-surface-container-lowest whisper-shadow rounded-xl p-8 border border-border">
          <div className="flex justify-between items-center mb-10">
            <h3 className="font-headline text-[24px] font-bold">Technician Rankings</h3>
            <CircleCheck className="w-6 h-6 text-secondary" />
          </div>
          <div className="space-y-8">
            {techLeaderboard.map((tech: any) => (
              <div key={tech.id} className="flex items-center gap-6 group">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center font-mono font-bold">
                  {tech.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-on-surface text-lg">{tech.name}</p>
                  <p className="font-mono text-sm text-on-surface-variant">{tech.region} • {tech.primaryTerritory || 'General'}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-secondary text-xl"><span className="font-mono">{tech.completions}</span></p>
                  <p className="font-mono text-[10px] uppercase opacity-60">Setups</p>
                </div>
              </div>
            ))}
            {techLeaderboard.length === 0 && <p className="text-on-surface-variant text-sm font-mono">Loading team records...</p>}
          </div>
        </section>

        <section className="col-span-12 md:col-span-7 bg-surface-container-lowest whisper-shadow rounded-xl p-8 border border-border flex flex-col min-h-[500px]">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="font-headline text-[24px] font-bold">Service Regions</h3>
              <p className="font-mono text-sm text-on-surface-variant mt-1">Live installation activity across all hubs.</p>
            </div>
            <div className="flex gap-2">
              <Button size="icon" className="w-10 h-10 bg-primary text-white"><Map className="w-5 h-5" /></Button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden rounded-lg bg-surface-container-low group">
            <Image src={networkMap.imageUrl} alt="Network Map" fill className="object-cover grayscale contrast-[1.1] opacity-40 mix-blend-multiply transition-transform duration-1000 group-hover:scale-105" data-ai-hint="network map" />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mt-16 mb-24">
        {[
          { label: 'Avg Setup Time', val: '42m', info: 'Daily Target', icon: Clock },
          { label: 'Quality Score', val: `${completionRate}%`, info: 'National Average', icon: CircleCheck },
          { label: 'Pending Jobs', val: '14', info: 'Current Queue', icon: List, primary: true },
        ].map((item, i) => (
          <div key={i} className={cn("p-8 rounded-xl", item.primary ? "bg-secondary text-white" : "bg-surface-container-highest")}>
            <item.icon className={cn("w-8 h-8 mb-4", item.primary ? "text-white" : "text-secondary")} />
            <h4 className="font-bold text-lg mb-2">{item.label}</h4>
            <p className="text-[32px] font-black font-mono">{item.val}</p>
            <p className={cn("text-xs font-mono mt-2", item.primary ? "text-white/80" : "text-on-surface-variant")}>{item.info}</p>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
