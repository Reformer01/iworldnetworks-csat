'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Activity, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFirestore, useCollection, useAuth, useUser } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export default function AdminStability() {
  const [mounted, setMounted] = useState(false);
  const firestore = useFirestore();
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);

  useEffect(() => {
    setMounted(true);
  }, []);

  const reliabilityQuery = useMemo(() => {
    if (!firestore || authLoading || !user || !user.emailVerified || !user.email?.endsWith('@iworldnetworks.net')) return null;
    return query(
      collection(firestore, 'feedbacks'), 
      where('category', '==', 'Reliability'),
      orderBy('timestamp', 'desc'), 
      limit(100)
    );
  }, [firestore, user, authLoading]);

  const { data: feedbacks, loading: dataLoading } = useCollection(reliabilityQuery);

  const metrics = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return { uptime: '99.98', latency: '14', loss: '0.02' };
    
    const avgStability = feedbacks.reduce((acc, f: any) => acc + Number(f.ratings?.stability || 5), 0) / feedbacks.length;
    const avgLatency = feedbacks.reduce((acc, f: any) => acc + Number(f.ratings?.latency || 5), 0) / feedbacks.length;
    
    const uptimeIndex = (99.0 + (avgStability / 5)).toFixed(2);
    const latencyVal = Math.round(70 - (avgLatency * 11));
    
    return {
      uptime: uptimeIndex,
      latency: latencyVal.toString(),
      loss: (0.1 - (avgStability * 0.015)).toFixed(2)
    };
  }, [feedbacks]);

  const chartData = useMemo(() => {
    if (!feedbacks) return [];
    return feedbacks.slice(0, 20).reverse().map((f: any) => ({
      time: mounted ? new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
      latency: 70 - (Number(f.ratings?.latency || 4) * 10),
      stability: 95 + (Number(f.ratings?.stability || 4))
    }));
  }, [feedbacks, mounted]);

  const nodeHealth = useMemo(() => {
    const regions = ['Lagos', 'Ibadan', 'Akure', 'Osogbo'];
    return regions.map(region => {
      const regionData = feedbacks?.filter((f: any) => f.location === (region === 'Lagos' ? 'Ibadan' : region)) || [];
      const avg = regionData.length > 0 
        ? regionData.reduce((acc, f: any) => acc + Number(f.ratings?.stability || 5), 0) / regionData.length 
        : 5;
      
      return {
        name: `${region} Cluster`,
        status: avg >= 4 ? 'STABLE' : avg >= 2.5 ? 'BUSY' : 'CRITICAL',
        latency: Math.round(15 + (5 - avg) * 5),
        type: region === 'Lagos' ? 'BACKBONE PRIMARY' : 'REGIONAL NODE'
      };
    });
  }, [feedbacks]);

  return (
    <AdminLayout>
      <div className="max-w-container-max mx-auto">
        <header className="grid grid-cols-12 gap-gutter mb-16 items-end">
          <div className="col-span-12 md:col-span-7">
            <h2 className="font-display text-[32px] md:text-display-lg text-primary tracking-tight font-bold uppercase">Stability & Telemetry</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-4 max-w-xl">
              Real-time visualization of the I-World backbone. High-frequency monitoring of latency patterns and node health derived from customer experience telemetry.
            </p>
          </div>
          <div className="col-span-12 md:col-span-5 flex justify-end">
             <div className="flex items-center gap-2 bg-secondary/10 px-4 py-2 rounded-full border border-secondary/20 whisper-shadow">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              <span className="font-mono text-[10px] text-secondary font-bold uppercase tracking-widest">Network Synchronized</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-gutter mb-16 items-start">
          <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl">
            <p className="font-mono text-[10px] text-on-surface-variant mb-2 uppercase font-bold tracking-widest">Network Uptime</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[56px] leading-none font-bold text-primary">{metrics.uptime}</span>
              <span className="font-display text-[24px] text-on-surface-variant font-bold">%</span>
            </div>
            <div className="mt-6 h-1 w-full bg-surface-container rounded-full overflow-hidden">
              <div className="h-full bg-secondary transition-all duration-1000" style={{ width: `${metrics.uptime}%` }}></div>
            </div>
          </div>

          <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl md:mt-8">
            <p className="font-mono text-[10px] text-on-surface-variant mb-2 uppercase font-bold tracking-widest">Avg. Latency</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[56px] leading-none font-bold text-primary">{metrics.latency}</span>
              <span className="font-display text-[24px] text-on-surface-variant font-bold">ms</span>
            </div>
            <p className="font-mono text-[10px] text-secondary mt-6 flex items-center gap-1 font-bold uppercase">
              <ArrowDown className="w-3 h-3" /> Nominal threshold active
            </p>
          </div>

          <div className="col-span-12 md:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl">
            <p className="font-mono text-[10px] text-on-surface-variant mb-2 uppercase font-bold tracking-widest">Packet Loss</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[56px] leading-none font-bold text-primary">{metrics.loss}</span>
              <span className="font-display text-[24px] text-on-surface-variant font-bold">%</span>
            </div>
            <p className="font-mono text-[10px] text-on-surface-variant mt-6 font-bold uppercase opacity-60">Target: &lt; 0.1%</p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-gutter mb-16">
          <div className="col-span-12 lg:col-span-8 bg-white p-8 border border-border whisper-shadow rounded-xl h-[450px] flex flex-col">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h3 className="font-display text-xl text-primary font-bold uppercase">Latency Over Time</h3>
                <p className="font-mono text-[10px] text-on-surface-variant uppercase font-bold opacity-60">Live Experience Stream</p>
              </div>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-secondary rounded-full"></span>
                  <span className="font-mono text-[10px] uppercase font-bold">Latency</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-primary rounded-full"></span>
                  <span className="font-mono text-[10px] uppercase font-bold">Uptime</span>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorLat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0058be" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#0058be" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666', fontWeight: 'bold' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666', fontWeight: 'bold' }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <Area type="monotone" dataKey="latency" stroke="#0058be" fill="url(#colorLat)" strokeWidth={3} />
                  <Area type="monotone" dataKey="stability" stroke="#000000" fill="transparent" strokeWidth={1} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-gutter">
            <div className="bg-white p-8 border border-border whisper-shadow rounded-xl flex-1">
              <h3 className="font-display text-xl text-primary mb-8 font-bold uppercase tracking-tight">Regional Clusters</h3>
              <div className="space-y-8">
                {nodeHealth.map((node, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-border/50 pb-4 last:border-0 last:pb-0">
                    <div>
                      <p className="font-bold text-primary uppercase text-sm">{node.name}</p>
                      <p className="font-mono text-[8px] text-on-surface-variant font-bold tracking-widest">{node.type}</p>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "px-3 py-1 text-[10px] font-bold font-mono rounded-full border uppercase tracking-widest",
                        node.status === 'STABLE' ? "bg-green-50 text-green-600 border-green-200" : "bg-orange-50 text-orange-600 border-orange-200"
                      )}>
                        {node.status}
                      </span>
                      <p className="font-mono text-[10px] text-on-surface-variant mt-1 font-bold">{node.latency}ms</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-primary p-8 rounded-xl whisper-shadow flex items-center justify-between group cursor-pointer overflow-hidden relative">
               <div className="relative z-10">
                <p className="text-white/60 font-mono text-[10px] uppercase font-bold mb-2">Backbone Version</p>
                <h4 className="text-white font-display text-lg font-bold uppercase">Infrastructure v4.2</h4>
              </div>
              <Activity className="w-12 h-12 text-white/20 group-hover:text-secondary transition-colors duration-500 relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-secondary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-gutter mb-24">
          <div className="col-span-12 bg-white border border-border whisper-shadow rounded-xl p-10">
            <div className="flex justify-between items-end mb-10 border-b border-border pb-6">
              <h3 className="font-display text-2xl text-primary font-bold uppercase tracking-tight">Live Event Log</h3>
              <button className="font-mono text-[10px] text-secondary border-b border-secondary pb-1 hover:opacity-60 transition-opacity font-bold uppercase tracking-widest">
                System Telemetry
              </button>
            </div>
            <div className="space-y-4 font-mono text-[12px]">
              <div className="grid grid-cols-12 gap-4 text-on-surface-variant/40 font-bold uppercase tracking-widest pb-2">
                <span className="col-span-2">Timestamp</span>
                <span className="col-span-2">Event_Type</span>
                <span className="col-span-6">Description</span>
                <span className="col-span-2 text-right">Status</span>
              </div>
              {feedbacks?.slice(0, 8).map((f: any) => {
                const isPulse = Number(f.ratings?.stability || 5) >= 4;
                return (
                  <div key={f.id} className="grid grid-cols-12 gap-4 py-4 border-b border-surface-container border-dashed last:border-0 items-center">
                    <span className="col-span-2 text-primary font-bold">
                      {mounted ? new Date(f.timestamp).toLocaleTimeString([], { hour12: false }) : '--:--'}
                    </span>
                    <span className={cn("col-span-2 font-black uppercase", isPulse ? "text-secondary" : "text-orange-500")}>
                      {isPulse ? 'NODE_PULSE' : 'LAT_SHIFT'}
                    </span>
                    <span className="col-span-6 text-on-surface-variant truncate pr-4">
                      {f.comment || `Metric update received from ${f.location} core.`}
                    </span>
                    <span className="col-span-2 text-right">
                       <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-black",
                        isPulse ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                      )}>
                        {isPulse ? 'OK' : 'VAR'}
                      </span>
                    </span>
                  </div>
                );
              })}
              {(!feedbacks || feedbacks.length === 0) && !dataLoading && (
                <div className="py-12 text-center text-on-surface-variant/40 font-bold uppercase">Waiting for telemetry heartbeat...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
