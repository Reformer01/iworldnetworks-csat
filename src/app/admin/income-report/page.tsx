'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';

type Row = {
  date: string;
  customer: string;
  email: string;
  reference: string;
  amount: number;
  residential: number;
  sme: number;
  enterprise: number;
  tax: number;
  balance: number;
  region: string;
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
};

function fmt(n: number) {
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function IncomeReportPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<{ summary: Summary; rows: Row[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErr(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/income-report?month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${res.status}`);
      setData({ summary: j.data.summary, rows: j.data.rows });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user, month]);

  useEffect(() => {
    load();
  }, [load]);

  const shift = (d: number) => {
    const [y, m] = month.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + d, 1));
    setMonth(dt.toISOString().slice(0, 7));
  };

  const exportCsv = () => {
    if (!data) return;
    const head = ['Date', 'Customer', 'Reference', 'Amount', 'Residential', 'SME', 'Enterprise', 'Tax (7.5%)', 'Balance', 'Region', 'Note'];
    const rows = data.rows.map((r) =>
      [
        r.date,
        r.customer,
        r.reference,
        String(r.amount),
        String(r.residential),
        String(r.sme),
        String(r.enterprise),
        String(r.tax),
        String(r.balance),
        r.region,
        r.note,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [head.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `income-report-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = data?.summary;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-primary uppercase tracking-tight">Monthly Income Report</h1>
            <p className="text-sm text-muted-foreground">Transaction data from Splynx — classified by customer type</p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!data?.rows.length}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
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

        {err && <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">{err}</div>}

        {s && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3 mb-6">
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
            ].map(([k, v]) => (
              <div key={k} className="bg-white rounded-2xl border p-4 whisper-shadow">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{k}</div>
                <div className="font-mono font-bold text-sm mt-1 truncate">{v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl border overflow-hidden whisper-shadow">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] font-mono uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-3">Date</th>
                  <th className="text-left px-3 py-3">Customer</th>
                  <th className="text-left px-3 py-3">Reference</th>
                  <th className="text-right px-3 py-3">Amount</th>
                  <th className="text-right px-3 py-3">Residential</th>
                  <th className="text-right px-3 py-3">SME</th>
                  <th className="text-right px-3 py-3">Enterprise</th>
                  <th className="text-right px-3 py-3">Tax (7.5%)</th>
                  <th className="text-right px-3 py-3">Balance</th>
                  <th className="text-left px-3 py-3">Region</th>
                  <th className="text-left px-3 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {!data ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'No data'}
                    </td>
                  </tr>
                ) : data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                      No transactions for {month}
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">{r.date}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium leading-tight">{r.customer}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(r.amount)}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.residential ? fmt(r.residential) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.sme ? fmt(r.sme) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.enterprise ? fmt(r.enterprise) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(r.tax)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(r.balance)}</td>
                      <td className="px-3 py-2">{r.region}</td>
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
