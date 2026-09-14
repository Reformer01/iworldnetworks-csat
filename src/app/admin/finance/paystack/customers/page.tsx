'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { isSuperAdmin } from '@/lib/admin-config';
import { SavedViewBar } from '@/components/finance/paystack/SavedViewBar';
import { ExportButtons } from '@/components/finance/paystack/ExportButtons';
import { formatNairaNgn } from '@/components/finance/paystack/FinanceKpiCards';

interface CustomerItem {
  email: string | null;
  name: string;
  lifetimeNaira: number;
  frequency: number;
  lastPaidAt: string | null;
  firstPaidAt: string | null;
  region: string | null;
  segment: string | null;
  status: 'new' | 'returning';
}

interface CustomersResponse {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  items: CustomerItem[];
}

export default function PaystackCustomersPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = isSuperAdmin((user?.email || '').toLowerCase());
  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const filters = useMemo(() => ({ query, month, page }), [query, month, page]);

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
        if (month) params.set('month', month);
        const res = await fetch(`/api/admin/finance/paystack/customers?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setDenied(true);
          return;
        }
        const json = await res.json();
        if (!json.success) {
          if (!cancelled) setError(json.error || 'Failed to load customers');
          return;
        }
        if (!cancelled) setData(json.data as CustomersResponse);
      } catch {
        if (!cancelled) setError('Failed to load customers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, query, month, page]);

  const items = data?.items || [];
  const newCount = items.filter((c) => c.status === 'new').length;
  const returningCount = items.filter((c) => c.status === 'returning').length;
  const cohorts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of items) {
      const key = c.segment || c.region || 'Unknown';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const followUps = useMemo(() => items.filter((c) => c.frequency === 1).slice(0, 10), [items]);

  function applySaved(saved: Record<string, unknown>) {
    if (typeof saved.query === 'string') setQuery(saved.query);
    if (typeof saved.month === 'string') setMonth(saved.month);
    setPage(typeof saved.page === 'number' && saved.page >= 1 ? saved.page : 1);
  }

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="Loading customers">
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
          <h1 className="font-display text-2xl font-black uppercase tracking-tight md:text-3xl">Customers</h1>
          <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">
            {newCount} new · {returningCount} returning on this page
          </p>
        </div>
        <ExportButtons items={[{ scope: 'customers', label: 'Export CSV', month: month || undefined }]} getToken={getToken} />
      </header>

      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search name, email, reference…"
          aria-label="Search customers"
          className="rounded-full border border-border bg-white px-4 py-2 font-mono text-xs"
        />
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

      <SavedViewBar scope="customers" currentFilters={filters} getToken={getToken} canManage={canManage} onApply={applySaved} />

      {error && <p className="mt-3 font-mono text-xs font-bold text-red-600">{error}</p>}

      <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-border bg-white p-4 whisper-shadow" aria-label="Cohort grouping">
          <h2 className="font-display text-sm font-black uppercase tracking-tight">Cohorts</h2>
          {cohorts.length === 0 ? (
            <p className="mt-1 font-mono text-[11px] opacity-60">No cohorts</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {cohorts.map(([name, count]) => (
                <li key={name} className="flex justify-between font-mono text-[11px]">
                  <span>{name}</span>
                  <span className="font-bold">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-white p-4 whisper-shadow xl:col-span-2" aria-label="Follow-up list">
          <h2 className="font-display text-sm font-black uppercase tracking-tight">Follow-up list</h2>
          <p className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">
            Single-payment customers needing nurture
          </p>
          {followUps.length === 0 ? (
            <p className="mt-2 font-mono text-[11px] opacity-60">No follow-ups due</p>
          ) : (
            <ul className="mt-2 divide-y">
              {followUps.map((c) => (
                <li key={c.email || c.name} className="flex flex-wrap justify-between gap-2 py-1.5 font-mono text-[11px]">
                  <span>{c.name || c.email || '—'}</span>
                  <span className="opacity-60">{formatNairaNgn(c.lifetimeNaira)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-white whisper-shadow">
        {items.length === 0 ? (
          <p className="py-10 text-center font-mono text-[11px] uppercase tracking-widest opacity-60">No customers found</p>
        ) : (
          <table className="w-full min-w-[760px] text-left" aria-label="Payers">
            <thead>
              <tr className="border-b font-mono text-[10px] uppercase font-bold opacity-60 whitespace-nowrap">
                <th scope="col" className="px-3 py-2.5">
                  Customer
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Lifetime
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Payments
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Region
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Last paid
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((c) => (
                <tr key={c.email || c.name} className="transition-colors hover:bg-gray-50">
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-xs" title={c.email || ''}>
                    {c.name || c.email || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs font-bold text-emerald-700">
                    {formatNairaNgn(c.lifetimeNaira)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11px]">{c.frequency}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">{c.status}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">{c.region || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] opacity-60">
                    {c.lastPaidAt ? new Date(c.lastPaidAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
