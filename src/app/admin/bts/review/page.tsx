'use client';

import React, { useState, useEffect } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useMatchingCandidates, useAssignMatch, type ReviewRecord } from '@/hooks/use-matching';
import { useBtsCustomers } from '@/hooks/use-bts-data';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import { cn } from '@/lib/utils';
import { iconToneClass } from '@/lib/icon-tone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  CheckCircle2,
  Phone,
  RadioTower,
  XCircle,
  Download,
} from 'lucide-react';

const PAGE_SIZE = 20;

// Queue data comes from GET/POST /api/admin/matching/candidates
// (see src/hooks/use-matching.ts for the request/response contract).

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

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.85 ? 'bg-emerald-100 text-emerald-700' : score >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500';
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap w-fit', color)}>{pct}%</span>
  );
}

function DeviceBadge({ status, outages }: { status: string | null; outages: number | null }) {
  const ok = status === 'active';
  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap w-fit',
        ok ? 'bg-green-100 text-green-700' : status === 'down' || status === 'disabled' ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-500',
      )}
    >
      {status || 'unknown'}
      {outages != null && outages > 0 ? ` · ${outages} outage${outages === 1 ? '' : 's'}` : ''}
    </span>
  );
}

export default function BtsReviewPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { records, total, totalPages, loading, mutate } = useMatchingCandidates({
    search: debouncedSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const { summary: rosterSummary } = useBtsCustomers({ pageSize: 1 });
  const { assign, assigning } = useAssignMatch();

  const canReview = isSuperAdmin(user?.email || '') || isEditor(user?.email || '');
  const withPhone = records.filter((r) => r.customer.phone && r.candidates.length > 0).length;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // After an assignment the page can go past the last page; step back.
  useEffect(() => {
    if (!loading && records.length === 0 && total > 0 && page > 1) setPage((p) => p - 1);
  }, [records.length, total, page, loading]);

  const handleAssign = async (record: ReviewRecord, endpointId: string | null) => {
    if (busyId) return;
    setBusyId(record.customer.id);
    try {
      await assign(record.customer.id, endpointId);
      toast({
        title: endpointId ? 'Match assigned' : 'Marked as no match',
        description: endpointId
          ? `${record.customer.customerName || record.customer.customerId} mapped to the selected endpoint.`
          : `${record.customer.customerName || record.customer.customerId} skipped — auto-matching stopped for this customer.`,
      });
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Assignment failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, record: ReviewRecord) => {
    if (e.key === 'Enter' && record.candidates.length > 0) {
      e.preventDefault();
      handleAssign(record, record.candidates[0].endpointId);
    }
  };

  if (!canReview) {
    return (
      <SalesLayout>
        <div className="max-w-screen-2xl mx-auto flex items-center justify-center min-h-[60vh]">
          <div className="max-w-md w-full bg-white rounded-3xl p-10 border border-border text-center flex flex-col items-center gap-6">
            <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-7 h-7 text-destructive" />
            </div>
            <h2 className="font-display text-xl font-bold text-primary uppercase tracking-tight">Access Required</h2>
            <p className="text-sm text-on-surface-variant">
              Only super admins and editors can review and assign customer-to-tower matches.
            </p>
          </div>
        </div>
      </SalesLayout>
    );
  }

  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">BTS Review Queue</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
              Confirm the machine&rsquo;s tower pick, choose another candidate, or mark no match
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl font-mono text-[10px] uppercase font-bold"
              onClick={async () => {
                if (!user) return;
                const token = await user.getIdToken();
                const res = await fetch('/api/admin/matching/candidates/export', {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                  toast({ variant: 'destructive', title: 'Export failed', description: await res.text().catch(() => 'Unknown error') });
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `bts-review-pending-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
            <Search className="w-4 h-4 text-on-surface-variant" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, city, endpoint..."
              className="w-64 rounded-xl font-mono text-xs"
            />
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
          <KpiCard label="Pending" value={total.toLocaleString()} icon={ShieldAlert} color="bg-amber-500" />
          <KpiCard label="Matched" value={(rosterSummary?.matched ?? 0).toLocaleString()} icon={CheckCircle2} color="bg-emerald-500" />
          <KpiCard label="With Phone (page)" value={withPhone.toLocaleString()} icon={Phone} color="bg-sky-500" />
        </div>

        {loading ? (
          <SectionCard className="h-96 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
          </SectionCard>
        ) : records.length === 0 ? (
          <SectionCard className="h-64 flex flex-col items-center justify-center text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/30 mb-3" />
            <p className="font-mono text-[11px] text-on-surface-variant/40 uppercase font-bold tracking-widest">
              All caught up &mdash; no pending matches
            </p>
          </SectionCard>
        ) : (
          <div className="space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 font-bold">
              {total.toLocaleString()} pending &middot; Tip: focus a card and press Enter to confirm its top pick
            </p>
            {records.map((r) => {
              const top = r.candidates[0];
              const isBusy = busyId === r.customer.id;
              return (
                <SectionCard key={r.customer.id} className="p-5">
                  <div tabIndex={0} onKeyDown={(e) => handleRowKeyDown(e, r)} className="focus:outline-none focus:ring-2 focus:ring-secondary/40 rounded-xl">
                  <div className="flex flex-col sm:flex-row justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-primary">{r.customer.customerName || r.customer.customerId}</p>
                        {r.customer.city && (
                          <span className="font-mono text-[10px] text-on-surface-variant/70 uppercase tracking-wider font-bold">{r.customer.city}</span>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-on-surface-variant/60 truncate max-w-xl">
                        {[r.customer.phone, r.customer.email].filter(Boolean).join(' · ') || 'no contact info'}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-destructive hover:text-destructive shrink-0 self-start"
                      disabled={isBusy || assigning}
                      onClick={() => handleAssign(r, null)}
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />}
                      No match
                    </Button>
                  </div>

                  {r.candidates.length === 0 ? (
                    <div className="px-4 py-3 rounded-xl bg-surface-container-lowest/50 border border-dashed border-border">
                      <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/60">
                        No candidates &mdash; will stay pending until endpoint data arrives
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {r.candidates.map((c, i) => {
                        const isTop = i === 0;
                        return (
                          <div
                            key={c.endpointId}
                            className={cn(
                              'flex items-center gap-3 px-4 py-2 rounded-xl transition-colors',
                              isTop ? 'bg-emerald-50/60 border border-emerald-200/60' : 'hover:bg-surface-container-lowest',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-primary text-sm truncate">{c.name}</p>
                                {isTop && <ScoreBadge score={c.score} />}
                              </div>
                              <p className="font-mono text-[10px] text-on-surface-variant/60 truncate">
                                <RadioTower className="w-3 h-3 inline mr-1 text-secondary" />
                                {c.btsName || 'no tower'} &middot; {c.region || 'region unknown'}
                              </p>
                            </div>
                            {!isTop && <ScoreBadge score={c.score} />}
                            <DeviceBadge status={c.status} outages={c.deviceOutageCount} />
                            <Button
                              size="sm"
                              variant={isTop ? 'default' : 'outline'}
                              className={cn('rounded-xl shrink-0', isTop && 'bg-emerald-600 hover:bg-emerald-700')}
                              disabled={isBusy || assigning}
                              onClick={() => handleAssign(r, c.endpointId)}
                            >
                              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                              {isTop ? 'Confirm' : 'Choose'}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )}

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