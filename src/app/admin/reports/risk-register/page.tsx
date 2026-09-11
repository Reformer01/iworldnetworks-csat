'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { isSuperAdmin } from '@/lib/admin-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ShieldAlert, RefreshCw, Save } from 'lucide-react';

interface RiskRow {
  customerId: string;
  customerName: string | null;
  city: string | null;
  lifecycle: string | null;
  mrr: number;
  tier: string | null;
  score: number | null;
  overdueDays: number;
  riskLevel: 'High' | 'Medium' | 'Low';
  reason: string;
  actionTaken: string;
  outcome: string;
  nextReview: string;
  owner: string;
}

function levelClasses(level: RiskRow['riskLevel']): string {
  if (level === 'High') return 'bg-red-100 text-red-800';
  if (level === 'Medium') return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-100 text-emerald-800';
}

export default function RiskRegisterPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [message, setMessage] = useState('');

  const isSuper = isSuperAdmin(user?.email || '');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setMessage('');
    const token = await user.getIdToken();
    const res = await fetch('/api/admin/reports/risk-register', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setRows(json.data?.rows ?? []);
    } else {
      setMessage('Failed to load risk register.');
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (customerId: string, field: 'actionTaken' | 'outcome' | 'nextReview' | 'owner', value: string) => {
    setRows((prev) => prev.map((r) => (r.customerId === customerId ? { ...r, [field]: value } : r)));
  };

  const saveRow = async (row: RiskRow) => {
    setSavingId(row.customerId);
    setMessage('');
    const token = await user?.getIdToken();
    const res = await fetch('/api/admin/reports/risk-register', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerId: row.customerId,
        customerName: row.customerName ?? undefined,
        mrr: row.mrr,
        riskLevel: row.riskLevel,
        reason: row.reason,
        actionTaken: row.actionTaken,
        outcome: row.outcome,
        nextReview: row.nextReview,
        owner: row.owner,
      }),
    });
    setMessage(res.ok ? `Saved ${row.customerName ?? row.customerId}.` : 'Failed to save row.');
    setSavingId(null);
  };

  if (!isSuper) {
    return (
      <SalesLayout>
        <div className="max-w-2xl mx-auto py-20 text-center">
          <p className="font-mono text-xs">Super admin only</p>
        </div>
      </SalesLayout>
    );
  }

  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto mb-24">
        <header className="mb-6">
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Customer Risk Register</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold opacity-60 mt-1">
            Active customers flagged by health score or overdue payments — sorted by MRR at risk
          </p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs opacity-60">{loading ? 'Loading…' : `${rows.length} customers at risk`}</p>
          <Button onClick={load} disabled={loading} variant="outline" className="rounded-full">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {message && <p className="mt-3 font-mono text-xs font-bold">{message}</p>}

        <section className="mt-4 bg-white rounded-2xl border p-5 overflow-x-auto">
          {rows.length === 0 && !loading ? (
            <p className="font-mono text-xs opacity-60 py-6 text-center">
              No at-risk customers found — every customer is healthy and current on payments.
            </p>
          ) : (
            <table className="w-full text-sm min-w-[1200px]">
              <thead>
                <tr className="border-b-2 border-border font-mono text-[9px] uppercase text-on-surface-variant font-bold text-left">
                  <th className="py-2 px-2">Customer</th>
                  <th className="py-2 px-2 text-right">MRR</th>
                  <th className="py-2 px-2">Risk Level</th>
                  <th className="py-2 px-2">Reason for Risk</th>
                  <th className="py-2 px-2 bg-amber-50">Action Taken</th>
                  <th className="py-2 px-2 bg-amber-50">Outcome</th>
                  <th className="py-2 px-2 bg-amber-50">Next Review</th>
                  <th className="py-2 px-2 bg-amber-50">Relationship Owner</th>
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customerId} className="border-b border-border/30 hover:bg-gray-50/50">
                    <td className="py-1.5 px-2">
                      <p className="font-bold whitespace-nowrap">{r.customerName ?? r.customerId}</p>
                      {r.city && <p className="text-[10px] opacity-50">{r.city}</p>}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold whitespace-nowrap">₦{Math.round(r.mrr).toLocaleString()}</td>
                    <td className="py-1.5 px-2">
                      <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold uppercase whitespace-nowrap ${levelClasses(r.riskLevel)}`}>{r.riskLevel}</span>
                    </td>
                    <td className="py-1.5 px-2 text-xs max-w-[220px]">{r.reason}</td>
                    <td className="py-1 px-1 bg-amber-50/60 min-w-[150px]">
                      <input
                        value={r.actionTaken}
                        onChange={(e) => update(r.customerId, 'actionTaken', e.target.value)}
                        className="w-full bg-transparent border border-amber-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </td>
                    <td className="py-1 px-1 bg-amber-50/60 min-w-[130px]">
                      <input
                        value={r.outcome}
                        onChange={(e) => update(r.customerId, 'outcome', e.target.value)}
                        className="w-full bg-transparent border border-amber-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </td>
                    <td className="py-1 px-1 bg-amber-50/60 min-w-[110px]">
                      <Input
                        type="date"
                        value={r.nextReview}
                        onChange={(e) => update(r.customerId, 'nextReview', e.target.value)}
                        className="h-7 bg-transparent border-amber-200 rounded px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="py-1 px-1 bg-amber-50/60 min-w-[120px]">
                      <input
                        value={r.owner}
                        onChange={(e) => update(r.customerId, 'owner', e.target.value)}
                        className="w-full bg-transparent border border-amber-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <Button onClick={() => saveRow(r)} disabled={savingId === r.customerId} size="sm" className="rounded-full">
                        <Save className="w-3.5 h-3.5 mr-1" /> {savingId === r.customerId ? '…' : 'Save'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="mt-3 font-mono text-[9px] uppercase tracking-widest opacity-40 flex items-center gap-1">
          <ShieldAlert className="w-3 h-3" /> Risk level is derived from health-score tier and overdue days; High = critical/churning tier or &gt;30 days overdue.
        </p>
      </div>
    </SalesLayout>
  );
}
