'use client';

import React, { useState, useEffect } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useBtsCustomers, deleteBtsCustomer } from '@/hooks/use-bts-data';
import { useToast } from '@/hooks/use-toast';
import { cn, toLocalDateString } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Search,
  Trash2,
  Database,
  ChevronLeft,
  ChevronRight,
  Users,
  Wifi,
  DollarSign,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { BTS_REGIONS } from '@/lib/bts-data';
import { isSuperAdmin } from '@/lib/admin-config';

const ACCOUNT_TYPES = ['ENTERPRISE', 'RETAIL', 'SME', 'RESIDENTIAL', 'PARTNERS_HOSTS', 'NEIGHBOURHOOD', 'OTHER'];
const STATUSES = ['Active', 'Inactive'];

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
      <div className={cn('w-11 h-11 rounded-full flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
        <p className="font-display text-xl font-bold text-primary truncate">{value}</p>
      </div>
    </SectionCard>
  );
}

function AccountBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    ENTERPRISE: 'bg-purple-100 text-purple-700',
    RETAIL: 'bg-blue-100 text-blue-700',
    SME: 'bg-orange-100 text-orange-700',
    RESIDENTIAL: 'bg-emerald-100 text-emerald-700',
    PARTNERS_HOSTS: 'bg-pink-100 text-pink-700',
    NEIGHBOURHOOD: 'bg-cyan-100 text-cyan-700',
    OTHER: 'bg-zinc-100 text-zinc-600',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap', styles[type] || styles.OTHER)}>
      {type === 'NEIGHBOURHOOD' ? 'Neighbourhood' : type === 'PARTNERS_HOSTS' ? 'Partners & Hosts' : type}
    </span>
  );
}

export default function BtsCustomersPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRegion, setFilterRegion] = useState('__all');
  const [filterStatus, setFilterStatus] = useState('__all');
  const [filterAccountType, setFilterAccountType] = useState('__all');
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterRegion, filterStatus, filterAccountType]);

  const { records, summary, total, totalPages, loading, mutate } = useBtsCustomers({
    search: debouncedSearch || undefined,
    region: filterRegion !== '__all' ? filterRegion : undefined,
    status: filterStatus !== '__all' ? filterStatus : undefined,
    accountType: filterAccountType !== '__all' ? filterAccountType : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const handleDelete = async (id: string, customerName: string) => {
    if (!user) return;
    if (!window.confirm(`Delete ${customerName}? This removes the record from view.`)) return;
    setDeletingId(id);
    try {
      await deleteBtsCustomer(id, user);
      toast({ title: 'Record deleted', description: `${customerName} has been removed.` });
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setDeletingId(null);
    }
  };

  const userIsSuper = isSuperAdmin(user?.email || '');

  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">BTS Customers</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
              Imported customer records by BTS station
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Search className="w-4 h-4 text-on-surface-variant" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, site, plan..."
              className="w-64 rounded-xl font-mono text-xs"
            />
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
          <KpiCard label="Total Customers" value={(summary?.totalCustomers ?? 0).toLocaleString()} icon={Users} color="bg-secondary" />
          <KpiCard label="Active" value={(summary?.activeCustomers ?? 0).toLocaleString()} icon={TrendingUp} color="bg-emerald-500" />
          <KpiCard label="Total MRR" value={formatNaira(summary?.totalMrr ?? 0)} icon={DollarSign} color="bg-amber-500" />
          <KpiCard label="Enterprise" value={(summary?.enterpriseCustomers ?? 0).toLocaleString()} icon={Wifi} color="bg-violet-500" />
          <KpiCard label="Retail" value={(summary?.retailCustomers ?? 0).toLocaleString()} icon={Database} color="bg-sky-500" />
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
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
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] rounded-xl font-mono text-[10px] uppercase font-bold">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
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
            {total.toLocaleString()} record{total === 1 ? '' : 's'}
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
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                    <th className="py-3 px-4">S/N</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">BTS Site</th>
                    <th className="py-3 px-4">Region</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Account Type</th>
                    <th className="py-3 px-4 text-right">MRC</th>
                    <th className="py-3 px-4 text-right">Imported</th>
                    {userIsSuper && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-body text-sm">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="py-2.5 px-4 font-mono text-xs text-on-surface-variant">{r.serialNumber ?? '—'}</td>
                      <td className="py-2.5 px-4 font-bold text-primary whitespace-nowrap">{r.customerName || '—'}</td>
                      <td className="py-2.5 px-4 font-mono text-[11px] whitespace-nowrap">{r.btsName || '—'}</td>
                      <td className="py-2.5 px-4 font-mono text-[11px]">{r.region || '—'}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono',
                            r.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-600',
                          )}
                        >
                          {r.status || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        <AccountBadge type={r.accountType || 'OTHER'} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold">{formatNaira(r.mrc || 0)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-[11px] text-on-surface-variant">
                        {r.createdAt ? toLocalDateString(new Date(r.createdAt)) : '—'}
                      </td>
                      {userIsSuper && (
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => handleDelete(r.id, r.customerName || r.id)}
                            disabled={deletingId === r.id}
                            className="text-on-surface-variant hover:text-destructive transition-colors disabled:opacity-40"
                            title="Delete record"
                          >
                            {deletingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </td>
                      )}
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
