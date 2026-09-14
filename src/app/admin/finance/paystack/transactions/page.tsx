'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { isSuperAdmin } from '@/lib/admin-config';
import { TransactionsTable, type FinanceTransactionRow } from '@/components/finance/paystack/TransactionsTable';
import { SavedViewBar } from '@/components/finance/paystack/SavedViewBar';
import { ExportButtons } from '@/components/finance/paystack/ExportButtons';
import { CollectionsTrendChart } from '@/components/finance/paystack/CollectionsTrendChart';

interface TransactionsResponse {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  items: {
    reference: string;
    customer: string;
    customerEmail: string | null;
    amountNaira: number;
    channel: string | null;
    status: string;
    paidAt: string | null;
  }[];
}

const STATUSES = ['', 'success', 'failed', 'abandoned'];
const CHANNELS = ['', 'card', 'bank_transfer', 'ussd', 'bank', 'mobile_money'];

export default function PaystackTransactionsPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = isSuperAdmin((user?.email || '').toLowerCase());
  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const filters = useMemo(() => ({ query, status, channel, month, page }), [query, status, channel, month, page]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDenied(false);
      try {
        const token = await user!.getIdToken();
        const params = new URLSearchParams({ page: String(page), perPage: '20' });
        if (query) params.set('query', query);
        if (status) params.set('status', status);
        if (channel) params.set('channel', channel);
        if (month) params.set('month', month);
        const res = await fetch(`/api/admin/finance/paystack/transactions?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setDenied(true);
          return;
        }
        const json = await res.json();
        if (!json.success) {
          if (!cancelled) setError(json.error || 'Failed to load transactions');
          return;
        }
        if (!cancelled) setData(json.data as TransactionsResponse);
      } catch {
        if (!cancelled) setError('Failed to load transactions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, query, status, channel, month, page]);

  const rows: FinanceTransactionRow[] = useMemo(
    () =>
      (data?.items || []).map((item) => ({
        reference: item.reference,
        customer: item.customer,
        customerEmail: item.customerEmail,
        amountNaira: item.amountNaira,
        channel: item.channel,
        status: item.status,
        paidAt: item.paidAt,
      })),
    [data],
  );

  const series = useMemo(() => {
    const map = new Map<string, { collectedNaira: number; count: number }>();
    for (const row of rows) {
      if ((row.status || '').toLowerCase() !== 'success' || !row.paidAt) continue;
      const day = new Date(row.paidAt).toISOString().slice(0, 10);
      const entry = map.get(day) ?? { collectedNaira: 0, count: 0 };
      entry.collectedNaira = Math.round((entry.collectedNaira + row.amountNaira) * 100) / 100;
      entry.count += 1;
      map.set(day, entry);
    }
    return [...map.entries()]
      .map(([date, v]) => ({ date, collectedNaira: v.collectedNaira, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  function applySaved(saved: Record<string, unknown>) {
    if (typeof saved.query === 'string') setQuery(saved.query);
    if (typeof saved.status === 'string') setStatus(saved.status);
    if (typeof saved.channel === 'string') setChannel(saved.channel);
    if (typeof saved.month === 'string') setMonth(saved.month);
    setPage(typeof saved.page === 'number' && saved.page >= 1 ? saved.page : 1);
  }

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="Loading transactions">
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

  return (
    <div>
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-black uppercase tracking-tight md:text-3xl">Transactions</h1>
          <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">
            {data ? `${data.total.toLocaleString('en-NG')} matching payments` : 'Search and filter collections'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(view === 'table' ? 'chart' : 'table')}
            className="rounded-full border border-border bg-white px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50"
          >
            {view === 'table' ? 'Chart view' : 'Table view'}
          </button>
          <ExportButtons items={[{ scope: 'transactions', label: 'Export CSV', month: month || undefined }]} getToken={getToken} />
        </div>
      </header>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search reference, customer…"
          aria-label="Search transactions"
          className="rounded-full border border-border bg-white px-4 py-2 font-mono text-xs"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="rounded-full border border-border bg-white px-4 py-2 font-mono text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
        <select
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by channel"
          className="rounded-full border border-border bg-white px-4 py-2 font-mono text-xs"
        >
          {CHANNELS.map((c) => (
            <option key={c || 'all'} value={c}>
              {c || 'All channels'}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by month"
          className="rounded-full border border-border bg-white px-4 py-2 font-mono text-xs"
        />
      </div>

      <SavedViewBar scope="transactions" currentFilters={filters} getToken={getToken} canManage={canManage} onApply={applySaved} />

      <div className="mt-3">
        {error ? (
          <p className="font-mono text-xs font-bold text-red-600">{error}</p>
        ) : view === 'chart' ? (
          <CollectionsTrendChart data={series} />
        ) : (
          <TransactionsTable rows={rows} />
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="font-mono text-[11px] opacity-60">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-full border border-border bg-white px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-border bg-white px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
