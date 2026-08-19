'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useCampaigns } from '@/hooks/use-campaigns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Plus, Megaphone, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';

const PAGE_SIZE = 50;

const CAMPAIGN_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600',
  sending: 'bg-sky-100 text-sky-700',
  sent: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-zinc-200 text-zinc-500',
};

export default function CampaignsPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('__all');
  const [page, setPage] = useState(1);

  const { records, total, totalPages, loading, mutate } = useCampaigns({
    status: filterStatus !== '__all' ? filterStatus : undefined,
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const canCreate = isSuperAdmin(user?.email || '') || isEditor(user?.email || '');

  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto">
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
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
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
              <p className="font-mono text-[11px] text-on-surface-variant/40 uppercase font-bold tracking-widest">
                No campaigns yet
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/80">
                    {['Name', 'Type', 'Status', 'Audience', 'Created', ''].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((c) => (
                    <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-surface-container-low/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/admin/campaigns/${c.id}`} className="font-mono text-xs font-bold text-primary hover:text-secondary transition-colors">
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
                        <span className={cn('inline-block px-2 py-0.5 rounded-full font-mono text-[9px] uppercase font-bold', CAMPAIGN_STATUS_STYLES[c.status] || 'bg-zinc-100 text-zinc-600')}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] font-bold text-on-surface-variant">
                        {c.audienceCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-on-surface-variant/70">
                        {new Date(c.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/campaigns/${c.id}`}
                          className="font-mono text-[9px] uppercase font-bold text-secondary hover:opacity-80"
                        >
                          Open →
                        </Link>
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
      </div>
    </SalesLayout>
  );
}