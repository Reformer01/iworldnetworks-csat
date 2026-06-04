'use client';

import React, { useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Map, List, CircleCheck, Clock, Shield } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, useAuth, useUser } from '@/firebase';
import { collection, query, orderBy, limit, where } from 'firebase/firestore';

export default function AdminInstallation() {
  const networkMap = PlaceHolderImages.find(img => img.id === 'network-map')!;
  const firestore = useFirestore();
  const auth = useAuth();
  const { user } = useUser(auth);

  const techsRoster = [
    { name: "Lukmon Obasa", region: "Akure" },
    { name: "Christian Adejo", region: "Akure" },
    { name: "Habeeb Hussein", region: "Ibadan" },
    { name: "Joseph Dung N", region: "Ibadan" },
    { name: "Alowo Temitope", region: "Ibadan" },
    { name: "Timilehin Alabi", region: "Ibadan" },
    { name: "Adekunle Ademiju", region: "Ibadan" },
    { name: "Adebisi Ogusola", region: "Abeokuta" },
    { name: "Kehinde Itehinola", region: "Abeokuta" },
    { name: "Olopade Olusegun", region: "Abeokuta" },
    { name: "Mubarak Raji", region: "Osogbo" }
  ];

  const installFeedbackQuery = useMemo(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'feedbacks'), where('category', '==', 'Installation'), orderBy('timestamp', 'desc'), limit(500));
  }, [firestore, user]);

  const { data: installFeedback } = useCollection(installFeedbackQuery);

  const techLeaderboard = useMemo(() => {
    if (!installFeedback) return techsRoster.map(t => ({ ...t, completions: 0 })).slice(0, 5);
    
    return techsRoster.map((t: any) => {
      const completions = installFeedback.filter((f: any) => f.staffName === t.name).length;
      return {
        ...t,
        completions
      };
    }).sort((a, b) => b.completions - a.completions).slice(0, 5);
  }, [installFeedback]);

  const completionRate = useMemo(() => {
    if (!installFeedback || installFeedback.length === 0) return '0';
    const goodInstalls = installFeedback.filter((f: any) => Number(f.ratings?.quality || 0) >= 4).length;
    return ((goodInstalls / installFeedback.length) * 100).toFixed(1);
  }, [installFeedback]);

  const regionalDrops = useMemo(() => {
    const drops: Record<string, number> = { Abeokuta: 0, Ibadan: 0, Osogbo: 0, Akure: 0 };
    if (!installFeedback) return drops;
    installFeedback.forEach((f: any) => {
      if (drops[f.location] !== undefined) drops[f.location]++;
    });
    return drops;
  }, [installFeedback]);

  return (
    <AdminLayout>
      <div className="grid grid-cols-12 gap-gutter mb-16">
        <div className="col-span-12 md:col-span-7">
          <p className="font-mono text-label-mono text-secondary mb-2 uppercase">Head of Installation: Matthew</p>
          <h1 className="font-headline text-headline-lg mb-4 text-primary">Setup Performance</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            Detailed view of field efficiency, deployment metrics, and regional fiber penetration.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9 flex flex-col justify-end">
          <div className="bg-white p-6 whisper-shadow rounded-xl border border-border">
            <span className="font-mono text-[12px] uppercase text-secondary">Efficiency Boost</span>
            <div className="text-display-lg text-[48px] font-black mt-2"><span className="font-mono">+{completionRate}%</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter">
        <section className="col-span-12 md:col-span-5 bg-white whisper-shadow rounded-xl p-8 border border-border">
          <div className="flex justify-between items-center mb-10">
            <h3 className="font-headline text-[24px] font-bold">Field Leaderboard</h3>
            <CircleCheck className="w-6 h-6 text-secondary" />
          </div>
          <div className="space-y-8">
            {techLeaderboard.map((tech: any) => (
              <div key={tech.name} className="flex items-center gap-6 group hover:scale-[1.01] transition-transform">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center font-mono font-bold text-secondary">
                  {tech.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-on-surface text-lg">{tech.name}</p>
                  <p className="font-mono text-sm text-on-surface-variant">{tech.region}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-secondary text-xl"><span className="font-mono">{tech.completions}</span></p>
                  <p className="font-mono text-[10px] uppercase opacity-60">Setups</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="col-span-12 md:col-span-7 bg-white whisper-shadow rounded-xl p-8 border border-border flex flex-col min-h-[500px]">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="font-headline text-[24px] font-bold">Regional Fiber Drops</h3>
              <p className="font-mono text-sm text-on-surface-variant mt-1">Live installation activity across active hubs.</p>
            </div>
            <div className="flex gap-2">
              <Button size="icon" className="w-10 h-10 bg-primary text-white"><Map className="w-5 h-5" /></Button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden rounded-lg bg-surface-container-low group">
            <Image 
              src={networkMap.imageUrl} 
              alt="Network Map" 
              fill 
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover grayscale contrast-[1.1] opacity-40 mix-blend-multiply transition-transform duration-1000 group-hover:scale-105" 
              data-ai-hint="network map" 
            />
            
            <div className="absolute top-1/4 left-1/4 group cursor-pointer">
              <div className="w-4 h-4 bg-secondary rounded-full animate-ping absolute"></div>
              <div className="w-4 h-4 bg-secondary rounded-full relative border-2 border-white"></div>
              <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 font-mono text-xs font-bold">
                Ibadan: {regionalDrops.Ibadan} Drops
              </div>
            </div>
            <div className="absolute top-1/2 right-1/3 group cursor-pointer">
              <div className="w-4 h-4 bg-secondary rounded-full animate-ping absolute"></div>
              <div className="w-4 h-4 bg-secondary rounded-full relative border-2 border-white"></div>
              <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 font-mono text-xs font-bold">
                Abeokuta: {regionalDrops.Abeokuta} Drops
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mt-16 mb-24">
        {[
          { label: 'Avg Setup Time', val: '42m', info: 'Daily Target: < 45m', icon: Clock },
          { label: 'Quality Score', val: `${completionRate}%`, info: 'National Average', icon: Shield },
          { label: 'Pending Jobs', val: '2,419', info: 'Current Queue', icon: List, primary: true },
        ].map((item, i) => (
          <div key={i} className={cn("p-8 rounded-xl border border-border whisper-shadow", item.primary ? "bg-secondary text-white border-secondary" : "bg-white")}>
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
