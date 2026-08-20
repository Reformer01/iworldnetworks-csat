'use client';

import React, { useMemo, useState } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useIntelligence } from '@/hooks/use-intelligence';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2,
  Users,
  Wifi,
  RadioTower,
  DollarSign,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock3,
  MessageSquare,
  TrendingUp,
  Search,
  RefreshCw,
  MapPin,
  Activity,
  Zap,
  CreditCard,
  Building2,
  Eye,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white p-5 md:p-6 rounded-2xl whisper-shadow border border-border', className)}>{children}</div>;
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  hint?: string;
}) {
  return (
    <SectionCard className="flex items-center gap-4 p-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
        <p className="font-display text-xl font-black text-primary truncate">{value}</p>
        {sub && <p className="font-mono text-[10px] font-bold text-on-surface-variant/70 truncate">{sub}</p>}
        {hint && <p className="font-mono text-[9px] text-on-surface-variant/50 truncate">{hint}</p>}
      </div>
    </SectionCard>
  );
}

function DonutChart({ data, colors }: { data: Array<{ name: string; value: number }>; colors: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={82} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, fontSize: 11, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function fmtNaira(n: number) {
  if (n >= 1_000_000) return '₦' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1000) return '₦' + (n / 1000).toFixed(1) + 'K';
  return '₦' + n.toLocaleString();
}
function fmt(n: number) {
  return n.toLocaleString();
}

const LIFECYCLE_COLORS = ['#10b981', '#f97316', '#eab308', '#71717a'];
const MATCH_COLORS = ['#10b981', '#8b5cf6', '#f59e0b'];
const PAYMENT_COLORS = ['#f43f5e', '#10b981'];

export default function IntelligencePage() {
  const { data, loading, error, refresh } = useIntelligence();
  const [searchBts, setSearchBts] = useState('');
  const [selectedBts, setSelectedBts] = useState<(typeof data extends null ? never : NonNullable<typeof data>['byBts'][number]) | null>(
    null,
  );
  const [filterRegion, setFilterRegion] = useState<string>('__all');

  const filteredBts = useMemo(() => {
    if (!data) return [];
    let rows = data.byBts;
    if (filterRegion !== '__all') rows = rows.filter((r) => r.region === filterRegion);
    if (searchBts) {
      const s = searchBts.toLowerCase();
      rows = rows.filter((r) => r.btsName.toLowerCase().includes(s) || r.region.toLowerCase().includes(s));
    }
    return rows;
  }, [data, searchBts, filterRegion]);

  if (loading) {
    return (
      <SalesLayout>
        <div className="max-w-screen-2xl mx-auto h-96 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-secondary" />
        </div>
      </SalesLayout>
    );
  }
  if (error || !data) {
    return (
      <SalesLayout>
        <div className="max-w-screen-2xl mx-auto py-12 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="font-mono text-xs font-bold text-red-600">{error || 'No data'}</p>
          <Button onClick={refresh} className="mt-4 rounded-full">
            Retry
          </Button>
        </div>
      </SalesLayout>
    );
  }

  const lifecycleData = data.lifecycle.map((l) => ({ name: l.name, value: l.count }));
  const matchData = data.matchState.map((m) => ({ name: m.name, value: m.count }));
  const paymentData = [
    { name: 'Current', value: data.payment.current },
    { name: 'Overdue', value: data.payment.overdue },
  ];

  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto">
        {/* Header */}
        <header className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-black text-primary uppercase tracking-tight">Network Intelligence</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-60 mt-1">
              Single source of truth — every customer has a BTS, a plan, and an MRR. All counts share one denominator.
            </p>
            <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] font-bold">
              <span
                className={cn(
                  'px-2.5 py-1 rounded-full',
                  data.syncMeta.lastStatus === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                )}
              >
                Sync: {data.syncMeta.lastStatus || 'idle'}{' '}
                {data.syncMeta.lastSyncAt ? '· ' + new Date(data.syncMeta.lastSyncAt).toLocaleString('en-GB') : '· never'}
              </span>
              {data.syncMeta.lastError && (
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 truncate max-w-[420px]">
                  {data.syncMeta.lastError}
                </span>
              )}
              {data.syncMeta.invoicesApiDenied && (
                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  Invoice API denied — Splynx key needs Finance permission
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={refresh} className="rounded-full font-mono text-[10px] uppercase font-bold">
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
            </Button>
          </div>
        </header>

        {/* KPI GRID — Row 1: accurate totals, no mismatched % */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-4">
          <KpiCard label="Total" value={fmt(data.totals.total)} icon={Users} color="bg-slate-900" sub="All customers (deleted=false)" />
          <KpiCard
            label="Active"
            value={fmt(data.totals.active)}
            sub={`${data.lifecycle[0].percent}% · ${fmtNaira(data.totals.activeMrr)} MRR`}
            icon={CheckCircle2}
            color="bg-emerald-600"
          />
          <KpiCard
            label="In-Use"
            value={fmt(data.totals.online)}
            sub={`${data.totals.total ? Math.round((data.totals.online / data.totals.total) * 10) / 10 : 0}% online now`}
            icon={Zap}
            color="bg-sky-600"
          />
          <KpiCard
            label="Inactive"
            value={fmt(data.totals.inactive)}
            sub={`${data.lifecycle[1].percent}%`}
            icon={Activity}
            color="bg-orange-500"
          />
          <KpiCard
            label="Blocked"
            value={fmt(data.totals.blocked)}
            sub={`${data.lifecycle[2].percent}%`}
            icon={ShieldAlert}
            color="bg-amber-500"
          />
          <KpiCard
            label="Churned"
            value={fmt(data.totals.churned)}
            sub={`${data.lifecycle[3].percent}%`}
            icon={TrendingUp}
            color="bg-zinc-500"
          />
          <KpiCard
            label="Overdue"
            value={fmt(data.totals.overdue)}
            sub={`${data.totals.overdueRate}% — need attention`}
            icon={CreditCard}
            color="bg-rose-600"
          />
          <KpiCard
            label="Avg MRR"
            value={fmtNaira(data.totals.avgMrr)}
            sub={`${fmtNaira(data.totals.totalMrr)} total`}
            icon={DollarSign}
            color="bg-violet-600"
          />
        </div>

        {/* KPI ROW 2: coverage, engagement */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="Matched"
            value={`${100 - data.matchState[2].percent}%`}
            sub={`${data.matchState[0].count + data.matchState[1].count} of ${data.totals.total} have a tower`}
            icon={RadioTower}
            color="bg-emerald-600"
            hint={`${data.matchState[2].count} pending · ${data.matchState[2].percent}%`}
          />
          <KpiCard
            label="Pending"
            value={fmt(data.matchState[2].count)}
            sub={`${data.matchState[2].percent}% need review`}
            icon={AlertTriangle}
            color="bg-amber-500"
          />
          <KpiCard
            label="Reminders"
            value={`${data.engagement.reminders15 + data.engagement.reminders30}`}
            sub={`15d:${data.engagement.reminders15} · 30d:${data.engagement.reminders30}`}
            icon={Clock3}
            color="bg-sky-600"
          />
          <KpiCard
            label="Churn Replies"
            value={`${data.engagement.churnResponses} / ${data.engagement.churnSent}`}
            sub={`${data.engagement.responseRate}% response rate`}
            icon={MessageSquare}
            color="bg-violet-600"
          />
        </div>

        {/* CHARTS ROW — 3 donuts, no stacked % nonsense, just counts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <SectionCard>
            <h3 className="font-display font-black uppercase tracking-tight text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" /> Lifecycle
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-50">
              Active / Inactive / Blocked / Churned — denominator = Total
            </p>
            <DonutChart data={lifecycleData} colors={LIFECYCLE_COLORS} />
            <div className="grid grid-cols-2 gap-2 mt-2">
              {data.lifecycle.map((l, i) => (
                <div key={l.name} className="flex items-center gap-2 font-mono text-[10px] font-bold">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: LIFECYCLE_COLORS[i] }} />
                  <span className="truncate">{l.name}</span>
                  <span className="ml-auto">
                    {fmt(l.count)} · {l.percent}%
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard>
            <h3 className="font-display font-black uppercase tracking-tight text-sm flex items-center gap-2">
              <RadioTower className="w-4 h-4 text-violet-600" /> Tower Coverage
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-50">
              Matched / Manual / Pending — every customer belongs somewhere
            </p>
            <DonutChart data={matchData} colors={MATCH_COLORS} />
            <div className="grid grid-cols-1 gap-1.5 mt-2">
              {data.matchState.map((m, i) => (
                <div key={m.name} className="flex items-center gap-2 font-mono text-[10px] font-bold">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: MATCH_COLORS[i] }} />
                  <span>{m.name}</span>
                  <span className="ml-auto">
                    {fmt(m.count)} · {m.percent}%
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard>
            <h3 className="font-display font-black uppercase tracking-tight text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-rose-600" /> Payment Health
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-50">
              Overdue vs Current — same total, honest %
            </p>
            <DonutChart data={paymentData} colors={PAYMENT_COLORS} />
            <div className="flex flex-col gap-1.5 mt-2 font-mono text-[10px] font-bold">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Current{' '}
                <span className="ml-auto">
                  {fmt(data.payment.current)} · {100 - data.payment.overduePercent}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Overdue{' '}
                <span className="ml-auto">
                  {fmt(data.payment.overdue)} · {data.payment.overduePercent}%
                </span>
              </div>
              <p className="text-[9px] font-normal opacity-60 mt-1">
                Overdue = Customer.overdueInfo.hasOverdueInvoice (denormalized from Splynx invoices). No invoice-scan sampling.
              </p>
            </div>
          </SectionCard>
        </div>

        {/* REGIONS — honest table + bar, no hidden normalization */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mb-6">
          <SectionCard className="xl:col-span-3">
            <h3 className="font-display font-black uppercase tracking-tight text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-sky-600" /> Regions
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-50 mb-3">
              Customers & active MRR rolled up via canonical BTS region. “Unknown” = no BTS + no city region.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byRegion} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="region"
                    tick={{ fontSize: 11, fontWeight: 700 }}
                    width={90}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 11, border: 'none' }} />
                  <Bar dataKey="customers" name="Customers" fill="#0f172a" radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left border-collapse">
                <thead className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-60 border-b">
                  <tr>
                    <th className="py-2">Region</th>
                    <th className="py-2 text-right">Customers</th>
                    <th className="py-2 text-right">Active</th>
                    <th className="py-2 text-right">Towers</th>
                    <th className="py-2 text-right">MRR</th>
                    <th className="py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-xs">
                  {data.byRegion.map((r) => (
                    <tr key={r.region} className="hover:bg-muted/40">
                      <td className="py-2 font-bold">{r.region}</td>
                      <td className="py-2 text-right">{fmt(r.customers)}</td>
                      <td className="py-2 text-right text-emerald-700 font-bold">{fmt(r.active)}</td>
                      <td className="py-2 text-right">{r.towers}</td>
                      <td className="py-2 text-right font-bold">{fmtNaira(r.mrr)}</td>
                      <td className="py-2 text-right">{r.percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
          <SectionCard className="xl:col-span-2">
            <h3 className="font-display font-black uppercase tracking-tight text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-600" /> Plans
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-50 mb-3">
              Top service plans by customers (servicePlan). Every customer has one.
            </p>
            <div className="space-y-2">
              {data.byPlan.slice(0, 10).map((p) => (
                <div key={p.plan} className="flex items-center gap-3">
                  <span className="font-mono text-[11px] font-bold w-32 truncate" title={p.plan}>
                    {p.plan}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-secondary" style={{ width: `${Math.max(4, p.percent)}%` }} />
                  </div>
                  <span className="font-mono text-[11px] font-bold w-16 text-right">{fmt(p.count)}</span>
                  <span className="font-mono text-[10px] opacity-60 w-10 text-right">{p.percent}%</span>
                </div>
              ))}
            </div>
            <h4 className="font-mono text-[10px] uppercase tracking-widest font-black mt-6 mb-2">Account Types</h4>
            <div className="space-y-1.5">
              {data.byAccountType.map((a) => (
                <div key={a.type} className="flex items-center justify-between font-mono text-[11px]">
                  <span className="font-bold">{a.type}</span>
                  <span>
                    {fmt(a.count)} · {fmtNaira(a.mrr)} · <span className="opacity-60">{a.percent}%</span>
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* BTS INTELLIGENCE — searchable, honest */}
        <SectionCard className="p-0 overflow-hidden">
          <div className="p-5 md:p-6 flex flex-col md:flex-row gap-3 justify-between items-start md:items-center border-b">
            <div>
              <h3 className="font-display font-black uppercase tracking-tight text-sm flex items-center gap-2">
                <RadioTower className="w-4 h-4 text-secondary" /> BTS Intelligence — every tower, every customer, every naira
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-50">
                Customers attributed by unified btsId (UISP). MRR = sum of customer mrrTotal. No sampled percentages.
              </p>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchBts}
                  onChange={(e) => setSearchBts(e.target.value)}
                  placeholder="Search tower or region..."
                  className="pl-9 rounded-full font-mono text-xs h-9"
                />
              </div>
              <select
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                className="rounded-full border bg-white px-3 font-mono text-[11px] font-bold h-9"
              >
                <option value="__all">All regions</option>
                {data.byRegion.map((r) => (
                  <option key={r.region} value={r.region}>
                    {r.region}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Top towers bar */}
          <div className="p-5">
            <p className="font-mono text-[10px] uppercase tracking-widest font-black mb-2">Top towers by customers</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topTowers} margin={{ left: 0, right: 12, top: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="towerName" tick={{ fontSize: 10, fontWeight: 700 }} interval={0} angle={-18} dy={12} height={52} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 11 }} />
                  <Bar dataKey="customers" name="Customers" fill="#10b981" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-60 border-y bg-muted/30">
                <tr>
                  <th className="py-3 px-4">Tower</th>
                  <th className="py-3 px-4">Region</th>
                  <th className="py-3 px-4 text-right">Customers</th>
                  <th className="py-3 px-4 text-right">Active</th>
                  <th className="py-3 px-4 text-right">MRR</th>
                  <th className="py-3 px-4 text-right">Share of total</th>
                  <th className="py-3 px-4 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono text-xs">
                {filteredBts.slice(0, 60).map((b) => (
                  <tr key={b.btsName} className="hover:bg-muted/40">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            b.status === 'active' ? 'bg-emerald-500' : b.status === 'disabled' ? 'bg-red-500' : 'bg-zinc-300',
                          )}
                        />
                        <span className="font-bold text-primary">{b.btsName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">{b.region}</td>
                    <td className="py-2.5 px-4 text-right font-black">{fmt(b.customers)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700 font-bold">{fmt(b.active)}</td>
                    <td className="py-2.5 px-4 text-right font-bold">{fmtNaira(b.mrr)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-slate-900" style={{ width: `${Math.max(2, b.percent)}%` }} />
                        </div>
                        <span className="w-10 text-right">{b.percent}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-full font-mono text-[10px] font-bold"
                        onClick={() => setSelectedBts(b)}
                      >
                        <Eye className="w-3 h-3 mr-1" /> Detail
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredBts.length > 60 && (
              <p className="p-3 text-center font-mono text-[10px] opacity-50">
                Showing 60 of {filteredBts.length} towers — use search to filter further.
              </p>
            )}
          </div>
        </SectionCard>

        {/* Detail modal — no mismatched % */}
        <Dialog open={!!selectedBts} onOpenChange={(o) => !o && setSelectedBts(null)}>
          <DialogContent className="max-w-lg rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display font-black uppercase tracking-tight flex items-center gap-2">
                <RadioTower className="w-4 h-4 text-secondary" /> {selectedBts?.btsName}
              </DialogTitle>
              <DialogDescription className="font-mono text-[11px]">
                Region {selectedBts?.region} · {selectedBts ? fmt(selectedBts.customers) : 0} customers · {selectedBts?.percent}% of network
              </DialogDescription>
            </DialogHeader>
            {selectedBts && (
              <div className="space-y-3 font-mono text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/50 rounded-xl p-3 text-center">
                    <p className="text-[9px] uppercase tracking-widest font-black opacity-60">Customers</p>
                    <p className="font-black text-lg">{fmt(selectedBts.customers)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200">
                    <p className="text-[9px] uppercase tracking-widest font-black text-emerald-700">Active</p>
                    <p className="font-black text-lg text-emerald-700">{fmt(selectedBts.active)}</p>
                    <p className="text-[10px] opacity-60">
                      {selectedBts.customers ? Math.round((selectedBts.active / selectedBts.customers) * 100) : 0}% of this tower
                    </p>
                  </div>
                  <div className="bg-slate-900 text-white rounded-xl p-3 text-center">
                    <p className="text-[9px] uppercase tracking-widest font-black opacity-70">MRR</p>
                    <p className="font-black text-lg">{fmtNaira(selectedBts.mrr)}</p>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed opacity-70">
                  Every customer on this tower has an MRR from Splynx (servicePlan → monthly price). Inactive/blocked customers contribute 0
                  to active MRR but are still counted in total. Share = this tower’s customers ÷ {fmt(data.totals.total)} total — same
                  denominator everywhere.
                </p>
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-full font-mono text-[11px] font-bold" onClick={() => setSelectedBts(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <p className="mt-6 font-mono text-[10px] text-center opacity-40">
          Intelligence is computed live from Customer (Splynx truth) + UispSite (tower truth). No sampling, no cached percentages. Refresh
          to re-sync.
        </p>
      </div>
    </SalesLayout>
  );
}
