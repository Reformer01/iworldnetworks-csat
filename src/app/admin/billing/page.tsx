
'use client';

import React, { useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Timer, MonitorSmartphone, CircleCheck } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, useAuth, useUser } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';

export default function AdminBilling() {
  const serverImg = PlaceHolderImages.find(img => img.id === 'infra-status')!;
  const firestore = useFirestore();
  const auth = useAuth();
  const { user } = useUser(auth);

  const feedbackQuery = useMemo(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'feedbacks'), orderBy('timestamp', 'desc'), limit(500));
  }, [firestore, user]);

  const { data: feedbacks } = useCollection(feedbackQuery);

  const stats = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return { accuracy: '0', speed: '0', portal: '64' };
    
    const billingItems = feedbacks.filter((f: any) => f.category === 'Billing');
    if (billingItems.length === 0) return { accuracy: '100', speed: '5.0', portal: '64' };

    const totalAcc = billingItems.reduce((acc, f: any) => acc + Number(f.ratings?.accuracy || 0), 0);
    const totalSpeed = billingItems.reduce((acc, f: any) => acc + Number(f.ratings?.reconnection || 0), 0);

    return {
      accuracy: ((totalAcc / (billingItems.length * 5)) * 100).toFixed(1),
      speed: (totalSpeed / billingItems.length).toFixed(1),
      portal: '64' 
    };
  }, [feedbacks]);

  const reconciliationData = useMemo(() => [
    { name: 'Mon', discrepancies: 4, resolutions: 12 },
    { name: 'Tue', discrepancies: 3, resolutions: 15 },
    { name: 'Wed', discrepancies: 5, resolutions: 10 },
    { name: 'Thu', discrepancies: 2, resolutions: 18 },
    { name: 'Fri', discrepancies: 1, resolutions: 20 },
  ], []);

  return (
    <AdminLayout>
      <header className="grid grid-cols-12 gap-gutter mb-16 items-end">
        <div className="col-span-12 md:col-span-7">
          <p className="font-mono text-label-mono text-secondary mb-2 uppercase text-xs">Head of Billing: Stella</p>
          <h1 className="text-3xl md:text-headline-lg text-primary mb-4 font-display">Billing Overview</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">Overview of payment satisfaction, invoice accuracy, and portal usage.</p>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9 text-right">
          <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-border whisper-shadow">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="font-mono text-label-mono text-on-surface">Monitoring Active</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-20">
        {[
          { label: 'Invoice Accuracy', val: stats.accuracy, unit: '%', trend: '+0.2%', icon: CircleCheck },
          { label: 'Reconnection Speed', val: stats.speed, unit: '/5', trend: 'Target: > 4.5', icon: Timer, staggered: true },
          { label: 'Portal Usage', val: stats.portal, unit: '%', trend: 'Growing', icon: MonitorSmartphone },
        ].map((item, i) => (
          <div 
            key={i} 
            className={cn(
              "bg-white p-8 rounded-xl whisper-shadow border border-border hover:border-secondary transition-colors duration-500",
              item.staggered && "md:mt-16"
            )}
          >
            <div className="flex justify-between items-start mb-8">
              <item.icon className="w-8 h-8 text-secondary" />
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
              <p className="font-mono text-label-mono text-on-surface-variant">Daily dispute resolutions</p>
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
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reconciliationData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="discrepancies" fill="#000" radius={[4, 4, 0, 0]} barSize={12} />
                <Bar dataKey="resolutions" fill="#0058be" radius={[4, 4, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col gap-gutter">
          <div className="bg-white p-8 rounded-xl whisper-shadow border border-border flex-1 flex flex-col justify-center">
            <p className="font-mono text-[12px] text-secondary mb-4 uppercase">System Performance</p>
            <h4 className="font-display text-[20px] mb-4 font-bold">Payment System</h4>
            <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mb-2">
              <div className="bg-secondary h-full w-[92%]"></div>
            </div>
            <div className="flex justify-between font-mono text-[10px] text-on-surface-variant">
              <span>Status: Normal</span>
              <span>Online</span>
            </div>
          </div>
          
          <div className="relative rounded-xl overflow-hidden group cursor-pointer h-48">
            <Image 
              src={serverImg.imageUrl} 
              alt="Server Room" 
              fill 
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              data-ai-hint="data center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary to-transparent opacity-60"></div>
            <div className="absolute bottom-6 left-6">
              <span className="font-mono text-white text-[10px] border border-white/30 px-2 py-1 rounded backdrop-blur-md mb-2 inline-block">Regional Hub</span>
              <p className="text-white font-headline text-[18px]">Lagos Hub</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
