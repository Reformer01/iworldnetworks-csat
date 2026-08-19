export const EMAIL_TYPE_LABELS: Record<string, string> = {
  invoice_reminder: 'Invoice Reminder',
  churn_survey: 'Churn Survey',
  winback: 'Win-Back',
  feedback_request: 'Feedback Request',
  manual: 'Manual',
  campaign: 'Campaign',
};

export const EMAIL_TYPES = Object.keys(EMAIL_TYPE_LABELS);

export const EMAIL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  sent: 'Sent',
  failed: 'Failed',
  pending_approval: 'Awaiting Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const EMAIL_STATUSES = Object.keys(EMAIL_STATUS_LABELS);

export const EMAIL_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  processing: 'bg-sky-100 text-sky-700',
  sent: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  pending_approval: 'bg-orange-100 text-orange-700',
  approved: 'bg-violet-100 text-violet-700',
  rejected: 'bg-zinc-200 text-zinc-600',
};

export function emailTypeLabel(type: string): string {
  return EMAIL_TYPE_LABELS[type] || type;
}

export function fmtDateTime(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
