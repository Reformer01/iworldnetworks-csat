
'use client';

import React from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Timer, MonitorSmartphone, TrendingUp, Info } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';

export default function AdminBilling() {
  const serverImg = PlaceHolderImages.find(img => img.id === 'infra-status')!;

  return (
    <AdminLayout>
      <header className="grid grid-cols-12 gap-gutter mb-16 items-end">
        <div className="col-span-12 md:col-span-7">
          <p className="font-mono text-label-mono text-secondary mb-2 uppercase tracking-[0.2em]">Financial Operations</p>
          <h1 className="text-headline-lg text-primary mb-4 font-display">Revenue & Billing Desk</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">A clinical overview of fiscal health, transactional precision, and portal engagement metrics for the current billing cycle.</p>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9 text-right">
          <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-border whisper-shadow">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="font-mono text-label-mono text-on-surface">Live Telemetry Active</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-20">
        {[
          { label: 'Invoice Accuracy', val: '99.1', unit: '%', trend: '+0.2% vs LW', icon: FactCheck },
          { label: 'Dispute Closure Time', val: '4.2', unit: 'h', trend: 'Target: < 5h', icon: Timer, staggered: true },
          { label: 'Portal Adoption Rate', val: '64', unit: '%', trend: 'Active Now', icon: MonitorSmartphone },
        ].map((item, i) => (
          <div 
            key={i} 
            className={cn(
              "bg-white p-8 rounded-xl whisper-shadow border border-border hover:border-secondary transition-colors duration-500",
              item.staggered && "md:mt-16"
            )}
          >
            <div className="flex justify-between items-start mb-8">
              {typeof item.icon === 'function' ? <item.icon /> : <item.icon className="w-8 h-8 text-secondary" />}
              <span className="font-mono text-[12px] text-green-600 bg-green-50 px-2 py-1 rounded">{item.trend}</span>
            </div>
            <h3 className="font-mono text-label-mono text-on-surface-variant mb-1 uppercase tracking-wider">{item.label}</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[56px] leading-none font-bold text-primary">{item.val}</span>
              <span className="font-display text-headline-lg text-on-surface-variant font-light">{item.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-24">
        <div className="col-span-12 lg:col-span-8 bg-white p-10 rounded-xl whisper-shadow border border-border relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
            <div>
              <h2 className="font-display text-[24px] text-primary mb-1 font-bold">Billing Reconciliation</h2>
              <p className="font-mono text-label-mono text-on-surface-variant">Discrepancies vs Successful Resolutions</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-primary rounded-full"></span>
                <span className="font-mono text-[12px]">Discrepancies</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-secondary rounded-full"></span>
                <span className="font-mono text-[12px]">Resolutions</span>
              </div>
            </div>
          </div>
          <div className="h-64 flex items-end justify-between gap-4 px-4 border-b border-border">
            {[40, 30, 50, 20, 10].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end gap-1 h-full group">
                <div className="w-full bg-primary/10 rounded-t-sm group-hover:bg-primary/20 transition-all duration-300" style={{ height: `${h}%` }}></div>
                <div className="w-full bg-secondary rounded-t-sm group-hover:h-[85%] transition-all duration-300" style={{ height: `${h+40}%` }}></div>
                <p className="text-center font-mono text-[10px] mt-2">{['MON', 'TUE', 'WED', 'THU', 'FRI'][i]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col gap-gutter">
          <div className="bg-white p-8 rounded-xl whisper-shadow border border-border flex-1 flex flex-col justify-center">
            <p className="font-mono text-[12px] text-secondary mb-4 uppercase">System Health</p>
            <h4 className="font-display text-[20px] mb-4 font-bold">Billing Engine Node 04</h4>
            <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mb-2">
              <div className="bg-secondary h-full w-[92%]"></div>
            </div>
            <div className="flex justify-between font-mono text-[10px] text-on-surface-variant">
              <span>Load: 92%</span>
              <span>Normal Latency</span>
            </div>
          </div>
          
          <div className="relative rounded-xl overflow-hidden group cursor-pointer h-48">
            <Image 
              src={serverImg.imageUrl} 
              alt="Lagos Core" 
              fill 
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              data-ai-hint={serverImg.imageHint}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary to-transparent opacity-60"></div>
            <div className="absolute bottom-6 left-6">
              <span className="font-mono text-white text-[10px] border border-white/30 px-2 py-1 rounded backdrop-blur-md mb-2 inline-block">Network Status</span>
              <p className="text-white font-headline text-[18px]">Regional Hub: Lagos Core</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

// Mocked Icons for internal use if lucide doesn't have them
function FactCheck(props: any) { return <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-secondary" {...props} /></div> }
function CheckCircle(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-check-circle-2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg> }
