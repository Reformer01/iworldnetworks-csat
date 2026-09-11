'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ExternalLink, RotateCcw, Check, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { EmailJobRecord } from '@/hooks/use-emails';
import { emailTypeLabel, EMAIL_STATUS_LABELS, EMAIL_STATUS_STYLES, fmtDateTime } from '../email-meta';

export function EmailQueueTable({
  records,
  canEdit,
  canApprove,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onRetry,
  onApprove,
  onReject,
}: {
  records: EmailJobRecord[];
  canEdit: boolean;
  canApprove: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onView: (record: EmailJobRecord) => void;
  onRetry: (record: EmailJobRecord) => void;
  onApprove: (record: EmailJobRecord) => void;
  onReject: (record: EmailJobRecord) => void;
}) {
  const [sortBy, setSortBy] = useState<'queued' | 'sent' | 'status' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  if (records.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center">
        <p className="font-mono text-[11px] text-on-surface-variant/40 uppercase font-bold tracking-widest">
          No emails match the current filters
        </p>
      </div>
    );
  }

  const selectable = records.filter((r) => r.status === 'pending_approval');
  const allSelected = selectable.length > 0 && selectable.every((r) => selectedIds.has(r.id));

  const sorted = useMemo(() => {
    if (!sortBy) return records;
    return [...records].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortBy === 'queued') { va = a.createdAt || 0; vb = b.createdAt || 0; }
      else if (sortBy === 'sent') { va = a.sentAt || 0; vb = b.sentAt || 0; }
      else if (sortBy === 'status') { va = a.status.localeCompare(b.status) as unknown as number; vb = 0; return sortDir === 'asc' ? (a.status.localeCompare(b.status)) : (b.status.localeCompare(a.status)); }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [records, sortBy, sortDir]);

  const toggleSort = (field: 'queued' | 'sent' | 'status') => {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: 'queued' | 'sent' | 'status' }) =>
    sortBy !== field ? <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" /> : sortDir === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left border-collapse">
        <thead>
          <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest whitespace-nowrap">
            {canApprove && (
              <th className="py-3 px-4 w-10">
                <input
                  type="checkbox"
                  className="accent-secondary cursor-pointer"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  aria-label="Select all awaiting approval"
                />
              </th>
            )}
            <th className="py-3 px-4">Type</th>
            <th className="py-3 px-4">Customer</th>
            <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('status')}>
              Status <SortIcon field="status" />
            </th>
            <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('queued')}>
              Queued <SortIcon field="queued" />
            </th>
            <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('sent')}>
              Sent <SortIcon field="sent" />
            </th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40 font-body text-sm">
          {sorted.map((r) => (
            <tr key={r.id} className={cn('transition-colors', selectedIds.has(r.id) ? 'bg-orange-50/60' : 'hover:bg-surface-container-lowest')}>
              {canApprove && (
                <td className="py-2.5 px-4 w-10">
                  {r.status === 'pending_approval' && (
                    <input
                      type="checkbox"
                      className="accent-secondary cursor-pointer"
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggleSelect(r.id)}
                      aria-label={`Select ${r.id}`}
                    />
                  )}
                </td>
              )}
              <td className="py-2.5 px-4">
                <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold font-mono whitespace-nowrap">
                  {emailTypeLabel(r.type)}
                </span>
              </td>
              <td className="py-2.5 px-4">
                <p className="font-bold text-primary whitespace-nowrap">{r.customerName || '—'}</p>
                <p className="font-mono text-[10px] text-on-surface-variant/60 truncate max-w-[220px]">{r.customerEmail || ''}</p>
              </td>
              <td className="py-2.5 px-4">
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap',
                    EMAIL_STATUS_STYLES[r.status] || EMAIL_STATUS_STYLES.pending,
                  )}
                >
                  {EMAIL_STATUS_LABELS[r.status] || r.status}
                </span>
                {r.status === 'failed' && r.retryCount > 0 && (
                  <p className="text-[9px] font-mono text-on-surface-variant/50 mt-0.5">attempt {r.retryCount}/{r.maxRetries}</p>
                )}
              </td>
              <td className="py-2.5 px-4 font-mono text-[10px] text-on-surface-variant/70 whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
              <td className="py-2.5 px-4 font-mono text-[10px] text-on-surface-variant/70 whitespace-nowrap">{fmtDateTime(r.sentAt)}</td>
              <td className="py-2.5 px-4 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {canEdit && r.status === 'failed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 rounded-lg font-mono text-[9px] uppercase font-bold text-secondary"
                      onClick={() => onRetry(r)}
                      aria-label="Retry email"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" /> Retry
                    </Button>
                  )}
                  {canApprove && r.status === 'pending_approval' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 rounded-lg font-mono text-[9px] uppercase font-bold text-emerald-600"
                        onClick={() => onApprove(r)}
                        aria-label="Approve email"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 rounded-lg font-mono text-[9px] uppercase font-bold text-rose-600"
                        onClick={() => onReject(r)}
                        aria-label="Reject email"
                      >
                        <X className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-lg"
                    onClick={() => onView(r)}
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
  );
}
