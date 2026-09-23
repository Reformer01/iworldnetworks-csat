'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth, useUser } from '@/firebase';
import { useCampaigns, deleteCampaign, campaignAction } from '@/hooks/use-campaigns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Plus, ChevronLeft, ChevronRight, ShieldAlert, Trash2, Check, X } from 'lucide-react';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';

const PAGE_SIZE = 50;

const CAMPAIGN_TYPES = ['campaign', 'downtime', 'notice', 'other'];

const CAMPAIGN_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-violet-100 text-violet-700',
  sending: 'bg-sky-100 text-sky-700',
  sent: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-zinc-200 text-zinc-500',
  rejected: 'bg-rose-100 text-rose-700',
};

export function CampaignsTab() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('__all');
  const [filterType, setFilterType] = useState('__all');
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const canApprove = isSuperAdmin(user?.email || '');

  const handleApprove = async (id: string) => {
    if (!user || approvingId) return;
    setApprovingId(id);
    try {
      await campaignAction(user, id, 'approve');
      toast({ title: 'Campaign approved', description: 'The campaign is now ready to send.' });
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Approval failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!user || rejectingId) return;
    setRejectingId(id);
    try {
      await campaignAction(user, id, 'reject', { reason: rejectReason });
      toast({ title: 'Campaign rejected', description: 'The editor will be notified.' });
      setRejectReason('');
      setRejectingId(null);
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Rejection failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setRejectingId(null);
    }
  };

  const { records, total, totalPages, loading, mutate } = useCampaigns({
    status: filterStatus !== '__all' ? filterStatus : undefined,
    type: filterType !== '__all' ? filterType : undefined,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const canCreate = isSuperAdmin(user?.email || '') || isEditor(user?.email || '');
  const canDelete = isSuperAdmin(user?.email || '');

  const handleCancel = async (id: string, name: string) => {
    if (!user || cancellingId) return;
    if (!window.confirm(`Cancel scheduled campaign "${name}"? It will go back to draft and will not send.`)) return;
    setCancellingId(id);
    try {
      await campaignAction(user, id, 'cancel');
      toast({ title: 'Campaign cancelled', description: 'Back to draft — it will not send.' });
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Cancel failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setCancellingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!user || deletingId) return;
    if (!window.confirm(`Delete campaign "${name}"? Its emails will also be removed. This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteCampaign(user, id);
      toast({ title: 'Campaign deleted', description: 'The campaign and its emails were removed.' });
      mutate();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">Campaigns</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
            Bulk emails to customer segments &mdash; draft, approve &amp; send
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Search className="w-4 h-4 text-on-surface-variant" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search campaigns..."
            className="w-64 rounded-xl font-mono text-xs"
          />
          {canCreate && (
            <Link href="/admin/campaigns/new">
              <Button className="rounded-xl bg-secondary text-white font-mono text-[10px] uppercase font-bold px-4 py-2 hover:opacity-90 transition-all">
                <Plus className="w-3.5 h-3.5 mr-2" />
                New Campaign
              </Button>
            </Link>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select
          value={filterType}
          onValueChange={(v) => {
            setFilterType(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px] rounded-xl font-mono text-[10px] uppercase font-bold">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Types</SelectItem>
            {CAMPAIGN_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterStatus}
          onValueChange={(v) => {
            setFilterStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px] rounded-xl font-mono text-[10px] uppercase font-bold">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Statuses</SelectItem>
            {Object.keys(CAMPAIGN_STATUS_STYLES).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-widest opacity-60 font-bold">
          {total.toLocaleString()} campaign{total === 1 ? '' : 's'}
        </span>
      </div>

      <div className="bg-white p-0 overflow-hidden rounded-2xl whisper-shadow border border-border">
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
          </div>
        ) : records.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center">
            <ShieldAlert className="w-10 h-10 text-on-surface-variant/20 mb-3" />
            <p className="font-mono text-[11px] text-on-surface-variant/40 uppercase font-bold tracking-widest">No campaigns yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border/80">
                  {['Name', 'Type', 'Status', 'Audience', 'Created', ''].map((h) => (
                    <th key={h} className="px-4 py-3 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-surface-container-low/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/campaigns/${c.id}`}
                        className="font-mono text-xs font-bold text-primary hover:text-secondary transition-colors"
                      >
                        {c.name}
                      </Link>
                      <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant/60 mt-0.5 truncate max-w-[280px]">
                        {c.subject}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">{c.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-block px-2 py-0.5 rounded-full font-mono text-[9px] uppercase font-bold',
                          CAMPAIGN_STATUS_STYLES[c.status] || 'bg-zinc-100 text-zinc-600',
                        )}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] font-bold text-on-surface-variant">
                      {c.audienceCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] text-on-surface-variant/70">
                        {new Date(c.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      {c.status === 'scheduled' && c.scheduledAt && (
                        <p className="font-mono text-[9px] text-violet-600 mt-0.5">
                          Sends{' '}
                          {new Date(c.scheduledAt).toLocaleString('en-NG', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canApprove && c.status === 'pending_approval' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleApprove(c.id)}
                              disabled={approvingId === c.id}
                              className="font-mono text-[9px] uppercase font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-40 flex items-center gap-1"
                              title="Approve campaign"
                            >
                              {approvingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectingId(rejectingId === c.id ? null : c.id)}
                              className="font-mono text-[9px] uppercase font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1"
                              title="Reject campaign"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        )}
                        {canApprove && c.status === 'scheduled' && (
                          <button
                            onClick={() => handleCancel(c.id, c.name)}
                            disabled={cancellingId === c.id}
                            className="font-mono text-[9px] uppercase font-bold text-amber-600 hover:text-amber-700 disabled:opacity-40 flex items-center gap-1"
                            title="Cancel scheduled send"
                          >
                            {cancellingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            Cancel
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(c.id, c.name)}
                            disabled={deletingId === c.id}
                            className="font-mono text-[9px] uppercase font-bold text-rose-500 hover:text-rose-700 disabled:opacity-40 flex items-center gap-1"
                            title="Delete campaign"
                          >
                            {deletingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Delete
                          </button>
                        )}
                        <Link
                          href={`/admin/campaigns/${c.id}`}
                          className="font-mono text-[9px] uppercase font-bold text-secondary hover:opacity-80"
                        >
                          Open <ChevronRight className="w-3 h-3 inline" />
                        </Link>
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
      </div>

      {/* Rejection reason modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRejectingId(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-sm uppercase text-primary mb-3">Reject Campaign</h3>
            <p className="font-mono text-[10px] text-on-surface-variant/60 mb-3">Provide a reason for rejection (optional):</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full h-24 rounded-xl border border-border px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-secondary/30"
              placeholder="e.g. Subject line needs revision, wrong audience..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                className="rounded-full font-mono text-[10px] uppercase font-bold"
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="rounded-full font-mono text-[10px] uppercase font-bold px-6"
                onClick={() => handleReject(rejectingId)}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
