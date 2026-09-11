'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RotateCcw, Check, X, Loader2 } from 'lucide-react';
import type { EmailJobRecord } from '@/hooks/use-emails';
import { emailTypeLabel, EMAIL_STATUS_LABELS, EMAIL_STATUS_STYLES, fmtDateTime } from '../email-meta';

export function EmailDetailModal({
  record,
  canEdit,
  canApprove,
  actionPending,
  onClose,
  onRetry,
  onApprove,
  onReject,
}: {
  record: EmailJobRecord | null;
  canEdit: boolean;
  canApprove: boolean;
  actionPending: boolean;
  onClose: () => void;
  onRetry: (record: EmailJobRecord) => void;
  onApprove: (record: EmailJobRecord) => void;
  onReject: (record: EmailJobRecord, reason?: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  // Manual emails carry subject/html/text in the payload — render a preview
  // instead of raw JSON so approvers can review before sending.
  const payload = (record?.payload ?? {}) as { type?: string; subject?: string; html?: string; text?: string };
  const isManual = record?.type === 'manual';

  return (
    <Dialog open={!!record} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-primary">
            {record ? emailTypeLabel(record.type) : 'Email'}
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-widest font-bold">
            {record?.customerEmail || ''} &middot; queued {record ? fmtDateTime(record.createdAt) : ''}
          </DialogDescription>
        </DialogHeader>
        {record && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap',
                  EMAIL_STATUS_STYLES[record.status] || EMAIL_STATUS_STYLES.pending,
                )}
              >
                {EMAIL_STATUS_LABELS[record.status] || record.status}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold font-mono">
                {record.retryCount}/{record.maxRetries} attempts
              </span>
              {record.approvedBy && (
                <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-bold font-mono">
                  by {record.approvedBy}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">Customer</span>
                <span className="font-semibold">{record.customerName || '—'}</span>
              </div>
              <div>
                <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">Email</span>
                <span className="font-semibold break-all">{record.customerEmail || '—'}</span>
              </div>
              <div>
                <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">BullMQ Job</span>
                <span className="font-mono text-[10px] break-all">{record.bullJobId || '—'}</span>
              </div>
              <div>
                <span className="text-on-surface-variant/60 block font-mono text-[9px] uppercase font-bold">Sent</span>
                <span className="font-semibold">{fmtDateTime(record.sentAt)}</span>
              </div>
            </div>

            {record.error && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs space-y-1">
                <p className="font-mono text-[9px] uppercase font-bold text-rose-700">
                  {record.status === 'rejected' ? 'Rejection reason' : 'Error'}
                </p>
                <p className="text-rose-700 break-words">{record.error}</p>
              </div>
            )}

            {isManual ? (
              <div className="rounded-xl bg-muted/40 p-3 border border-border/40 text-xs space-y-3">
                <div>
                  <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant mb-1">Subject</p>
                  <p className="font-semibold break-words">{payload.subject || '—'}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant mb-1">Body</p>
                  {payload.html ? (
                    <div
                      className="prose prose-sm max-w-none prose-p:my-1 text-xs max-h-48 overflow-y-auto"
                      dangerouslySetInnerHTML={{ __html: payload.html }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed max-h-48 overflow-y-auto">
                      {payload.text || '—'}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-muted/40 p-3 border border-border/40 text-xs">
                <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant mb-2">Payload</p>
                <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed max-h-48 overflow-y-auto">
                  {JSON.stringify(record.payload, null, 2)}
                </pre>
              </div>
            )}

            {rejecting ? (
              <div className="space-y-2">
                <Input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for rejection (optional)"
                  className="rounded-xl font-mono text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1 rounded-full bg-rose-600 text-white font-mono text-[10px] uppercase font-bold py-5"
                    disabled={actionPending}
                    onClick={() => {
                      onReject(record, reason || undefined);
                      setRejecting(false);
                      setReason('');
                    }}
                  >
                    {actionPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <X className="w-3.5 h-3.5 mr-2" />}
                    Confirm Reject
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 rounded-full font-mono text-[10px] uppercase font-bold py-5"
                    disabled={actionPending}
                    onClick={() => {
                      setRejecting(false);
                      setReason('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {canApprove && record.status === 'pending_approval' && (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 rounded-full bg-emerald-600 text-white font-mono text-[10px] uppercase font-bold py-5"
                      disabled={actionPending}
                      onClick={() => onApprove(record)}
                    >
                      {actionPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-2" />}
                      Approve &amp; Send
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 rounded-full font-mono text-[10px] uppercase font-bold py-5 text-rose-600"
                      disabled={actionPending}
                      onClick={() => setRejecting(true)}
                    >
                      <X className="w-3.5 h-3.5 mr-2" /> Reject
                    </Button>
                  </div>
                )}
                {canEdit && record.status === 'failed' && (
                  <Button
                    className="w-full rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold py-5"
                    disabled={actionPending}
                    onClick={() => onRetry(record)}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-2" /> Retry Email
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
