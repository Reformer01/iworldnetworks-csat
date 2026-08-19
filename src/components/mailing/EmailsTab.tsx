'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { useEmails, type EmailJobRecord, retryEmailJob, approveEmailJob, rejectEmailJob, bulkEmailAction } from '@/hooks/use-emails';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, PenLine, ChevronLeft, ChevronRight, ShieldAlert, Check, X, Megaphone } from 'lucide-react';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import { EMAIL_TYPES, EMAIL_STATUSES } from '@/app/admin/emails/email-meta';
import { EmailStatsCards } from '@/app/admin/emails/components/EmailStatsCards';
import { EmailQueueTable } from '@/app/admin/emails/components/EmailQueueTable';
import { EmailDetailModal } from '@/app/admin/emails/components/EmailDetailModal';
import { ComposeEmailModal } from '@/app/admin/emails/components/ComposeEmailModal';

const PAGE_SIZE = 50;

export function EmailsTab() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get('campaignId') || undefined;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState('__all');
  const [filterStatus, setFilterStatus] = useState('__all');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<EmailJobRecord | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulking, setBulking] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterType, filterStatus]);

  const { records, stats, total, totalPages, loading, mutate } = useEmails({
    type: filterType !== '__all' ? filterType : undefined,
    status: filterStatus !== '__all' ? filterStatus : undefined,
    search: debouncedSearch || undefined,
    campaignId,
    page,
    pageSize: PAGE_SIZE,
  });

  const userIsSuper = isSuperAdmin(user?.email || '');
  const canEdit = userIsSuper || isEditor(user?.email || '');
  const canApprove = userIsSuper;

  // Clear selections when the visible page changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, debouncedSearch, filterType, filterStatus]);

  const handleRetry = async (record: EmailJobRecord) => {
    if (!user || retryingId) return;
    setRetryingId(record.id);
    try {
      await retryEmailJob(user, record.id);
      toast({ title: 'Retry queued', description: 'The email will be re-attempted shortly.' });
      if (detail?.id === record.id) setDetail(null);
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Retry failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setRetryingId(null);
    }
  };

  const handleApprove = async (record: EmailJobRecord) => {
    if (!user || actionId) return;
    setActionId(record.id);
    try {
      await approveEmailJob(user, record.id);
      toast({ title: 'Email approved', description: 'The email has been queued for sending.' });
      if (detail?.id === record.id) setDetail(null);
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Approval failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (record: EmailJobRecord, reason?: string) => {
    if (!user || actionId) return;
    setActionId(record.id);
    try {
      await rejectEmailJob(user, record.id, reason);
      toast({ title: 'Email rejected', description: reason ? `Reason: ${reason}` : 'The email was rejected.' });
      if (detail?.id === record.id) setDetail(null);
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Rejection failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setActionId(null);
    }
  };

  const handleBulk = async (action: 'approve' | 'reject') => {
    if (!user || bulking || selectedIds.size === 0) return;
    setBulking(true);
    try {
      const affected = await bulkEmailAction(user, action, Array.from(selectedIds));
      toast({
        title: action === 'approve' ? 'Emails approved' : 'Emails rejected',
        description: `${affected} email${affected === 1 ? '' : 's'} updated.`,
      });
      setSelectedIds(new Set());
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Bulk action failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setBulking(false);
    }
  };

  return (
    <>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">Email Queue</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
            Mailing suite &mdash; sent, pending, failed &amp; retries
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Search className="w-4 h-4 text-on-surface-variant" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email..."
            className="w-64 rounded-xl font-mono text-xs"
          />
          {canEdit && (
            <Button
              onClick={() => setComposeOpen(true)}
              className="rounded-xl bg-secondary text-white font-mono text-[10px] uppercase font-bold px-4 py-2 hover:opacity-90 transition-all"
            >
              <PenLine className="w-3.5 h-3.5 mr-2" />
              Compose
            </Button>
          )}
        </div>
      </header>

      <EmailStatsCards stats={stats} />

      {campaignId && (
        <div className="flex items-center gap-2 px-4 py-2.5 mb-4 rounded-xl border border-secondary/30 bg-secondary/5">
          <Megaphone className="w-4 h-4 text-secondary" />
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-secondary">
            Viewing emails for campaign {campaignId.slice(0, 8)}&hellip;
          </span>
          <Link
            href={`/admin/campaigns/${campaignId}`}
            className="ml-auto font-mono text-[10px] uppercase font-bold text-secondary underline underline-offset-2 hover:opacity-80"
          >
            Back to campaign
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[170px] rounded-xl font-mono text-[10px] uppercase font-bold">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Types</SelectItem>
            {EMAIL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, ' ')}
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
            {EMAIL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-widest opacity-60 font-bold">
          {total.toLocaleString()} email{total === 1 ? '' : 's'}
        </span>
      </div>

      <div className={cn('bg-white p-0 overflow-hidden rounded-2xl whisper-shadow border border-border')}>
        {canApprove && selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/80 bg-orange-50/60">
            <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-orange-800">{selectedIds.size} selected</span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                disabled={bulking}
                className="h-7 rounded-lg font-mono text-[9px] uppercase font-bold bg-emerald-600 text-white hover:opacity-90"
                onClick={() => handleBulk('approve')}
              >
                <Check className="w-3.5 h-3.5 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                disabled={bulking}
                className="h-7 rounded-lg font-mono text-[9px] uppercase font-bold bg-rose-600 text-white hover:opacity-90"
                onClick={() => handleBulk('reject')}
              >
                <X className="w-3.5 h-3.5 mr-1" /> Reject
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-lg font-mono text-[9px] uppercase font-bold"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>
        )}
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
          </div>
        ) : records.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center">
            <ShieldAlert className="w-10 h-10 text-on-surface-variant/20 mb-3" />
            <p className="font-mono text-[11px] text-on-surface-variant/40 uppercase font-bold tracking-widest">
              No emails match the current filters
            </p>
          </div>
        ) : (
          <EmailQueueTable
            records={records}
            canEdit={canEdit}
            canApprove={canApprove}
            selectedIds={selectedIds}
            onToggleSelect={(id) =>
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleSelectAll={() =>
              setSelectedIds((prev) => {
                const next = new Set(prev);
                const selectable = records.filter((r) => r.status === 'pending_approval');
                const allSelected = selectable.length > 0 && selectable.every((r) => next.has(r.id));
                selectable.forEach((r) => (allSelected ? next.delete(r.id) : next.add(r.id)));
                return next;
              })
            }
            onView={setDetail}
            onRetry={handleRetry}
            onApprove={handleApprove}
            onReject={handleReject}
          />
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
      </div>

      <EmailDetailModal
        record={detail}
        canEdit={canEdit}
        canApprove={canApprove}
        actionPending={actionId === detail?.id}
        onClose={() => setDetail(null)}
        onRetry={handleRetry}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      <ComposeEmailModal open={composeOpen} onOpenChange={setComposeOpen} user={user || null} onSent={mutate} />
    </>
  );
}