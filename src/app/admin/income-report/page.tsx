'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { buildIncomeCsv } from '@/lib/income-report';

type Row = {
  date: string;
  customer: string;
  email: string;
  reference: string;
  amount: number;
  enterprise: number;
  isNew: number;
  residential: number;
  sme: number;
  discounts: number;
  others: number;
  tax: number;
  balance: number;
  region: string;
  remark: string;
  note: string;
  isPrepay: boolean;
};
type Summary = {
  transactions: number;
  totalGross: number;
  vat: number;
  netBalance: number;
  newSubscribers: number;
  prepayments: number;
  residential: number;
  sme: number;
  enterprise: number;
  discounts: number;
  others: number;
};

function fmt(n: number) {
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

const SEGMENTS = ['__all', 'residential', 'sme', 'enterprise', 'other'];
const CHANNELS = ['__all', 'paystack', 'bank', 'cash', 'transfer', 'credit'];

export default function IncomeReportPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [range, setRange] = useState(() => monthBounds(new Date().toISOString().slice(0, 7)));
  const [region, setRegion] = useState('__all');
  const [segment, setSegment] = useState('__all');
  const [channel, setChannel] = useState('__all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [data, setData] = useState<{ summary: Summary; rows: Row[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const q = new URLSearchParams({
        from: range.from,
        to: range.to,
        region,
        segment,
        channel,
        search: debouncedSearch,
      });
      const res = await fetch(`/api/admin/income-report?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || j?.message || `HTTP ${res.status}`);
      setData({ summary: j.data.summary, rows: j.data.rows });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user, range, region, segment, channel, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const shift = (d: number) => {
    const [y, m] = month.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
    setMonth(next);
    setRange(monthBounds(next));
  };

  const regions = useMemo(() => {
    const set = new Set((data?.rows ?? []).map((r) => r.region).filter(Boolean));
    return ['__all', ...[...set].sort()];
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    const csv = buildIncomeCsv(data.rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `income-report-${range.from}_to_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = data?.summary;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[26px] font-medium tracking-[-0.03em] text-primary">Monthly Income Report</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Transaction data from Splynx — classified by customer type</p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!data?.rows.length}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="px-4 py-2 rounded-xl border bg-white font-mono text-sm font-bold">
            {new Date(month + '-01T00:00:00Z').toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </div>
          <Button variant="outline" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex items-end gap-3 mb-6 flex-wrap">
          <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-widest text-muted-foreground font-bold">
            From
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="px-3 py-2 rounded-xl border bg-white font-mono text-sm font-normal text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-widest text-muted-foreground font-bold">
            To
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="px-3 py-2 rounded-xl border bg-white font-mono text-sm font-normal text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-widest text-muted-foreground font-bold">
            Region
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="px-3 py-2 rounded-xl border bg-white font-mono text-sm font-normal text-foreground"
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r === '__all' ? 'All regions' : r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-widest text-muted-foreground font-bold">
            Segment
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className="px-3 py-2 rounded-xl border bg-white font-mono text-sm font-normal text-foreground"
            >
              {SEGMENTS.map((v) => (
                <option key={v} value={v}>
                  {v === '__all' ? 'All segments' : v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-widest text-muted-foreground font-bold">
            Channel
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="px-3 py-2 rounded-xl border bg-white font-mono text-sm font-normal text-foreground"
            >
              {CHANNELS.map((v) => (
                <option key={v} value={v}>
                  {v === '__all' ? 'All channels' : v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-widest text-muted-foreground font-bold">
            Search
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer, email, reference…"
              className="px-3 py-2 rounded-xl border bg-white font-mono text-sm font-normal text-foreground min-w-[200px]"
            />
          </label>
        </div>

        {err && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">{err}</div>}

        {s && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            {[
              ['Transactions', String(s.transactions)],
              ['Total Gross', fmt(s.totalGross)],
              ['VAT (7.5%)', fmt(s.vat)],
              ['Net Balance', fmt(s.netBalance)],
              ['New Subscribers', String(s.newSubscribers)],
              ['Prepayments', String(s.prepayments)],
              ['Residential', fmt(s.residential)],
              ['SME', fmt(s.sme)],
              ['Enterprise', fmt(s.enterprise)],
              ['Discounts', fmt(s.discounts)],
              ['Others', fmt(s.others)],
            ].map(([k, v]) => (
              <div key={k} className="bg-white rounded-xl border p-4 card-shadow">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{k}</div>
                <div className="tabular font-bold text-sm mt-1 truncate">{v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-xl border overflow-hidden card-shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-medium">
                <tr>
                  <th className="text-left px-3 py-3">Date</th>
                  <th className="text-left px-3 py-3">Customer</th>
                  <th className="text-left px-3 py-3">Email</th>
                  <th className="text-left px-3 py-3">Reference</th>
                  <th className="text-right px-3 py-3">Amount Paid</th>
                  <th className="text-right px-3 py-3">Enterprise</th>
                  <th className="text-right px-3 py-3">New</th>
                  <th className="text-right px-3 py-3">Residential Internet</th>
                  <th className="text-right px-3 py-3">SME Internet</th>
                  <th className="text-right px-3 py-3">Discounts</th>
                  <th className="text-right px-3 py-3">Others</th>
                  <th className="text-right px-3 py-3">Tax</th>
                  <th className="text-right px-3 py-3">Balance</th>
                  <th className="text-left px-3 py-3">Region</th>
                  <th className="text-left px-3 py-3">Remark</th>
                  <th className="text-left px-3 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!data ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-12 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'No data'}
                    </td>
                  </tr>
                ) : data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-12 text-center text-muted-foreground">
                      No transactions for {range.from} → {range.to}
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.date}</td>
                      <td className="px-3 py-2 font-medium leading-tight whitespace-nowrap">{r.customer}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{r.email}</td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.reference}</td>
                      <td className="px-3 py-2 text-right font-mono tabular">{fmt(r.amount)}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.enterprise ? fmt(r.enterprise) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.isNew}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.residential ? fmt(r.residential) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.sme ? fmt(r.sme) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.discounts ? fmt(r.discounts) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.others ? fmt(r.others) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(r.tax)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular font-semibold">{fmt(r.balance)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.region}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.remark}</td>
                      <td className="px-3 py-2 max-w-[260px] truncate" title={r.note}>
                        {r.note}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
