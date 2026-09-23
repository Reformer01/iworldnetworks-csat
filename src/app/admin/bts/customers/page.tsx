'use client';

import React, { useState, useEffect } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useBtsCustomers } from '@/hooks/use-bts-data';
import { cn, toLocalDateString } from '@/lib/utils';
import { iconToneClass } from '@/lib/icon-tone';
import { Button } from '@/components/ui/button';
import { MobileToolbar } from '@/components/admin/MobileToolbar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  Wifi,
  DollarSign,
  CheckCircle2,
  ShieldAlert,
  Activity,
  AlertTriangle,
  RadioTower,
} from 'lucide-react';
import { getEffectiveMrr } from '@/lib/customer-mrr';
import { BTS_REGIONS } from '@/lib/bts-data';

const LIFECYCLES = ['active', 'blocked', 'inactive', 'churned'] as const;
const ACCOUNT_TYPES = ['ENTERPRISE', 'RETAIL', 'SME', 'RESIDENTIAL', 'PARTNERS_HOSTS', 'NEIGHBOURHOOD', 'BUNDLED', 'OTHER'];

function formatNaira(amount: number) {
  if (amount >= 1000000) return '₦' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '₦' + (amount / 1000).toFixed(1) + 'K';
  return '₦' + amount.toLocaleString();
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border', className)}>{children}</div>;
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <SectionCard className="flex items-center gap-4 p-5">
      <Icon className={cn('size-5 shrink-0', iconToneClass(color))} aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-headline text-lg font-semibold tabular-nums break-words xl:text-xl" title={value}>{value}</p>
      </div>
    </SectionCard>
  );
}

function LifecycleBadge({ lifecycle }: { lifecycle: string | null }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    blocked: 'bg-amber-100 text-amber-700',
    inactive: 'bg-orange-100 text-orange-700',
    churned: 'bg-zinc-200 text-zinc-600',
  };
  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap',
        styles[lifecycle || ''] || 'bg-zinc-100 text-zinc-500',
      )}
    >
      {lifecycle || '—'}
    </span>
  );
}

function AccountBadge({ type }: { type: string | null }) {
  const styles: Record<string, string> = {
    ENTERPRISE: 'bg-purple-100 text-purple-700',
    RETAIL: 'bg-blue-100 text-blue-700',
    SME: 'bg-orange-100 text-orange-700',
    RESIDENTIAL: 'bg-emerald-100 text-emerald-700',
    PARTNERS_HOSTS: 'bg-pink-100 text-pink-700',
    NEIGHBOURHOOD: 'bg-cyan-100 text-cyan-700',
    BUNDLED: 'bg-violet-100 text-violet-700',
    OTHER: 'bg-zinc-100 text-zinc-600',
  };
  const t = type || 'OTHER';
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap', styles[t] || styles.OTHER)}>
      {t === 'NEIGHBOURHOOD' ? 'Neighbourhood' : t === 'PARTNERS_HOSTS' ? 'Partners & Hosts' : t === 'BUNDLED' ? 'Bundled account' : t === 'OTHER' ? 'Plan not provided' : t}
    </span>
  );
}

function MatchBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    matched: 'bg-emerald-100 text-emerald-700',
    manual: 'bg-violet-100 text-violet-700',
    pending: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap', styles[state] || styles.pending)}>
      {state}
    </span>
  );
}

function DeviceBadge({ status, outages }: { status: string | null; outages: number | null }) {
  const ok = status === 'active';
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap w-fit',
          ok
            ? 'bg-green-100 text-green-700'
            : status === 'down' || status === 'disabled'
              ? 'bg-red-100 text-red-700'
              : 'bg-zinc-100 text-zinc-500',
        )}
      >
        {status || 'unknown'}
      </span>
      {outages != null && outages > 0 && (
        <span className="text-[10px] font-mono font-bold text-red-600">
          {outages} outage{outages === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}

export default function BtsCustomersPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRegion, setFilterRegion] = useState('__all');
  const [filterLifecycle, setFilterLifecycle] = useState('__all');
  const [filterAccountType, setFilterAccountType] = useState('__all');
  const [filterOverdue, setFilterOverdue] = useState('__all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterRegion, filterLifecycle, filterAccountType, filterOverdue]);

  const { records, summary, total, totalPages, loading } = useBtsCustomers({
    search: debouncedSearch || undefined,
    region: filterRegion !== '__all' ? filterRegion : undefined,
    lifecycle: filterLifecycle !== '__all' ? filterLifecycle : undefined,
    accountType: filterAccountType !== '__all' ? filterAccountType : undefined,
    overdue: filterOverdue !== '__all' ? (filterOverdue as 'true' | 'false') : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const coveragePct = summary && summary.total > 0 ? Math.round(((summary.matched + summary.manual) / summary.total) * 1000) / 10 : 0;
  const pendingPct = summary && summary.total > 0 ? Math.round((summary.pending / summary.total) * 1000) / 10 : 0;

  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">BTS Customers</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
              Live unified roster &mdash; Splynx customers on UISP towers · Intelligence is the source of truth for accurate counts
            </p>
          </div>
          <MobileToolbar
            primary={
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, login..."
                  className="w-64 pl-9 rounded-xl font-mono text-xs"
                />
              </div>
            }
            secondary={
              <a
                href="/admin/intelligence"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold"
              >
                <Activity className="w-3 h-3" /> Intelligence
              </a>
            }
            label="Actions"
          />
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3 md:gap-4 mb-6">
          <KpiCard label="Total" value={(summary?.total ?? 0).toLocaleString()} icon={Users} color="bg-slate-900" />
          <KpiCard label="Coverage" value={`${coveragePct}%`} icon={CheckCircle2} color="bg-emerald-600" />
          <KpiCard label="Matched" value={(summary?.matched ?? 0).toLocaleString()} icon={Wifi} color="bg-emerald-500" />
          <KpiCard label="Manual" value={(summary?.manual ?? 0).toLocaleString()} icon={ShieldAlert} color="bg-violet-500" />
          <KpiCard label="Pending" value={`${pendingPct}%`} icon={AlertTriangle} color="bg-amber-500" />
          <KpiCard label="Towers" value={(summary?.towers ?? 0).toLocaleString()} icon={RadioTower} color="bg-sky-500" />
        </div>
        <div className="mb-4 font-mono text-[10px] leading-relaxed bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-800">
          <strong>Coverage = (Matched + Manual) ÷ Total.</strong> Pending = need review. Potential MRC includes active + inactive
          services; Active MRC is active service status only. Use Overdue for invoice payment status.
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button onClick={async () => {
            if (!user) return;
            const token = await user.getIdToken();
            const params = new URLSearchParams();
            if (filterRegion !== '__all') params.set('region', filterRegion);
            if (filterLifecycle !== '__all') params.set('lifecycle', filterLifecycle);
            if (filterAccountType !== '__all') params.set('accountType', filterAccountType);
            if (filterOverdue !== '__all') params.set('overdue', filterOverdue);
            if (debouncedSearch) params.set('search', debouncedSearch);
            params.set('pageSize','500');
            const res = await fetch(`/api/admin/bts/customers?${params}`, {headers:{Authorization:`Bearer ${token}`}});
            const j = await res.json();
            const recs: Array<Record<string,unknown>> = j.data?.records || [];
            const rows = [['Tower','Customer','Lifecycle','Account Type','MRR','Device Status','Match','Matched At']];
            recs.forEach((r:Record<string,unknown>)=> rows.push([String(r.btsName||''), String(r.customerName||''), String(r.lifecycle||''), String(r.accountType||''), String(r.mrrTotal||0), String(r.uispDeviceStatus||''), String(r.matchState||''), String(r.matchedAt? new Date(r.matchedAt as number).toISOString().slice(0,10):'')]));
            const csv = rows.map(r=> r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
            const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`bts-customers-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
          }} className="ml-auto px-4 py-2 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold">Export CSV</button>
          <Select value={filterRegion} onValueChange={setFilterRegion}>
            <SelectTrigger className="w-[170px] rounded-xl font-mono text-[10px] uppercase font-bold">
              <SelectValue placeholder="All Regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Regions</SelectItem>
              {BTS_REGIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterOverdue} onValueChange={setFilterOverdue}>
            <SelectTrigger className="w-[150px] rounded-xl font-mono text-[10px] uppercase font-bold">
              <SelectValue placeholder="Overdue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Payment Status</SelectItem>
              <SelectItem value="true">Overdue</SelectItem>
              <SelectItem value="false">Not Overdue</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterLifecycle} onValueChange={setFilterLifecycle}>
            <SelectTrigger className="w-[150px] rounded-xl font-mono text-[10px] uppercase font-bold">
              <SelectValue placeholder="All Lifecycles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Lifecycles</SelectItem>
              {LIFECYCLES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAccountType} onValueChange={setFilterAccountType}>
            <SelectTrigger className="w-[190px] rounded-xl font-mono text-[10px] uppercase font-bold">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Account Types</SelectItem>
              {ACCOUNT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === 'NEIGHBOURHOOD' ? 'Neighbourhood' : t === 'PARTNERS_HOSTS' ? 'Partners & Hosts' : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest opacity-60 font-bold">
            {total.toLocaleString()} customer{total === 1 ? '' : 's'}
          </span>
        </div>

        <SectionCard className="p-0 overflow-hidden">
          {loading ? (
            <div className="h-96 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-secondary" />
            </div>
          ) : records.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center">
              <ShieldAlert className="w-10 h-10 text-on-surface-variant/20 mb-3" />
              <p className="font-mono text-[11px] text-on-surface-variant/40 uppercase font-bold tracking-widest">
                No customers match the current filters
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full min-w-[880px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                    <th className="py-3 px-4">Tower</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Lifecycle</th>
                    <th className="py-3 px-4">Account Type</th>
                    <th className="py-3 px-4 text-right">MRR</th>
                    <th className="py-3 px-4">Device Status</th>
                    <th className="py-3 px-4">Match</th>
                    <th className="py-3 px-4 text-right">Matched At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-body text-sm">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <Wifi className="w-3.5 h-3.5 text-secondary shrink-0" />
                          <span className="font-mono text-[11px] font-bold whitespace-nowrap">{r.btsName || '—'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-bold text-primary whitespace-nowrap">{r.customerName || '—'}</p>
                        <p className="font-mono text-[10px] text-on-surface-variant/60 truncate max-w-[220px]">{r.email || ''}</p>
                      </td>
                      <td className="py-2.5 px-4">
                        <LifecycleBadge lifecycle={r.lifecycle} />
                      </td>
                      <td className="py-2.5 px-4">
                        <AccountBadge type={r.accountType} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold whitespace-nowrap">{formatNaira(getEffectiveMrr({ mrrTotal: r.mrrTotal, servicePlan: r.servicePlan }))}</td>
                      <td className="py-2.5 px-4">
                        <DeviceBadge status={r.uispDeviceStatus} outages={r.uispOutageCount} />
                      </td>
                      <td className="py-2.5 px-4">
                        <MatchBadge state={r.matchState || 'pending'} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                        {r.matchedAt ? toLocalDateString(new Date(r.matchedAt)) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <div className="flex items-center justify-between mt-4">
          <span className="font-mono text-[10px] uppercase tracking-widest opacity-60 font-bold">
            Page {page} of {Math.max(totalPages, 1)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages || loading}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </SalesLayout>
  );
}
