'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { fetchCampaign, campaignAction, deleteCampaign, type CampaignRecord } from '@/hooks/use-campaigns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Loader2, Send, XCircle, RotateCcw, Mail, ShieldAlert, ArrowLeft, Trash2 } from 'lucide-react';
import { isSuperAdmin } from '@/lib/admin-config';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600',
  sending: 'bg-sky-100 text-sky-700',
  sent: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-zinc-200 text-zinc-500',
};

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl whisper-shadow border border-border">
      <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
      <p className={cn('font-display text-xl font-bold mt-1', color)}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setCampaign(await fetchCampaign(user, id));
    } catch (err) {
      toast({ variant: 'destructive', title: 'Load failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }, [user, id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (action: 'send' | 'cancel' | 'retry') => {
    if (!user || acting) return;
    setActing(action);
    try {
      const res = await campaignAction(user, id, action);
      toast({
        title: action === 'send' ? 'Campaign sending' : action === 'cancel' ? 'Campaign cancelled' : 'Retry queued',
        description:
          action === 'send'
            ? `Queued to ${res.recipients?.toLocaleString() ?? 0} recipients.`
            : action === 'retry'
              ? `Re-queued ${res.retried?.toLocaleString() ?? 0} failed emails.`
              : undefined,
      });
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Action failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setActing(null);
    }
  };

  const handleDelete = async () => {
    if (!user || deleting) return;
    if (!window.confirm(`Delete campaign "${campaign?.name}"? Its emails will also be removed. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteCampaign(user, id);
      toast({ title: 'Campaign deleted', description: 'The campaign and its emails were removed.' });
      router.push('/admin/campaigns');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error' });
      setDeleting(false);
    }
  };

  const userIsSuper = isSuperAdmin(user?.email || '');
  const stats = campaign?.stats;

  return (
    <SalesLayout>
      <div className="max-w-4xl mx-auto">
        <Link
          href="/admin/campaigns"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:text-secondary transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Campaigns
        </Link>

        {loading || !campaign ? (
          <div className="h-96 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
          </div>
        ) : (
          <>
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">{campaign.name}</h1>
                  <span
                    className={cn(
                      'inline-block px-2 py-0.5 rounded-full font-mono text-[9px] uppercase font-bold',
                      STATUS_STYLES[campaign.status] || 'bg-zinc-100 text-zinc-600',
                    )}
                  >
                    {campaign.status}
                  </span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
                  {campaign.type} &mdash; {campaign.subject}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {campaign.status === 'draft' && userIsSuper && (
                  <Button
                    disabled={!!acting}
                    onClick={() => handleAction('send')}
                    className="rounded-xl bg-secondary text-white font-mono text-[10px] uppercase font-bold hover:opacity-90 transition-all"
                  >
                    {acting === 'send' ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-2" />}
                    Approve &amp; Send
                  </Button>
                )}
                {(campaign.status === 'failed' || campaign.status === 'partial') && userIsSuper && (
                  <Button
                    disabled={!!acting}
                    onClick={() => handleAction('retry')}
                    className="rounded-xl bg-amber-600 text-white font-mono text-[10px] uppercase font-bold hover:opacity-90 transition-all"
                  >
                    {acting === 'retry' ? (
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5 mr-2" />
                    )}
                    Retry Failed
                  </Button>
                )}
                {(campaign.status === 'draft' || campaign.status === 'sending' || campaign.status === 'partial') && userIsSuper && (
                  <Button
                    variant="outline"
                    disabled={!!acting}
                    onClick={() => handleAction('cancel')}
                    className="rounded-xl font-mono text-[10px] uppercase font-bold"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-2" />
                    Cancel
                  </Button>
                )}
                <Link href={`/admin/mailing?tab=emails&campaignId=${campaign.id}`}>
                  <Button variant="outline" className="rounded-xl font-mono text-[10px] uppercase font-bold">
                    <Mail className="w-3.5 h-3.5 mr-2" />
                    View Emails
                  </Button>
                </Link>
                {userIsSuper && (
                  <Button
                    variant="outline"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="rounded-xl font-mono text-[10px] uppercase font-bold text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-2" />}
                    Delete
                  </Button>
                )}
              </div>
            </header>

            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
                <StatCard label="Total" value={stats.total} color="text-primary" />
                <StatCard label="Pending" value={stats.pending} color="text-amber-600" />
                <StatCard label="Processing" value={stats.processing} color="text-sky-600" />
                <StatCard label="Sent" value={stats.sent} color="text-emerald-600" />
                <StatCard label="Failed" value={stats.failed} color="text-rose-600" />
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-white p-5 rounded-2xl whisper-shadow border border-border">
                <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant mb-2">Audience</p>
                <pre className="font-mono text-[11px] text-primary whitespace-pre-wrap break-words">
                  {JSON.stringify(campaign.audienceJson, null, 2)}
                </pre>
                <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-secondary mt-3">
                  {campaign.audienceCount.toLocaleString()} recipients
                </p>
              </div>
              <div className="bg-white p-5 rounded-2xl whisper-shadow border border-border">
                <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant mb-2">Details</p>
                <dl className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-on-surface-variant">Created by</dt>
                    <dd className="font-bold text-primary">{campaign.createdBy}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-on-surface-variant">Created</dt>
                    <dd className="font-bold text-primary">{new Date(campaign.createdAt).toLocaleString('en-GB')}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-on-surface-variant">Approved by</dt>
                    <dd className="font-bold text-primary">{campaign.approvedBy || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-on-surface-variant">Sent at</dt>
                    <dd className="font-bold text-primary">{campaign.sentAt ? new Date(campaign.sentAt).toLocaleString('en-GB') : '—'}</dd>
                  </div>
                  {campaign.error && (
                    <div className="pt-2">
                      <dt className="text-on-surface-variant mb-1">Error</dt>
                      <dd className="text-rose-600 break-words">{campaign.error}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl whisper-shadow border border-border mb-6">
              <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant mb-3">Plain text body</p>
              <pre className="font-mono text-[11px] text-primary whitespace-pre-wrap break-words">{campaign.text}</pre>
            </div>

            {campaign.html && (
              <div className="bg-white p-5 rounded-2xl whisper-shadow border border-border">
                <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant mb-3">HTML preview</p>
                <div className="border border-border rounded-xl p-4" dangerouslySetInnerHTML={{ __html: campaign.html }} />
              </div>
            )}

            {!userIsSuper && campaign.status === 'draft' && (
              <div className="mt-6 flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50/60">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-amber-800">
                  Only a super admin can approve and send this campaign
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </SalesLayout>
  );
}
