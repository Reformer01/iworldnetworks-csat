'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { isSuperAdmin } from '@/lib/admin-config';
import { ExceptionQueue, type ExceptionAssignment, type FinanceExceptionItem } from '@/components/finance/paystack/ExceptionQueue';

const QUEUES = ['matched', 'paystack-only', 'splynx-only', 'amount-mismatch', 'date-mismatch', 'duplicate'] as const;
type QueueName = (typeof QUEUES)[number];

interface ReconResponse {
  page: number;
  perPage: number;
  counts: Record<QueueName, number>;
  queues: Record<QueueName, { count: number; rows: Record<string, unknown>[] }>;
}

function rowLabel(row: Record<string, unknown>): string {
  return String(row.reference || row.paystackReference || row.splynxLedgerId || '—');
}

export default function PaystackReconciliationPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [queue, setQueue] = useState<QueueName>('paystack-only');
  const [data, setData] = useState<ReconResponse | null>(null);
  const [exceptions, setExceptions] = useState<FinanceExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = isSuperAdmin((user?.email || '').toLowerCase());
  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);
  void getToken;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDenied(false);
      try {
        const token = await user!.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [reconRes, excRes] = await Promise.all([
          fetch('/api/admin/finance/paystack/reconciliation?perPage=50', { headers }),
          fetch('/api/admin/finance/paystack/exceptions?perPage=50', { headers }),
        ]);
        if (reconRes.status === 401 || reconRes.status === 403) {
          if (!cancelled) setDenied(true);
          return;
        }
        const reconJson = await reconRes.json();
        if (!reconJson.success) {
          if (!cancelled) setError(reconJson.error || 'Failed to load reconciliation');
          return;
        }
        if (!cancelled) setData(reconJson.data as ReconResponse);
        const excJson = await excRes.json();
        if (!cancelled && excJson.success) setExceptions(excJson.data.items as FinanceExceptionItem[]);
      } catch {
        if (!cancelled) setError('Failed to load reconciliation');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function assign(exceptionId: string, assignment: ExceptionAssignment) {
    if (!user) return;
    setAssigningId(exceptionId);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/finance/paystack/exceptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ exceptionId, ...assignment }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Assignment failed');
      setExceptions((items) => items.map((item) => (item.id === exceptionId ? (json.data as FinanceExceptionItem) : item)));
      setNotice('Exception assigned');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Assignment failed');
    } finally {
      setAssigningId(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="Loading reconciliation">
        <Loader2 className="h-7 w-7 animate-spin text-secondary" />
      </div>
    );
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-600" />
        <h1 className="font-display text-lg font-black uppercase tracking-tight">Access denied</h1>
        <p className="mt-1 font-mono text-[11px] opacity-60">Your account does not have Paystack finance access.</p>
      </div>
    );
  }

  const queueRows = data?.queues[queue]?.rows || [];

  return (
    <div>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-black uppercase tracking-tight md:text-3xl">Reconciliation</h1>
        <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">
          Reference-first matching with assignment-only exceptions
        </p>
      </header>

      {error && <p className="mb-3 font-mono text-xs font-bold text-red-600">{error}</p>}
      {notice && <p className="mb-3 font-mono text-[11px] text-emerald-700">{notice}</p>}

      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Reconciliation queues">
        {QUEUES.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={queue === name}
            onClick={() => setQueue(name)}
            className={`rounded-full border px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest ${
              queue === name ? 'bg-secondary text-white border-secondary' : 'bg-white border-border hover:bg-gray-50'
            }`}
          >
            {name} · {data?.counts[name] ?? 0}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-white p-4 whisper-shadow" aria-label={`${queue} queue`}>
        {queueRows.length === 0 ? (
          <p className="py-8 text-center font-mono text-[11px] uppercase tracking-widest opacity-60">No rows in {queue}</p>
        ) : (
          <ul className="divide-y">
            {queueRows.slice(0, 50).map((row, i) => (
              <li key={`${rowLabel(row)}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-mono text-xs font-bold">{rowLabel(row)}</span>
                <span className="font-mono text-[11px] opacity-60">
                  {typeof row.amountNaira === 'number'
                    ? `₦${row.amountNaira.toLocaleString('en-NG')}`
                    : typeof row.paystackAmountNaira === 'number'
                      ? `₦${row.paystackAmountNaira.toLocaleString('en-NG')}`
                      : ''}
                  {typeof row.varianceNaira === 'number' ? ` · variance ₦${row.varianceNaira.toLocaleString('en-NG')}` : ''}
                  {typeof row.customerEmail === 'string' && row.customerEmail ? ` · ${row.customerEmail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h2 className="mb-2 font-display text-sm font-black uppercase tracking-tight">Exception queue</h2>
        <ExceptionQueue items={exceptions} canManage={canManage} assigningId={assigningId} onAssign={canManage ? assign : undefined} />
      </section>
    </div>
  );
}
