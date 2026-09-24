'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Loader2, MapPin, Phone, RadioTower, Search, ShieldAlert, UserRound, XCircle } from 'lucide-react';

import { useAuth, useUser } from '@/firebase';
import { useMatchingCandidates, useAssignMatch, type ReviewRecord } from '@/hooks/use-matching';
import { useBtsCustomers } from '@/hooks/use-bts-data';
import { useToast } from '@/hooks/use-toast';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

export default function BtsReviewPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { records, total, totalPages, loading, error, mutate } = useMatchingCandidates({ search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE });
  const { summary: rosterSummary } = useBtsCustomers({ pageSize: 1 });
  const { assign, assigning } = useAssignMatch();
  const canReview = isSuperAdmin(user?.email || '') || isEditor(user?.email || '');

  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);
  useEffect(() => { if (!loading && records.length === 0 && total > 0 && page > 1) setPage((value) => value - 1); }, [loading, records.length, total, page]);

  const candidatesAvailable = useMemo(() => records.filter((record) => record.candidates.length > 0).length, [records]);
  const coverage = rosterSummary?.total ? Math.round(((rosterSummary.matched + rosterSummary.manual) / rosterSummary.total) * 1000) / 10 : 0;

  const handleAssign = async (record: ReviewRecord, endpointId: string | null) => {
    if (busyId) return;
    setBusyId(record.customer.id);
    try {
      await assign(record.customer.id, endpointId);
      toast({ title: endpointId ? 'Match assigned' : 'Marked as no match', description: `${record.customer.customerName || record.customer.customerId} has been updated.` });
      mutate();
    } catch (caught) {
      toast({ variant: 'destructive', title: 'Assignment failed', description: caught instanceof Error ? caught.message : 'Unknown error' });
    } finally { setBusyId(null); }
  };

  const exportQueue = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/matching/candidates/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('The queue export could not be generated.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `bts-review-pending-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (caught) { toast({ variant: 'destructive', title: 'Export failed', description: caught instanceof Error ? caught.message : 'Unknown error' }); }
  };

  if (!canReview) {
    return <SalesLayout><div className="mx-auto max-w-2xl pt-16"><EmptyState icon={ShieldAlert} title="Review access required" description="Only super admins and editors can assign customer-to-tower matches." /></div></SalesLayout>;
  }

  return (
    <SalesLayout>
      <div className="mx-auto max-w-[1500px] space-y-6">
        <PageHeader
          eyebrow="Identity operations"
          title="BTS review queue"
          description="Resolve customer-to-tower candidates with ranked endpoint evidence. Manual decisions are written to the audit log."
          actions={<><div className="relative w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer or city..." className="h-9 pl-9" /></div><Button variant="outline" size="sm" onClick={exportQueue}><Download />Export queue</Button></>}
        />

        <StatCardGrid columns={4}>
          <StatCard label="Pending" value={total.toLocaleString()} detail="Customers awaiting review" icon={ShieldAlert} />
          <StatCard label="Roster coverage" value={`${coverage}%`} detail="Matched plus manual" icon={CheckCircle2} />
          <StatCard label="Matched" value={(rosterSummary?.matched ?? 0).toLocaleString()} detail="Automatic mappings" icon={RadioTower} />
          <StatCard label="Candidates here" value={candidatesAvailable.toLocaleString()} detail={`${records.length} customers on this page`} icon={UserRound} />
        </StatCardGrid>

        {error ? <EmptyState icon={AlertTriangle} title="Review queue unavailable" description={error} /> : loading ? (
          <Card><CardContent className="flex h-72 items-center justify-center"><Loader2 className="size-6 animate-spin text-secondary" /><span className="sr-only">Loading review queue</span></CardContent></Card>
        ) : records.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Review queue is clear" description={debouncedSearch ? 'No pending customers match this search.' : 'Every current customer mapping has been reviewed.'} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{total.toLocaleString()} pending customer mappings</p><Badge variant="outline">Choose the best endpoint evidence</Badge></div>
            {records.map((record) => {
              const isBusy = busyId === record.customer.id;
              return (
                <Card key={record.customer.id} className={cn('overflow-hidden transition-shadow hover:shadow-md', isBusy && 'opacity-70')}>
                  <CardHeader className="border-b bg-muted/20 pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{record.customer.customerName || `Customer ${record.customer.customerId}`}</CardTitle><Badge variant="warning">Pending</Badge></div><CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="inline-flex items-center gap-1"><MapPin className="size-3" />{record.customer.city || 'City unknown'}</span><span className="inline-flex items-center gap-1"><Phone className="size-3" />{record.customer.phone || record.customer.email || 'No contact details'}</span></CardDescription></div>
                      <Button variant="outline" size="sm" disabled={isBusy || assigning} onClick={() => void handleAssign(record, null)}>{isBusy ? <Loader2 className="animate-spin" /> : <XCircle />}No reliable match</Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-5">{record.candidates.length === 0 ? <EmptyState variant="dashed" title="No endpoint candidates" description="This mapping remains pending until UISP endpoint data provides a candidate." /> : <CandidateList record={record} busy={isBusy || assigning} onAssign={handleAssign} />}</CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Page {page} of {Math.max(totalPages, 1)}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft />Previous</Button><Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight /></Button></div></div>
      </div>
    </SalesLayout>
  );
}

function CandidateList({ record, busy, onAssign }: { record: ReviewRecord; busy: boolean; onAssign: (record: ReviewRecord, endpointId: string | null) => Promise<void> }) {
  return (
    <div className="space-y-2">
      {record.candidates.map((candidate, index) => {
        const recommended = index === 0;
        return (
          <div key={candidate.endpointId} className={cn('grid gap-3 rounded-xl border p-3 transition-colors lg:grid-cols-[36px_minmax(0,1fr)_110px_120px_auto] lg:items-center', recommended ? 'border-secondary/30 bg-secondary/[0.04]' : 'hover:bg-muted/30')}>
            <div className="flex size-8 items-center justify-center rounded-full border bg-card font-headline text-sm font-semibold tabular-nums">{index + 1}</div>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{candidate.name}</p>{recommended && <Badge variant="success">Recommended</Badge>}</div><p className="mt-1 text-xs text-muted-foreground"><RadioTower className="mr-1 inline size-3" />{candidate.btsName || 'No tower'} · {candidate.region || 'Region unknown'}</p></div>
            <div><div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Match</span><span className="font-medium tabular-nums">{Math.round(candidate.score * 100)}%</span></div><Progress value={candidate.score * 100} className="h-1.5" /></div>
            <Badge variant={candidate.status === 'active' ? 'success' : candidate.status === 'down' || candidate.status === 'disabled' ? 'danger' : 'muted'}>{candidate.status || 'unknown'}{candidate.deviceOutageCount ? ` · ${candidate.deviceOutageCount} down` : ''}</Badge>
            <Button size="sm" variant={recommended ? 'default' : 'outline'} disabled={busy} onClick={() => void onAssign(record, candidate.endpointId)}>{recommended ? 'Confirm match' : 'Choose'}</Button>
          </div>
        );
      })}
    </div>
  );
}
