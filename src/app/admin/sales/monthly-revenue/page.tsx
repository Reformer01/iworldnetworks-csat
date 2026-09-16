'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useSalesMonthlyRevenue } from '@/hooks/use-sales-data';
import { TrendingUp, BarChart3, Download, CreditCard, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from 'recharts';
import { regionalTargets } from '@/lib/sales-staff';

const COLORS = ['#448515', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

interface MonthlyValueRow {
  revenue: number;
  nrcRevenue: number;
  mrr: number;
  newCustomers: number;
}

function formatNumber(num: number) {
  if (num >= 1000000) return '₦' + (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return '₦' + (num / 1000).toFixed(1) + 'K';
  return '₦' + num.toLocaleString();
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border', className)}>{children}</div>;
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

function MonthlyRevenueChart({
  data,
  metric,
  title,
  color,
}: {
  data: { month: string; revenue: number; nrcRevenue: number; mrr: number; newCustomers: number }[];
  metric: 'revenue' | 'mrr' | 'nrcRevenue' | 'newCustomers';
  title: string;
  color: string;
}) {
  const chartData = data.map((d) => ({
    month: d.month,
    value: metric === 'revenue' ? d.revenue : metric === 'mrr' ? d.mrr : metric === 'nrcRevenue' ? d.nrcRevenue : d.newCustomers,
  }));

  const hasData = chartData.some((d) => d.value > 0);
  if (!hasData) return <EmptyChart message={`No ${title.toLowerCase()} data yet`} />;

  return (
    <SectionCard>
      <SectionTitle icon={BarChart3} label={title} />
      <div className="h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#666' }} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#666' }}
              tickFormatter={(v: number) => (metric === 'newCustomers' ? v.toString() : `₦${(v / 1000000).toFixed(1)}M`)}
            />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              formatter={(v: number) => [metric === 'newCustomers' ? v.toString() : formatNumber(v), title]}
            />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="circle"
              wrapperStyle={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}
            />
            <Bar dataKey="value" name={title} radius={[4, 4, 0, 0]} maxBarSize={30} fill={color} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

function MonthlyTrendChart({ data }: { data: { month: string; revenue: number; mrr: number; nrcRevenue: number }[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    'Total Revenue': d.revenue,
    MRR: d.mrr,
    NRC: d.nrcRevenue,
  }));

  const hasData = chartData.some((d) => d['Total Revenue'] > 0 || d.MRR > 0 || d.NRC > 0);
  if (!hasData) return <EmptyChart message="No revenue trend data yet" />;

  return (
    <SectionCard>
      <SectionTitle icon={TrendingUp} label="Monthly Revenue Trend" />
      <div className="h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: '#666' }} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#666' }}
              tickFormatter={(v: number) => `₦${(v / 1000000).toFixed(1)}M`}
            />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              formatter={(v: number) => [formatNumber(v), 'Revenue']}
            />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="circle"
              wrapperStyle={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}
            />
            <Line type="monotone" dataKey="Total Revenue" stroke={COLORS[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="MRR" stroke={COLORS[1]} strokeWidth={2} dot={false} strokeDasharray="5 5" activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="NRC" stroke={COLORS[2]} strokeWidth={2} dot={false} strokeDasharray="2 2" activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

function MonthlyTable({
  data,
  metric,
  title,
}: {
  data: { month: string; revenue: number; nrcRevenue: number; mrr: number; newCustomers: number }[];
  metric: 'revenue' | 'mrr' | 'nrcRevenue' | 'newCustomers';
  title: string;
}) {
  const getValue = (d: (typeof data)[0]) => {
    if (metric === 'revenue') return formatNumber(d.revenue);
    if (metric === 'mrr') return formatNumber(d.mrr);
    if (metric === 'nrcRevenue') return formatNumber(d.nrcRevenue);
    return d.newCustomers.toString();
  };

  const hasData = data.some((d) => {
    if (metric === 'revenue') return d.revenue > 0;
    if (metric === 'mrr') return d.mrr > 0;
    if (metric === 'nrcRevenue') return d.nrcRevenue > 0;
    return d.newCustomers > 0;
  });

  if (!hasData) return <EmptyChart message={`No ${title.toLowerCase()} data yet`} />;

  return (
    <SectionCard>
      <SectionTitle icon={BarChart3} label={title} />
      <div className="overflow-x-auto -mx-6 md:-mx-8">
        <div className="inline-block min-w-full align-middle px-6 md:px-8">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                <th className="pb-3 pr-4">Month</th>
                <th className="pb-3 px-4 text-right">{title}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-body text-sm">
              {data.map((d) => (
                <tr key={d.month} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="py-2 pr-4 font-bold text-primary">{d.month}</td>
                  <td className="py-2 px-4 text-right font-mono font-bold">{getValue(d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

function RegionMonthlyTable({
  data,
  metric,
}: {
  data: { region: string; monthlyData: { month: string; revenue: number; nrcRevenue: number; mrr: number; newCustomers: number }[] }[];
  metric: 'revenue' | 'mrr' | 'nrcRevenue' | 'newCustomers';
}) {
  const getValue = (d: MonthlyValueRow) => {
    if (metric === 'revenue') return formatNumber(d.revenue);
    if (metric === 'mrr') return formatNumber(d.mrr);
    if (metric === 'nrcRevenue') return formatNumber(d.nrcRevenue);
    return d.newCustomers.toString();
  };

  const allMonths = data.flatMap((r) => r.monthlyData.map((m) => m.month));
  const uniqueMonths = [...new Set(allMonths)].sort((a, b) => {
    const order = [
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
    ];
    return order.indexOf(a) - order.indexOf(b);
  });

  const hasData = data.some((r) =>
    r.monthlyData.some((m) => {
      if (metric === 'revenue') return m.revenue > 0;
      if (metric === 'mrr') return m.mrr > 0;
      if (metric === 'nrcRevenue') return m.nrcRevenue > 0;
      return m.newCustomers > 0;
    }),
  );

  if (!hasData) return <EmptyChart message={`No regional ${metric} data yet`} />;

  return (
    <SectionCard>
      <SectionTitle icon={BarChart3} label="Monthly Revenue by Region" />
      <div className="overflow-x-auto -mx-6 md:-mx-8 max-h-96 overflow-y-auto">
        <div className="inline-block min-w-full align-middle px-6 md:px-8">
          <table className="w-full min-w-[1080px] text-left border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest whitespace-nowrap">
                <th className="pb-3 pr-4">Region</th>
                {uniqueMonths.map((m) => (
                  <th key={m} className="pb-3 px-4 text-right">
                    {m.slice(0, 3)}
                  </th>
                ))}
                <th className="pb-3 pl-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-body text-sm">
              {data.map((r) => {
                const monthMap = new Map(r.monthlyData.map((m) => [m.month, m]));
                const total = r.monthlyData.reduce((sum, m) => {
                  if (metric === 'revenue') return sum + m.revenue;
                  if (metric === 'mrr') return sum + m.mrr;
                  if (metric === 'nrcRevenue') return sum + m.nrcRevenue;
                  return sum + m.newCustomers;
                }, 0);
                return (
                  <tr key={r.region} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="py-2 pr-4 font-bold text-primary">{r.region}</td>
                    {uniqueMonths.map((m) => {
                      const md = monthMap.get(m);
                      return (
                        <td key={m} className="py-2 px-4 text-right font-mono">
                          {md ? getValue(md) : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-4 text-right font-mono font-bold">
                      {getValue({ revenue: total, mrr: total, nrcRevenue: total, newCustomers: total })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

function AgentMonthlyTable({
  data,
  metric,
}: {
  data: {
    agent: string;
    region: string;
    monthlyData: { month: string; revenue: number; nrcRevenue: number; mrr: number; newCustomers: number }[];
  }[];
  metric: 'revenue' | 'mrr' | 'nrcRevenue' | 'newCustomers';
}) {
  const getValue = (d: MonthlyValueRow) => {
    if (metric === 'revenue') return formatNumber(d.revenue);
    if (metric === 'mrr') return formatNumber(d.mrr);
    if (metric === 'nrcRevenue') return formatNumber(d.nrcRevenue);
    return d.newCustomers.toString();
  };

  const allMonths = data.flatMap((r) => r.monthlyData.map((m) => m.month));
  const uniqueMonths = [...new Set(allMonths)].sort((a, b) => {
    const order = [
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
    ];
    return order.indexOf(a) - order.indexOf(b);
  });

  const hasData = data.some((r) =>
    r.monthlyData.some((m) => {
      if (metric === 'revenue') return m.revenue > 0;
      if (metric === 'mrr') return m.mrr > 0;
      if (metric === 'nrcRevenue') return m.nrcRevenue > 0;
      return m.newCustomers > 0;
    }),
  );

  if (!hasData) return <EmptyChart message={`No agent ${metric} data yet`} />;

  return (
    <SectionCard>
      <SectionTitle icon={BarChart3} label="Monthly Revenue by Agent" />
      <div className="overflow-x-auto -mx-6 md:-mx-8 max-h-96 overflow-y-auto">
        <div className="inline-block min-w-full align-middle px-6 md:px-8">
          <table className="w-full min-w-[1080px] text-left border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest whitespace-nowrap">
                <th className="pb-3 pr-4">Agent</th>
                <th className="pb-3 px-4">Region</th>
                {uniqueMonths.map((m) => (
                  <th key={m} className="pb-3 px-4 text-right">
                    {m.slice(0, 3)}
                  </th>
                ))}
                <th className="pb-3 pl-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-body text-sm">
              {data.map((a) => {
                const monthMap = new Map(a.monthlyData.map((m) => [m.month, m]));
                const total = a.monthlyData.reduce((sum, m) => {
                  if (metric === 'revenue') return sum + m.revenue;
                  if (metric === 'mrr') return sum + m.mrr;
                  if (metric === 'nrcRevenue') return sum + m.nrcRevenue;
                  return sum + m.newCustomers;
                }, 0);
                return (
                  <tr key={a.agent} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="py-2 pr-4 font-bold text-primary whitespace-nowrap">{a.agent}</td>
                    <td className="py-2 px-4 font-mono text-[11px]">{a.region}</td>
                    {uniqueMonths.map((m) => {
                      const md = monthMap.get(m);
                      return (
                        <td key={m} className="py-2 px-4 text-right font-mono text-[11px]">
                          {md ? getValue(md) : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-4 text-right font-mono font-bold">
                      {getValue({ revenue: total, mrr: total, nrcRevenue: total, newCustomers: total })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

function SegmentMonthlyTable({
  data,
  metric,
}: {
  data: { segment: string; monthlyData: { month: string; revenue: number; nrcRevenue: number; mrr: number; newCustomers: number }[] }[];
  metric: 'revenue' | 'mrr' | 'nrcRevenue' | 'newCustomers';
}) {
  const getValue = (d: MonthlyValueRow) => {
    if (metric === 'revenue') return formatNumber(d.revenue);
    if (metric === 'mrr') return formatNumber(d.mrr);
    if (metric === 'nrcRevenue') return formatNumber(d.nrcRevenue);
    return d.newCustomers.toString();
  };

  const allMonths = data.flatMap((r) => r.monthlyData.map((m) => m.month));
  const uniqueMonths = [...new Set(allMonths)].sort((a, b) => {
    const order = [
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
    ];
    return order.indexOf(a) - order.indexOf(b);
  });

  const hasData = data.some((r) =>
    r.monthlyData.some((m) => {
      if (metric === 'revenue') return m.revenue > 0;
      if (metric === 'mrr') return m.mrr > 0;
      if (metric === 'nrcRevenue') return m.nrcRevenue > 0;
      return m.newCustomers > 0;
    }),
  );

  if (!hasData) return <EmptyChart message={`No segment ${metric} data yet`} />;

  return (
    <SectionCard>
      <SectionTitle icon={BarChart3} label="Monthly Revenue by Segment" />
      <div className="overflow-x-auto -mx-6 md:-mx-8 max-h-96 overflow-y-auto">
        <div className="inline-block min-w-full align-middle px-6 md:px-8">
          <table className="w-full min-w-[1080px] text-left border-collapse">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest whitespace-nowrap">
                <th className="pb-3 pr-4">Segment</th>
                {uniqueMonths.map((m) => (
                  <th key={m} className="pb-3 px-4 text-right">
                    {m.slice(0, 3)}
                  </th>
                ))}
                <th className="pb-3 pl-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 font-body text-sm">
              {data.map((s) => {
                const monthMap = new Map(s.monthlyData.map((m) => [m.month, m]));
                const total = s.monthlyData.reduce((sum, m) => {
                  if (metric === 'revenue') return sum + m.revenue;
                  if (metric === 'mrr') return sum + m.mrr;
                  if (metric === 'nrcRevenue') return sum + m.nrcRevenue;
                  return sum + m.newCustomers;
                }, 0);
                return (
                  <tr key={s.segment} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="py-2 pr-4 font-bold text-primary">
                      {s.segment === 'NEIGHBOURHOOD' ? 'Neighbourhood (Home)' : s.segment}
                    </td>
                    {uniqueMonths.map((m) => {
                      const md = monthMap.get(m);
                      return (
                        <td key={m} className="py-2 px-4 text-right font-mono">
                          {md ? getValue(md) : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-4 text-right font-mono font-bold">
                      {getValue({ revenue: total, mrr: total, nrcRevenue: total, newCustomers: total })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

export default function MonthlyRevenuePage() {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [metric, setMetric] = useState<'revenue' | 'mrr' | 'nrcRevenue' | 'newCustomers'>('revenue');
  const [regionFilter, setRegionFilter] = useState<string>('__all');
  const [paystack, setPaystack] = useState<{
    configured: boolean;
    monthly: { month: string; total: number; count: number }[];
    total: number;
    count: number;
  } | null>(null);
  const [paystackLoading, setPaystackLoading] = useState(false);
  const [paystackSyncing, setPaystackSyncing] = useState(false);

  const fetchPaystack = useCallback(
    async (doSync = false) => {
      if (!user) return;
      setPaystackLoading(true);
      try {
        const token = await user.getIdToken();
        const url = `/api/admin/sales/paystack-monthly${doSync ? '?sync=1' : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (json.success) setPaystack(json.data);
      } catch {}
      setPaystackLoading(false);
    },
    [user],
  );

  const handlePaystackSync = async () => {
    if (!user) return;
    setPaystackSyncing(true);
    try {
      const token = await user.getIdToken();
      await fetch('/api/admin/sales/paystack-monthly', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxPages: 10 }),
      });
      await fetchPaystack(false);
    } catch {}
    setPaystackSyncing(false);
  };

  useEffect(() => {
    if (user) fetchPaystack(false);
  }, [fetchPaystack, user]);

  const { data, loading, error, mutate } = useSalesMonthlyRevenue({
    region: regionFilter || undefined,
  });

  if (authLoading || loading) {
    return (
      <SalesLayout>
        <div className="max-w-7xl mx-auto">
          <header className="mb-8 md:mb-10">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">Monthly Revenue</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">New customer revenue by month</p>
          </header>
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <SectionCard key={i}>
                <div className="h-64 animate-pulse bg-surface-container-low/50 rounded-xl flex items-center justify-center">
                  <BarChart3 className="w-8 h-8 text-on-surface-variant/10" />
                </div>
              </SectionCard>
            ))}
          </div>
        </div>
      </SalesLayout>
    );
  }

  if (error && !data) {
    return (
      <SalesLayout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="font-display text-xl font-bold text-primary">Could Not Load</h2>
          <p className="text-on-surface-variant text-sm max-w-md text-center">{error}</p>
          <Button
            className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 py-3 hover:scale-105 transition-transform shadow-lg"
            onClick={mutate}
          >
            Retry
          </Button>
        </div>
      </SalesLayout>
    );
  }

  if (!data) return null;

  const { overallMonthly, regionMonthly, agentMonthly, segmentMonthly } = data;
  const filteredRegionMonthly =
    regionFilter && regionFilter !== '__all' ? regionMonthly.filter((r) => r.region === regionFilter) : regionMonthly;
  const filteredAgentMonthly =
    regionFilter && regionFilter !== '__all' ? agentMonthly.filter((a) => a.region === regionFilter) : agentMonthly;

  const metricLabels = {
    revenue: 'Total Revenue',
    mrr: 'MRR',
    nrcRevenue: 'NRC Revenue',
    newCustomers: 'New Customers',
  };

  const handleExportCsv = () => {
    const rows: string[][] = [['Group', 'Name', 'Month', 'Total Revenue', 'MRR', 'NRC Revenue', 'New Customers']];
    const push = (
      group: string,
      name: string,
      monthlyData: { month: string; revenue: number; nrcRevenue: number; mrr: number; newCustomers: number }[],
    ) => {
      monthlyData.forEach((d) => {
        rows.push([group, name, d.month, String(d.revenue), String(d.mrr), String(d.nrcRevenue), String(d.newCustomers)]);
      });
    };
    push('Overall', 'All', overallMonthly);
    filteredRegionMonthly.forEach((r) => push('Region', r.region, r.monthlyData));
    filteredAgentMonthly.forEach((a) => push('Agent', a.agent, a.monthlyData));
    segmentMonthly.forEach((s) => push('Segment', s.segment, s.monthlyData));

    const csv = rows.map((r) => r.map((v) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'monthly-revenue-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const metricColors = {
    revenue: '#448515',
    mrr: '#10b981',
    nrcRevenue: '#f59e0b',
    newCustomers: '#8b5cf6',
  };

  return (
    <SalesLayout>
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 md:mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">Monthly Revenue</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">New customer revenue by month</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0 min-w-0">
            <Select value={metric} onValueChange={(v: 'revenue' | 'mrr' | 'nrcRevenue' | 'newCustomers') => setMetric(v)}>
              <SelectTrigger className="w-[140px] sm:w-[160px] max-w-full rounded-xl font-mono text-[10px] uppercase font-bold">
                <SelectValue placeholder="Metric" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Total Revenue</SelectItem>
                <SelectItem value="mrr">MRR</SelectItem>
                <SelectItem value="nrcRevenue">NRC Revenue</SelectItem>
                <SelectItem value="newCustomers">New Customers</SelectItem>
              </SelectContent>
            </Select>
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="w-[150px] sm:w-[180px] max-w-full rounded-xl font-mono text-[10px] uppercase font-bold">
                <SelectValue placeholder="All Regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Regions</SelectItem>
                {regionalTargets.map((rt) => (
                  <SelectItem key={rt.region} value={rt.region}>
                    {rt.region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleExportCsv}
              className="rounded-full border border-border font-mono text-[10px] uppercase font-bold px-5 py-2.5 hover:bg-surface-container-low transition-all"
            >
              <Download className="w-3.5 h-3.5 mr-2" />
              Export
            </Button>
          </div>
        </header>

        {/* Paystack — monthly collections from gateway */}
        <SectionCard className="mb-6 border-secondary/20">
          <div className="flex flex-col sm:flex-row justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display font-bold text-base uppercase tracking-tight flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-secondary" /> Paystack Transactions
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-60 mt-1">
                Successful collections by month — gateway source of truth, reconciled with Splynx sales
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                className="rounded-full font-mono text-[10px] uppercase font-bold"
                onClick={() => fetchPaystack(false)}
                disabled={paystackLoading}
              >
                {paystackLoading ? <RefreshCw className="w-3 h-3 mr-2 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-2" />}
                Refresh
              </Button>
              <Button
                className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold"
                onClick={handlePaystackSync}
                disabled={paystackSyncing || paystackLoading}
              >
                {paystackSyncing ? <RefreshCw className="w-3 h-3 mr-2 animate-spin" /> : <Download className="w-3 h-3 mr-2" />}
                {paystackSyncing ? 'Syncing…' : 'Sync Paystack'}
              </Button>
            </div>
          </div>
          {paystackLoading ? (
            <div className="h-24 animate-pulse bg-surface-container-low/50 rounded-xl" />
          ) : !paystack?.configured ? (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="font-mono text-xs font-bold text-amber-800">PAYSTACK_SECRET_KEY not configured</p>
                <p className="font-mono text-[11px] text-amber-700/80 mt-1">
                  Set <span className="font-bold">PAYSTACK_SECRET_KEY</span> in .env (server: /home/csat.iwn.ng/.env) to `sk_live_...` or
                  `sk_test_...`, then restart. Transactions will sync on demand via “Sync Paystack”.
                </p>
              </div>
            </div>
          ) : paystack.monthly.length === 0 ? (
            <EmptyChart message="No successful Paystack transactions yet — hit Sync Paystack to pull from gateway" icon={CreditCard} />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="bg-white border rounded-xl p-4">
                  <p className="font-mono text-[9px] uppercase font-bold opacity-60">Total Collected</p>
                  <p className="font-display text-xl font-black">{formatNumber(paystack.total)}</p>
                  <p className="font-mono text-[10px] opacity-60">{paystack.count.toLocaleString()} success · all time</p>
                </div>
                {paystack.monthly.slice(0, 3).map((m) => (
                  <div key={m.month} className="bg-white border rounded-xl p-4">
                    <p className="font-mono text-[9px] uppercase font-bold opacity-60">{m.month}</p>
                    <p className="font-display text-lg font-black">{formatNumber(m.total)}</p>
                    <p className="font-mono text-[10px] opacity-60">{m.count} txns</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-b font-mono text-[10px] uppercase font-bold opacity-60 whitespace-nowrap">
                      <th className="py-2 pr-4">Month</th>
                      <th className="py-2 px-4 text-right">Transactions</th>
                      <th className="py-2 px-4 text-right">Paystack Collected</th>
                      <th className="py-2 px-4 text-right">vs Sales Revenue*</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paystack.monthly.map((m) => {
                      // m.month is year-aware ("September 2026"); sales rows are month names ("September").
                      const sales = overallMonthly.find((s) => m.month.toLowerCase().startsWith(s.month.toLowerCase()));
                      const diff = sales ? m.total - sales.revenue : null;
                      return (
                        <tr key={m.month}>
                          <td className="py-2 pr-4 font-bold">{m.month}</td>
                          <td className="py-2 px-4 text-right font-mono">{m.count}</td>
                          <td className="py-2 px-4 text-right font-mono font-bold">{formatNumber(m.total)}</td>
                          <td className="py-2 px-4 text-right font-mono text-xs opacity-70">
                            {diff === null ? '—' : `${diff >= 0 ? '+' : ''}${formatNumber(diff)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="font-mono text-[9px] opacity-50 mt-3">
                * Sales Revenue = NRC+MRC from new customers that month. Paystack = gateway success (all products). Variance helps
                reconcile.
              </p>
            </>
          )}
        </SectionCard>

        <MonthlyTrendChart data={overallMonthly} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 mb-8 md:mb-10">
          <MonthlyRevenueChart data={overallMonthly} metric={metric} title={metricLabels[metric]} color={metricColors[metric]} />
          <MonthlyTable data={overallMonthly} metric={metric} title={metricLabels[metric]} />
        </div>

        <RegionMonthlyTable data={filteredRegionMonthly} metric={metric} />

        <AgentMonthlyTable data={filteredAgentMonthly} metric={metric} />

        <SegmentMonthlyTable data={segmentMonthly} metric={metric} />
      </div>
    </SalesLayout>
  );
}
