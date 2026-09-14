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
      <div className="flex h-[140px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">No open exceptions</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Exception queue">
      {items.map((item) => (
        <li key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">{item.kind}</span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {item.status}
            </span>
            {item.ownerEmail && <span className="font-mono text-[10px] text-slate-400">Owner: {item.ownerEmail}</span>}
            {item.followUpAt && (
              <span className="font-mono text-[10px] text-slate-400">
                Follow-up: {new Date(item.followUpAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-bold text-white">{item.title}</p>
          {item.paystackReference && <p className="mt-0.5 font-mono text-[11px] text-slate-400">Ref: {item.paystackReference}</p>}
          {item.amountNaira != null && (
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">Amount: ₦{(item.amountNaira || 0).toLocaleString('en-NG')}</p>
          )}
          {Array.isArray(item.history) && item.history.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Audit history ({item.history.length})
              </summary>
              <ul className="mt-1 space-y-1">
                {item.history.map((h, i) => (
                  <li key={i} className="font-mono text-[11px] text-slate-400">
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
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-100"
              />
              <input
                type="date"
                aria-label="Follow-up date"
                value={followUps[item.id] || (item.followUpAt ? String(item.followUpAt).slice(0, 10) : '')}
                onChange={(e) => setFollowUps((s) => ({ ...s, [item.id]: e.target.value }))}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-100"
              />
              <input
                type="text"
                placeholder="Follow-up note"
                aria-label="Follow-up note"
                maxLength={191}
                value={notes[item.id] || ''}
                onChange={(e) => setNotes((s) => ({ ...s, [item.id]: e.target.value }))}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-100"
              />
              <button
                type="submit"
                disabled={assigningId === item.id}
                className="rounded-full bg-emerald-500 px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[#0a0f1e] disabled:opacity-50"
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
