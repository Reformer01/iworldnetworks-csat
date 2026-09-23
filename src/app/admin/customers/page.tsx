'use client';

import React, { useState, useEffect } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useCustomers, exportCustomersCsv, exportOverdueCustomersCsv, triggerSplynxSync, type CustomerRecord } from '@/hooks/use-customers';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { iconToneClass } from '@/lib/icon-tone';
import { Button } from '@/components/ui/button';
import { MobileToolbar } from '@/components/admin/MobileToolbar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2,
  Search,
  Users,
  Wifi,
  AlertTriangle,
  TrendingDown,
  MessageSquare,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ExternalLink,
  Share2,
  Clock3,
} from 'lucide-react';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import ShareFeedbackDialog from '@/components/ShareFeedbackDialog';

const LIFECYCLES = ['active', 'blocked', 'inactive', 'churned'] as const;

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border', className)}>{children}</div>;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <SectionCard className="flex items-center gap-3 md:gap-4 p-4 md:p-5 min-w-0">
      <Icon className={cn('size-5 shrink-0', iconToneClass(color))} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-headline text-lg font-semibold tabular-nums break-words xl:text-xl" title={value}>{value}</p>
        {sub && <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground/70" title={sub}>{sub}</p>}
      </div>
    </SectionCard>
  );
}

function LifecycleBadge({ lifecycle }: { lifecycle: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    blocked: 'bg-amber-100 text-amber-700',
    inactive: 'bg-orange-100 text-orange-700',
    churned: 'bg-zinc-200 text-zinc-600',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap', styles[lifecycle] || styles.churned)}>
      {lifecycle}
    </span>
  );
}

function OnlineBadge({ online }: { online: boolean | null | undefined }) {
  return online ? (
    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold font-mono whitespace-nowrap">
      online
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-bold font-mono whitespace-nowrap">offline</span>
  );
}

function MatchBadge({ state }: { state: string | null | undefined }) {
  if (!state) return <span className="text-[10px] font-mono text-on-surface-variant/40">—</span>;
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

function fmtMs(ms: number | null | undefined): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCurrency(amount: number): string {
  if (amount >= 1000000) return '₦' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '₦' + (amount / 1000).toFixed(1) + 'K';
  return '₦' + amount.toLocaleString();
}

export default function CustomersPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterLifecycle, setFilterLifecycle] = useState('__all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterOverdue, setFilterOverdue] = useState('__all');
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [detail, setDetail] = useState<CustomerRecord | null>(null);
  const [shareCustomer, setShareCustomer] = useState<CustomerRecord | null>(null);
  const PAGE_SIZE = 50;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterLifecycle]);

  const { records, summary, meta, total, totalPages, loading, mutate } = useCustomers({
    search: debouncedSearch || undefined,
    lifecycle: filterLifecycle !== '__all' ? filterLifecycle : undefined,
    status: filterStatus !== '__all' ? filterStatus : undefined,
    overdue: filterOverdue !== '__all' ? filterOverdue : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const userIsSuper = isSuperAdmin(user?.email || '');
  const canEdit = userIsSuper || isEditor(user?.email || '');

  const handleExport = async () => {
    if (!user) return;
    try {
      const blob = await exportCustomersCsv(user);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `splynx-customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export ready', description: 'CSV downloaded.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Export failed', description: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const handleExportOverdue = async () => {
    if (!user) return;
    try {
      const blob = await exportOverdueCustomersCsv(user);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `splynx-overdue-customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Overdue export ready', description: 'CSV downloaded.' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Overdue export failed', description: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const handleSync = async () => {
    if (!user || syncing) return;
    setSyncing(true);
    try {
      const result = await triggerSplynxSync(user);
      toast({
        title: 'Sync complete',
        description: `${result.stats.customersUpserted} customers, ${result.stats.reminders15 + result.stats.reminders30} reminders, ${result.stats.churnSent} surveys (${(result.durationMs / 1000).toFixed(1)}s)`,
      });
      if (result.note) {
        toast({ variant: 'destructive', title: 'Invoice sync skipped', description: result.note });
      }
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Sync failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">Customers</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
              Live Splynx customer mirror &mdash; lifecycle, reminders &amp; churn
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
                  className="w-full sm:w-48 xl:w-64 pl-9 rounded-xl font-mono text-xs min-w-0"
                />
              </div>
            }
            secondary={
              <>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={!canEdit}
                  className="rounded-xl font-mono text-[10px] uppercase font-bold px-4 py-2 hover:bg-surface-container-low transition-all"
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportOverdue}
                  disabled={!canEdit}
                  className="rounded-xl font-mono text-[10px] uppercase font-bold px-4 py-2 hover:bg-surface-container-low transition-all"
                >
                  <Clock3 className="w-3.5 h-3.5 mr-2" />
                  Overdue CSV
                </Button>
                {canEdit && (
                  <Button
                    onClick={handleSync}
                    disabled={syncing}
                    className="rounded-xl bg-secondary text-white font-mono text-[10px] uppercase font-bold px-4 py-2 hover:opacity-90 transition-all"
                  >
                    {syncing ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </Button>
                )}
              </>
            }
            label="Actions"
          />
        </header>

        {meta && (
          <div
            className={cn(
              'mb-4 px-4 py-3 rounded-xl border font-mono text-[10px] uppercase tracking-wider font-bold flex flex-wrap items-center gap-x-4 gap-y-1',
              meta.lastStatus === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-surface-container-lowest border-border text-on-surface-variant',
            )}
          >
            <span>
              Last sync:{' '}
              <span className="text-primary">
                {meta.lastSyncAt
                  ? fmtMs(meta.lastSyncAt) +
                    ' ' +
                    new Date(meta.lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  : 'never'}
              </span>
            </span>
            <span>
              Status: <span className="text-primary">{meta.lastStatus || 'idle'}</span>
            </span>
            {meta.lastError && <span className="text-red-600 normal-case">{meta.lastError}</span>}
            {meta.invoicesApiDenied && (
              <span className="inline-flex items-center gap-1 text-amber-700 normal-case"><AlertTriangle className="w-3.5 h-3.5" /> Invoice sync blocked: Splynx API key lacks Finance permission</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6">
          <KpiCard label="Total" value={(summary?.total ?? 0).toLocaleString()} icon={Users} color="bg-secondary" />
          <KpiCard label="Active" value={(summary?.active ?? 0).toLocaleString()} icon={Wifi} color="bg-emerald-500" />
          <KpiCard label="Inactive" value={(summary?.inactive ?? 0).toLocaleString()} icon={AlertTriangle} color="bg-orange-500" />
          <KpiCard label="Blocked" value={(summary?.blocked ?? 0).toLocaleString()} icon={AlertTriangle} color="bg-amber-500" />
          <KpiCard label="Churned" value={(summary?.churned ?? 0).toLocaleString()} icon={TrendingDown} color="bg-zinc-500" />
          <KpiCard
            label="Churn Responses"
            value={(summary?.churnResponses ?? 0).toLocaleString()}
            icon={MessageSquare}
            color="bg-violet-500"
            sub={`${(summary?.reminders15 ?? 0) + (summary?.reminders30 ?? 0)} reminders sent`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Select value={filterLifecycle} onValueChange={setFilterLifecycle}>
            <SelectTrigger className="w-[170px] rounded-xl font-mono text-[10px] uppercase font-bold">
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
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[140px] rounded-xl font-mono text-[10px] uppercase font-bold">
              <SelectValue placeholder="Account Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="__all">All Statuses</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterOverdue} onValueChange={setFilterOverdue}>
            <SelectTrigger className="w-[150px] rounded-xl font-mono text-[10px] uppercase font-bold">
              <SelectValue placeholder="Overdue Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Customers</SelectItem>
              <SelectItem value="true">Overdue Only</SelectItem>
              <SelectItem value="false">Not Overdue</SelectItem>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Tower</th>
                    <th className="py-3 px-4">Lifecycle</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Connection</th>
                    <th className="py-3 px-4 text-right">MRR</th>
                    <th className="py-3 px-4">Reminders</th>
                    <th className="py-3 px-4">Overdue</th>
                    <th className="py-3 px-4">Churn Survey</th>
                    <th className="py-3 px-4 text-right">Last Sync</th>
                    <th className="py-3 px-4 text-right">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-body text-sm">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="py-2.5 px-4 font-mono text-xs text-on-surface-variant">#{r.customerId}</td>
                      <td className="py-2.5 px-4">
                        <p className="font-bold text-primary whitespace-nowrap">{r.customerName || '—'}</p>
                        <p className="font-mono text-[10px] text-on-surface-variant/60 truncate max-w-[220px]">
                          {r.email || r.login || ''}
                        </p>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[11px] font-bold whitespace-nowrap">{r.btsName || '—'}</span>
                          <MatchBadge state={r.matchState} />
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <LifecycleBadge lifecycle={r.lifecycle} />
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px]">{r.status || '—'}</td>
                      <td className="py-2.5 px-4">
                        <OnlineBadge online={r.online} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[11px]">{fmtCurrency(r.mrrTotal || 0)}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex gap-1.5">
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded-md text-[9px] font-bold font-mono',
                              r.reminder15SentAt ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-400',
                            )}
                            title={r.reminder15SentAt ? `Sent ${fmtMs(r.reminder15SentAt)}` : 'Not sent'}
                          >
                            15d
                          </span>
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded-md text-[9px] font-bold font-mono',
                              r.reminder30SentAt ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-400',
                            )}
                            title={r.reminder30SentAt ? `Sent ${fmtMs(r.reminder30SentAt)}` : 'Not sent'}
                          >
                            30d
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        {r.overdueInvoice?.hasOverdueInvoice ? (
                          <div className="flex flex-col gap-1">
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold font-mono whitespace-nowrap w-fit">
                              {r.overdueInvoice.overdueDays}d overdue
                            </span>
                            <span className="text-[10px] font-mono text-on-surface-variant/60">
                              {r.overdueInvoice.invoiceNumber || 'Invoice'} · {fmtCurrency(r.overdueInvoice.invoiceAmount || 0)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-on-surface-variant/40">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        {r.churnResponse ? (
                          <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold font-mono whitespace-nowrap">
                            Responded{r.churnResponse.reason ? ` · ${r.churnResponse.reason}` : ''}
                          </span>
                        ) : r.churnSurveySentAt ? (
                          <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold font-mono whitespace-nowrap">
                            Sent {fmtMs(r.churnSurveySentAt)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-on-surface-variant/40">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[10px] text-on-surface-variant/70 whitespace-nowrap">
                        {fmtMs(r.lastSyncAt)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 rounded-lg font-mono text-[9px] uppercase font-bold text-secondary"
                              onClick={() => setShareCustomer(r)}
                              aria-label="Share feedback link"
                            >
                              <Share2 className="w-3.5 h-3.5 mr-1" /> Share
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 rounded-lg"
                            onClick={() => setDetail(r)}
                            aria-label="View details"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-on-surface-variant" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/80">
              <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl font-mono text-[10px] uppercase font-bold"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl font-mono text-[10px] uppercase font-bold"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </SectionCard>

        <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
          <DialogContent className="max-w-lg rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-xl font-bold text-primary">{detail?.customerName || 'Customer'}</DialogTitle>
              <DialogDescription className="font-mono text-[10px] uppercase tracking-widest font-bold">
                Splynx customer #{detail?.customerId || ''} &middot; {detail?.email || 'no email'}
              </DialogDescription>
            </DialogHeader>
            {detail && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <LifecycleBadge lifecycle={detail.lifecycle} />
                  <OnlineBadge online={detail.online} />
                  <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold font-mono">
                    {detail.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">Phone</span>
                    <span className="font-semibold">{detail.phone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">Login</span>
                    <span className="font-semibold break-all">{detail.login || '—'}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">City</span>
                    <span className="font-semibold">{detail.city || '—'}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">Account Type</span>
                    <span className="font-semibold">{detail.accountType || '—'}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">MRR</span>
                    <span className="font-semibold">{fmtCurrency(detail.mrrTotal || 0)}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">Last seen</span>
                    <span className="font-semibold">{fmtMs(detail.lastOnlineAt)}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">Last Update</span>
                    <span className="font-semibold">{fmtMs(detail.lastUpdateAt)}</span>
                  </div>
                  <div>
                    <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">First Synced</span>
                    <span className="font-semibold">{fmtMs(detail.firstSyncedAt)}</span>
                  </div>
                </div>
                <div className="rounded-xl bg-muted/40 p-3 border border-border/40 text-xs space-y-1.5">
                  <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Reminders</p>
                  <p>
                    15-day: <span className="font-semibold">{detail.reminder15SentAt ? fmtMs(detail.reminder15SentAt) : 'not sent'}</span>
                  </p>
                  <p>
                    30-day: <span className="font-semibold">{detail.reminder30SentAt ? fmtMs(detail.reminder30SentAt) : 'not sent'}</span>
                  </p>
                  <p>
                    Churn survey:{' '}
                    <span className="font-semibold">
                      {detail.churnSurveySentAt ? `sent ${fmtMs(detail.churnSurveySentAt)}` : 'not sent'}
                    </span>
                  </p>
                </div>
                {detail.overdueInvoice?.hasOverdueInvoice && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs space-y-1.5">
                    <p className="font-mono text-[9px] uppercase font-bold text-rose-700 flex items-center gap-1">
                      <Clock3 className="w-3 h-3" /> Overdue invoices
                    </p>
                    <p>
                      Most overdue:{' '}
                      <span className="font-semibold">
                        {detail.overdueInvoice.invoiceNumber || 'Invoice'} · {detail.overdueInvoice.overdueDays} days
                      </span>
                    </p>
                    <p>
                      Amount: <span className="font-semibold">{fmtCurrency(detail.overdueInvoice.invoiceAmount || 0)}</span>
                    </p>
                    <p>
                      Last reminder:{' '}
                      <span className="font-semibold">
                        {detail.overdueInvoice.lastReminderSentAt ? fmtMs(detail.overdueInvoice.lastReminderSentAt) : 'not sent'}
                      </span>{' '}
                      {detail.overdueInvoice.lastReminderType ? `(${detail.overdueInvoice.lastReminderType})` : ''}
                    </p>
                  </div>
                )}
                {detail.churnResponse && (
                  <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-xs space-y-1.5">
                    <p className="font-mono text-[9px] uppercase font-bold text-violet-700">Churn response</p>
                    <p>
                      Rating: <span className="font-bold">{detail.churnResponse.rating}/5</span> &middot; Reason:{' '}
                      <span className="font-bold">{detail.churnResponse.reason || '—'}</span>
                    </p>
                    {detail.churnResponse.comment && <p className="italic text-on-surface-variant">“{detail.churnResponse.comment}”</p>}
                  </div>
                )}
                {canEdit && (
                  <Button
                    className="w-full rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold py-5"
                    onClick={() => {
                      setShareCustomer(detail);
                      setDetail(null);
                    }}
                  >
                    <Share2 className="w-3.5 h-3.5 mr-2" /> Share Feedback Link
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <ShareFeedbackDialog
          open={!!shareCustomer}
          onOpenChange={(open) => !open && setShareCustomer(null)}
          customer={
            shareCustomer
              ? {
                  customerName: shareCustomer.customerName,
                  customerEmail: shareCustomer.billingEmail || shareCustomer.email || '',
                  servicePlan: shareCustomer.accountType || '',
                  location: shareCustomer.city,
                  phone: shareCustomer.phone,
                }
              : null
          }
          defaultSubject="Support"
        />
      </div>
    </SalesLayout>
  );
}
