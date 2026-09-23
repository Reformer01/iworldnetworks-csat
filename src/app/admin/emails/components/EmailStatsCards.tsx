'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { iconToneClass } from '@/lib/icon-tone';
import { Clock3, Loader2, CheckCircle2, XCircle, Hourglass } from 'lucide-react';
import type { EmailStats } from '@/hooks/use-emails';

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className={cn('flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm')}>
      <Icon className={cn('size-5 shrink-0', iconToneClass(color))} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-headline text-lg font-semibold tabular-nums break-words xl:text-xl" title={value.toLocaleString()}>{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

export function EmailStatsCards({ stats }: { stats: EmailStats | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-3 md:gap-4 mb-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-5 rounded-2xl whisper-shadow border border-border h-[84px] animate-pulse" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-3 md:gap-4 mb-6">
      <StatCard label="Pending" value={stats.pending} icon={Clock3} color="bg-amber-500" />
      <StatCard label="Processing" value={stats.processing} icon={Loader2} color="bg-sky-500" />
      <StatCard label="Awaiting Approval" value={stats.pendingApproval} icon={Hourglass} color="bg-orange-500" />
      <StatCard label="Sent (24h)" value={stats.sent24h} icon={CheckCircle2} color="bg-emerald-500" />
      <StatCard label="Failed (24h)" value={stats.failed24h} icon={XCircle} color="bg-rose-500" />
    </div>
  );
}