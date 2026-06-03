
'use client';

import React from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Map, List, ChevronRight, CircleCheck, Clock } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function AdminInstallation() {
  const techPortraits = [
    PlaceHolderImages.find(img => img.id === 'tech-dave')!,
    PlaceHolderImages.find(img => img.id === 'tech-samuel')!,
    PlaceHolderImages.find(img => img.id === 'admin-avatar')!,
  ];
  const networkMap = PlaceHolderImages.find(img => img.id === 'network-map')!;

  const leadTechs = [
    { name: 'Lukmon Obasa', role: 'Lead Tech • Akure Hub', completions: 156, time: '41m', img: techPortraits[0] },
    { name: 'Habeeb Hussein', role: 'Senior Tech • Ibadan Node', completions: 142, time: '38m', img: techPortraits[1] },
    { name: 'Kehinde Itehinola', role: 'Lead Tech • Abeokuta Office', completions: 128, time: '44m', img: techPortraits[2] },
  ];

  return (
    <AdminLayout>
      <div className="grid grid-cols-12 gap-gutter mb-16">
        <div className="col-span-12 md:col-span-7">
          <h1 className="font-headline text-headline-lg mb-4 text-primary">Installation Team Performance</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            A clinical breakdown of field efficiency, deployment metrics, and regional fiber penetration. Precision tracking for a seamless network expansion across the West African frontier.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9 flex flex-col justify-end">
          <div className="bg-surface-container-lowest p-6 whisper-shadow rounded-xl border border-border">
            <span className="font-mono text-[12px] uppercase text-secondary">Efficiency Multiplier</span>
            <div className="text-display-lg text-[48px] font-black mt-2"><span className="font-mono">+12.4%</span></div>
            <div className="w-full bg-surface-container h-1 rounded-full mt-4">
              <div className="bg-secondary h-1 rounded-full w-[74%]"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter">
        <section className="col-span-12 md:col-span-5 bg-surface-container-lowest whisper-shadow rounded-xl p-8 border border-border">
          <div className="flex justify-between items-center mb-10">
            <h3 className="font-headline text-[24px] font-bold">Field Technician Leaderboard</h3>
            <CircleCheck className="w-6 h-6 text-secondary" />
          </div>
          <div className="space-y-8">
            {leadTechs.map(tech => (
              <div key={tech.name} className="flex items-center gap-6 group hover:scale-[1.01] transition-transform duration-200">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-border">
                  <Image src={tech.img.imageUrl} alt={tech.name} width={48} height={48} className="object-cover" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-on-surface text-lg">{tech.name}</p>
                  <p className="font-mono text-sm text-on-surface-variant">{tech.role}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-secondary text-xl"><span className="font-mono">{tech.completions}</span></p>
                  <p className="font-mono text-[10px] uppercase opacity-60">Completions</p>
                </div>
                <div className="pl-4 border-l border-border text-right">
                  <p className="font-bold text-on-surface"><span className="font-mono">{tech.time}</span></p>
                  <p className="font-mono text-[10px] opacity-60">Avg Time</p>
                </div>
              </div>
            ))}
            <button className="flex items-center w-full gap-6 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300">
              <div className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-dashed border-border font-mono text-on-surface-variant">
                +12
              </div>
              <p className="font-mono text-sm">View Full Regional Roster</p>
              <ChevronRight className="w-5 h-5 ml-auto" />
            </button>
          </div>
        </section>

        <section className="col-span-12 md:col-span-7 bg-surface-container-lowest whisper-shadow rounded-xl p-8 border border-border flex flex-col min-h-[500px]">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="font-headline text-[24px] font-bold">Regional Fiber Drops</h3>
              <p className="font-mono text-sm text-on-surface-variant mt-1">Real-time hotspots across Lagos, Ibadan, Akure, and Abeokuta.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" className="w-10 h-10"><Map className="w-5 h-5" /></Button>
              <Button size="icon" className="w-10 h-10 bg-primary text-white"><List className="w-5 h-5" /></Button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden rounded-lg bg-surface-container-low group">
            <Image 
              src={networkMap.imageUrl} 
              alt="Network Map" 
              fill 
              className="object-cover grayscale contrast-[1.1] opacity-40 mix-blend-multiply transition-transform duration-1000 group-hover:scale-105"
              data-ai-hint="network map"
            />
            {/* Markers */}
            <div className="absolute top-1/4 left-1/4 group/marker cursor-pointer">
              <div className="w-4 h-4 bg-secondary rounded-full animate-ping absolute"></div>
              <div className="w-4 h-4 bg-secondary rounded-full relative border-2 border-white"></div>
            </div>
            <div className="absolute top-1/2 right-1/3 group/marker cursor-pointer">
              <div className="w-4 h-4 bg-secondary rounded-full animate-ping absolute"></div>
              <div className="w-4 h-4 bg-secondary rounded-full relative border-2 border-white"></div>
            </div>
            <div className="absolute bottom-1/4 left-1/2 group/marker cursor-pointer">
              <div className="w-4 h-4 bg-secondary rounded-full animate-ping absolute"></div>
              <div className="w-4 h-4 bg-secondary rounded-full relative border-2 border-white"></div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mt-16 mb-24">
        {[
          { label: 'Fastest Deploy', val: '22m', info: 'Technician: R. Musa', icon: Clock },
          { label: 'Completion Rate', val: '98.4%', info: 'Global Quality', icon: CircleCheck },
          { label: 'Pending Installs', val: '2,419', info: 'Q4 Backlog', icon: List, primary: true },
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
