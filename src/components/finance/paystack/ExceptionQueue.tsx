'use client';

import { useState } from 'react';

export interface FinanceExceptionItem {
  id: string;
  kind: string;
  paystackReference?: string | null;
  splynxLedgerId?: string | null;
  title: string;
  detail?: string | null;
  amountNaira?: number | null;
  ownerEmail?: string | null;
  status: string;
  followUpAt?: string | null;
  history?: { by?: string; at?: string; text?: string }[] | null;
}

export interface ExceptionAssignment {
  ownerEmail: string;
  followUpAt: string;
  note: string;
}

export function ExceptionQueue({
  items,
  canManage,
  assigningId,
  onAssign,
}: {
  items: FinanceExceptionItem[];
  canManage: boolean;
  assigningId?: string | null;
  onAssign?: (exceptionId: string, assignment: ExceptionAssignment) => void | Promise<void>;
}) {
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!items || items.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center rounded-2xl border border-border bg-white">
        <p className="font-mono text-[11px] uppercase tracking-widest opacity-60">No open exceptions</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Exception queue">
      {items.map((item) => (
        <li key={item.id} className="rounded-2xl border border-border bg-white p-4 whisper-shadow">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-700">{item.kind}</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-600">
              {item.status}
            </span>
            {item.ownerEmail && <span className="font-mono text-[10px] opacity-60">Owner: {item.ownerEmail}</span>}
            {item.followUpAt && (
              <span className="font-mono text-[10px] opacity-60">
                Follow-up: {new Date(item.followUpAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-bold">{item.title}</p>
          {item.paystackReference && <p className="mt-0.5 font-mono text-[11px] opacity-60">Ref: {item.paystackReference}</p>}
          {item.amountNaira != null && (
            <p className="mt-0.5 font-mono text-[11px] opacity-60">Amount: ₦{(item.amountNaira || 0).toLocaleString('en-NG')}</p>
          )}
          {Array.isArray(item.history) && item.history.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">
                Audit history ({item.history.length})
              </summary>
              <ul className="mt-1 space-y-1">
                {item.history.map((h, i) => (
                  <li key={i} className="font-mono text-[11px] opacity-60">
                    {h.at ? new Date(h.at).toLocaleDateString('en-NG') : ''} · {h.by || '—'} · {h.text || ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {canManage && onAssign && (
            <form
              className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4"
              aria-label={`Assign exception ${item.id}`}
              onSubmit={(e) => {
                e.preventDefault();
                void onAssign(item.id, {
                  ownerEmail: owners[item.id] || '',
                  followUpAt: followUps[item.id] || '',
                  note: notes[item.id] || '',
                });
              }}
            >
              <input
                type="email"
                required
                placeholder="Owner email"
                aria-label="Owner email"
                value={owners[item.id] || item.ownerEmail || ''}
                onChange={(e) => setOwners((s) => ({ ...s, [item.id]: e.target.value }))}
                className="rounded-full border border-border bg-white px-3 py-1.5 font-mono text-xs"
              />
              <input
                type="date"
                aria-label="Follow-up date"
                value={followUps[item.id] || (item.followUpAt ? String(item.followUpAt).slice(0, 10) : '')}
                onChange={(e) => setFollowUps((s) => ({ ...s, [item.id]: e.target.value }))}
                className="rounded-full border border-border bg-white px-3 py-1.5 font-mono text-xs"
              />
              <input
                type="text"
                placeholder="Follow-up note"
                aria-label="Follow-up note"
                maxLength={191}
                value={notes[item.id] || ''}
                onChange={(e) => setNotes((s) => ({ ...s, [item.id]: e.target.value }))}
                className="rounded-full border border-border bg-white px-3 py-1.5 font-mono text-xs"
              />
              <button
                type="submit"
                disabled={assigningId === item.id}
                className="rounded-full bg-secondary px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
              >
                {assigningId === item.id ? 'Assigning…' : 'Assign'}
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
