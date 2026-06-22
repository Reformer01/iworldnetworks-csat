'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { TrendingUp, Users, Activity, DollarSign, UserX, BarChart3, Database, AlertCircle } from 'lucide-react';
import { useSalesMetrics } from '@/hooks/use-sales-data';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { cn } from '@/lib/utils';
import type { AgentMetrics, RegionMetrics } from '@/lib/sales-types';

const COLORS = ['#448515', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function formatNaira(amount: number) {
  if (amount >= 1000000) return 'NGN' + (amount / 1000000).toFixed(1) + 'M';
  return 'NGN' + amount.toLocaleString();
}

function useStaggeredIndex(count: number, delayMs = 80) {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    if (count === 0) return;
    const timer = setInterval(() => setVisible((v) => {
      if (v >= count) { clearInterval(timer); return count; }
      return v + 1;
    }), delayMs);
    return () => clearInterval(timer);
  }, [count, delayMs]);
  return visible;
}

function AnimatedCard({
  icon: Icon,
  label,
  value,
  unit,
  detail,
  color,
  index,
  visibleCount,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  color: string;
  index: number;
  visibleCount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={cn(
        'bg-white p-6 rounded-2xl whisper-shadow border border-border group hover:border-secondary transition-all duration-500 min-h-[184px]',
        index < visibleCount ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div className="flex justify-between items-start mb-5">
        <Icon className={cn('w-6 h-6', color)} />
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="font-mono text-[10px] text-on-surface-variant font-bold uppercase">LIVE</span>
        </div>
      </div>
      <p className="font-mono text-[10px] uppercase text-on-surface-variant mb-1 font-bold tracking-wider">{label}</p>
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className="text-2xl font-mono font-black text-primary">{value}</span>
        {unit && <span className="text-xl font-display text-on-surface-variant font-bold">{unit}</span>}
      </div>
      <p className="mt-4 font-mono text-[9px] text-on-surface-variant/60 uppercase font-bold tracking-wider">{detail}</p>
    </div>
  );
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border', className)}>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      {Icon && <Icon className="w-5 h-5 text-secondary" />}
      <h3 className="font-display font-bold text-base md:text-lg uppercase tracking-tight">{label}</h3>
    </div>
  );
}

function EmptyChart({ message, icon: Icon = BarChart3 }: { message: string; icon?: React.ElementType }) {
  return (
    <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/60 rounded-xl">
      <Icon className="w-10 h-10 text-on-surface-variant/20 mb-3" />
      <p className="font-mono text-[11px] text-on-surface-variant/40 uppercase font-bold tracking-widest px-4">{message}</p>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-64 rounded-xl bg-surface-container-low/50 animate-pulse flex items-center justify-center">
      <BarChart3 className="w-8 h-8 text-on-surface-variant/10" />
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="bg-white p-6 rounded-2xl whisper-shadow border border-border min-h-[184px] animate-pulse">
      <div className="flex justify-between items-start mb-5">
        <div className="w-6 h-6 bg-surface-container-low rounded" />
        <div className="w-10 h-3 bg-surface-container-low rounded" />
      </div>
      <div className="h-3 w-24 bg-surface-container-low rounded mb-3" />
      <div className="h-7 w-28 bg-surface-container-low rounded mb-4" />
      <div className="h-2 w-32 bg-surface-container-low rounded" />
    </div>
  );
}

function AgentBarChart({ data }: { data: AgentMetrics[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 150); return () => clearTimeout(t); }, []);

  if (data.length === 0) return <EmptyChart message="Add sales data to see revenue by agent" icon={TrendingUp} />;
  return (
    <div ref={chartRef} className="h-64 md:h-72 transition-opacity duration-500" style={{ opacity: ready ? 1 : 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#666' }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666' }} tickFormatter={(v: number) => `₦${(v / 1000000).toFixed(1)}M`} />
          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} formatter={(v: number) => [formatNaira(v), 'MRR']} />
          <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }} />
          <Bar dataKey="mrc" name="MRR (Active)" radius={[4, 4, 0, 0]} maxBarSize={30}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RegionPieChart({ data }: { data: RegionMetrics[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 200); return () => clearTimeout(t); }, []);

  const hasData = data.some((r) => r.mrr > 0);
  if (!hasData) return <EmptyChart message="No regional revenue data yet" icon={TrendingUp} />;
  return (
    <div className="h-64 md:h-72 transition-opacity duration-500" style={{ opacity: ready ? 1 : 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="mrr" nameKey="region" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => [formatNaira(v), 'MRR']} />
          <Legend verticalAlign="bottom" height={24} iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function AttainmentBadge({ value }: { value: number }) {
  return (
    <span className={cn(
      'px-3 py-1 rounded-full text-[10px] font-bold font-mono',
      value >= 100 ? 'bg-green-100 text-green-700' : value >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
    )}>
      {value}%
    </span>
  );
}

function RegionTable({ data }: { data: RegionMetrics[] }) {
  const hasData = data.some((r) => r.mrr > 0);
  if (!hasData) return <EmptyChart message="No regional data yet" icon={Database} />;
  return (
    <div className="overflow-x-auto -mx-6 md:-mx-8">
      <div className="inline-block min-w-full align-middle px-6 md:px-8">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
              <th className="pb-3 pr-4">Region</th>
              <th className="pb-3 px-4 text-right">MRR</th>
              <th className="pb-3 px-4 text-right">Active</th>
              <th className="pb-3 px-4 text-right">ARPU</th>
              <th className="pb-3 px-4 text-right">Target</th>
              <th className="pb-3 pl-4 text-right">Attainment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-body text-sm">
            {data.map((r, i) => (
              <tr key={r.region} className="hover:bg-surface-container-lowest transition-colors" style={{ animationDelay: `${i * 60}ms` }}>
                <td className="py-3.5 pr-4 font-bold text-primary">{r.region}</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold">{formatNaira(r.mrr)}</td>
                <td className="py-3.5 px-4 text-right font-mono">{r.activeSubscribers}</td>
                <td className="py-3.5 px-4 text-right font-mono">{formatNaira(r.arpu)}</td>
                <td className="py-3.5 px-4 text-right font-mono">{formatNaira(r.targetRevenue)}</td>
                <td className="py-3.5 pl-4 text-right"><AttainmentBadge value={r.attainment} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SegmentTable({ data }: { data: { segment: string; count: number; active: number; mrc: number; arpu: number }[] }) {
  const hasData = data.some((s) => s.count > 0);
  if (!hasData) return <EmptyChart message="No segment data yet" icon={Database} />;
  return (
    <div className="overflow-x-auto -mx-6 md:-mx-8">
      <div className="inline-block min-w-full align-middle px-6 md:px-8">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
              <th className="pb-3 pr-4">Segment</th>
              <th className="pb-3 px-4 text-right">Total</th>
              <th className="pb-3 px-4 text-right">Active</th>
              <th className="pb-3 px-4 text-right">MRR</th>
              <th className="pb-3 pl-4 text-right">ARPU</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-body text-sm">
            {data.map((s, i) => (
              <tr key={s.segment} className="hover:bg-surface-container-lowest transition-colors" style={{ animationDelay: `${i * 60}ms` }}>
                <td className="py-3.5 pr-4 font-bold text-primary">{s.segment}</td>
                <td className="py-3.5 px-4 text-right font-mono">{s.count}</td>
                <td className="py-3.5 px-4 text-right font-mono">{s.active}</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold">{formatNaira(s.mrc)}</td>
                <td className="py-3.5 pl-4 text-right font-mono">{formatNaira(s.arpu)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AgentTable({ data }: { data: AgentMetrics[] }) {
  if (data.length === 0) return <EmptyChart message="No agent data yet" icon={Users} />;
  return (
    <div className="overflow-x-auto -mx-6 md:-mx-8">
      <div className="inline-block min-w-full align-middle px-6 md:px-8">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
              <th className="pb-3 pr-3">Agent</th>
              <th className="pb-3 pr-3">Region</th>
              <th className="pb-3 px-3 text-right">Active</th>
              <th className="pb-3 px-3 text-right">Sales</th>
              <th className="pb-3 px-3 text-right">MRR</th>
              <th className="pb-3 px-3 text-right">NRC</th>
              <th className="pb-3 px-3 text-right">Target</th>
              <th className="pb-3 pl-3 text-right">Attainment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-body text-sm">
            {data.map((a, i) => (
              <tr key={a.name} className="hover:bg-surface-container-lowest transition-colors" style={{ animationDelay: `${i * 40}ms` }}>
                <td className="py-3 pr-3 font-bold text-primary whitespace-nowrap">{a.name}</td>
                <td className="py-3 pr-3 font-mono text-[11px]">{a.region}</td>
                <td className="py-3 px-3 text-right font-mono">{a.customerCount}</td>
                <td className="py-3 px-3 text-right font-mono">{a.newCustomers}</td>
                <td className="py-3 px-3 text-right font-mono font-bold">{formatNaira(a.mrc)}</td>
                <td className="py-3 px-3 text-right font-mono">{formatNaira(a.nrc)}</td>
                <td className="py-3 px-3 text-right font-mono">{formatNaira(a.targetRevenue)}</td>
                <td className="py-3 pl-3 text-right"><AttainmentBadge value={a.attainment} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SalesDashboard() {
  const { data, loading, error, mutate } = useSalesMetrics();

  const visibleKpiCount = useStaggeredIndex(data ? 6 : 0, 100);

  if (loading && !data) {
    return (
      <SalesLayout>
        <div className="max-w-7xl mx-auto">
          <header className="mb-8 md:mb-10">
            <div className="h-7 w-56 bg-surface-container-low rounded animate-pulse mb-2" />
            <div className="h-3 w-40 bg-surface-container-low rounded animate-pulse" />
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 mb-8 md:mb-10">
            {Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 mb-8 md:mb-10">
            <SectionCard><ChartSkeleton /></SectionCard>
            <SectionCard><ChartSkeleton /></SectionCard>
          </div>
          <SectionCard className="mb-8">
            <div className="h-4 w-32 bg-surface-container-low rounded animate-pulse mb-6" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="h-4 w-24 bg-surface-container-low rounded animate-pulse" />
                  <div className="h-4 w-16 bg-surface-container-low rounded animate-pulse ml-auto" />
                  <div className="h-4 w-16 bg-surface-container-low rounded animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </SalesLayout>
    );
  }

  if (error && !data) {
    return (
      <SalesLayout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="font-display text-xl font-bold text-primary">Could Not Load</h2>
          <p className="text-on-surface-variant text-sm max-w-md text-center">
            {error}. Check your connection and try again.
          </p>
          <button onClick={mutate} className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 py-3 hover:scale-105 transition-transform shadow-lg">
            Retry
          </button>
        </div>
      </SalesLayout>
    );
  }

  if (!data) {
    return (
      <SalesLayout>
        <div className="max-w-7xl mx-auto min-h-[50vh] flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 rounded-full bg-surface-container-low flex items-center justify-center">
            <Database className="w-8 h-8 text-on-surface-variant/40" />
          </div>
          <h2 className="font-display text-2xl font-bold text-primary">No Sales Data Yet</h2>
          <p className="text-on-surface-variant text-sm max-w-md text-center leading-relaxed">
            Import your sales records via CSV or add records manually to start tracking KPIs.
          </p>
          <div className="flex gap-4 pt-2">
            <Link href="/admin/sales/import" className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 py-3 hover:scale-105 transition-transform shadow-lg">
              Import CSV
            </Link>
            <Link href="/admin/sales/records" className="rounded-full border border-border font-mono text-[10px] uppercase font-bold px-8 py-3 hover:bg-surface-container-low transition-all">
              Add Record
            </Link>
          </div>
        </div>
      </SalesLayout>
    );
  }

  const { overall, regionMetrics, agentMetrics, segmentBreakdown, totalRecords } = data;

  const kpiCards = [
    { label: 'Monthly Revenue', value: formatNaira(overall.mrr), icon: DollarSign, color: 'text-secondary', detail: 'From active customers' },
    { label: 'Avg. per Customer', value: formatNaira(overall.arpu), icon: TrendingUp, color: 'text-green-600', detail: 'Monthly average' },
    { label: 'Active Customers', value: String(overall.activeSubscribers), icon: Users, color: 'text-blue-600', detail: 'Paying accounts' },
    { label: 'Churn Rate', value: String(overall.churnRate), unit: '%', icon: UserX, color: 'text-red-500', detail: 'Lost / active customers' },
    { label: 'Installation Fees', value: formatNaira(overall.nrcRevenue), icon: BarChart3, color: 'text-orange-500', detail: 'One-time charges' },
    { label: 'Total Records', value: String(totalRecords), icon: Activity, color: 'text-purple-600', detail: 'All entries in system' },
  ];

  return (
    <SalesLayout>
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 md:mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">Sales Dashboard</h1>
            <div className="flex items-center gap-2 mt-1 opacity-60">
              <Activity className="w-3 h-3 text-secondary" />
              <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold">Live updates every 30 seconds</p>
            </div>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link href="/admin/sales/import" className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-5 py-2.5 hover:scale-105 transition-transform shadow-lg">
              Import
            </Link>
            <Link href="/admin/sales/records" className="rounded-full border border-border font-mono text-[10px] uppercase font-bold px-5 py-2.5 hover:bg-surface-container-low transition-all">
              Records
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 mb-8 md:mb-10">
          {kpiCards.map((item, i) => (
            <AnimatedCard key={i} {...item} index={i} visibleCount={visibleKpiCount} />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 mb-8 md:mb-10">
          <SectionCard>
            <SectionTitle icon={TrendingUp} label="Revenue by Agent" />
            <AgentBarChart data={agentMetrics} />
          </SectionCard>

          <SectionCard>
            <SectionTitle icon={TrendingUp} label="Revenue by Region" />
            <RegionPieChart data={regionMetrics} />
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 mb-8 md:mb-10">
          <SectionCard>
            <SectionTitle icon={Database} label="Regional Performance" />
            <RegionTable data={regionMetrics} />
          </SectionCard>

          <SectionCard>
            <SectionTitle icon={Database} label="Segment Breakdown" />
            <SegmentTable data={segmentBreakdown} />
          </SectionCard>
        </div>

        <SectionCard className="mb-8 md:mb-12">
          <SectionTitle icon={Users} label="Agent Performance" />
          <AgentTable data={agentMetrics} />
        </SectionCard>
      </div>
    </SalesLayout>
  );
}
