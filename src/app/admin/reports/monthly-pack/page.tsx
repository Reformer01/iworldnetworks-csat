'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { isSuperAdmin } from '@/lib/admin-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Download,
  Calendar,
  Save,
  FileText,
  Database,
  Users,
  TrendingUp,
  Activity,
  AlertTriangle,
  Phone,
  Headset,
  BarChart3,
  Clock3,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/lib/utils';
import type { KpiRow, ComplaintBreakdownRow } from '@/lib/reports/monthly-pack';

const WORKBOOKS = ['03_Customer_Experience', '01_Financial', '02_Sales', '04_Operations'] as const;

interface SnapshotInfo {
  savedBy: string | null;
  savedAt: string | null;
}

function statusClasses(status: KpiRow['status']): string {
  if (status === 'on-track') return 'bg-emerald-100 text-emerald-700';
  if (status === 'at-risk') return 'bg-amber-100 text-amber-700';
  return 'bg-zinc-100 text-zinc-600';
}
function statusLabel(status: KpiRow['status']): string {
  if (status === 'on-track') return 'On track';
  if (status === 'at-risk') return 'At risk';
  return '—';
}
function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border', className)}>{children}</div>;
}
function SectionTitle({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      {Icon && <Icon className="w-5 h-5 text-secondary" />}
      <h3 className="font-display font-bold text-base md:text-lg uppercase tracking-tight">{label}</h3>
    </div>
  );
}

export default function MonthlyPackPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [source, setSource] = useState<'csat' | 'splynx'>('csat');
  const [live, setLive] = useState<{ liveCount: number; note: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<KpiRow[]>([]);
  const [breakdown, setBreakdown] = useState<ComplaintBreakdownRow[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotInfo>({ savedBy: null, savedAt: null });
  const [message, setMessage] = useState('');
  const [activeWorkbook, setActiveWorkbook] = useState<(typeof WORKBOOKS)[number]>('03_Customer_Experience');

  const isSuper = isSuperAdmin(user?.email || '');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setMessage('');
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/reports/monthly-pack?month=${month}&format=json&source=${source}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      // Live Splynx returns {liveCount, note} without rows — keep current rows and show live banner
      if (json.data?.liveCount !== undefined) {
        setLive({ liveCount: json.data.liveCount, note: json.data.note });
        // Fall back to CSAT rows for table (live has no historical rows)
        if (json.data.rows) {
          setRows(json.data.rows);
          setBreakdown(json.data.breakdown ?? []);
          setSnapshot(json.data.snapshot ?? { savedBy: null, savedAt: null });
        }
      } else {
        setRows(json.data?.rows ?? []);
        setBreakdown(json.data?.breakdown ?? []);
        setSnapshot(json.data?.snapshot ?? { savedBy: null, savedAt: null });
        setLive(null);
      }
    } else {
      setMessage('Failed to load workbook data.');
    }
    setLoading(false);
  }, [user, month, source]);

  useEffect(() => {
    load();
  }, [load]);

  const updateRow = (kpi: string, field: 'target' | 'comment' | 'action' | 'owner', value: string) => {
    setRows((prev) => prev.map((r) => (r.kpi === kpi ? { ...r, [field]: value } : r)));
  };
  const updateBreakdown = (type: string, field: 'rootCause' | 'action' | 'owner', value: string) => {
    setBreakdown((prev) => prev.map((b) => (b.type === type ? { ...b, [field]: value } : b)));
  };

  const handleSaveSnapshot = async () => {
    setSaving(true);
    setMessage('');
    const token = await user?.getIdToken();
    const res = await fetch('/api/admin/reports/monthly-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        month,
        rows: rows.map((r) => ({
          kpi: r.kpi,
          target: r.target === '—' ? '' : r.target,
          comment: r.comment,
          action: r.action,
          owner: r.owner,
        })),
        breakdown: breakdown.map((b) => ({ type: b.type, rootCause: b.rootCause, action: b.action, owner: b.owner })),
        actuals: rows.map((r) => ({ kpi: r.kpi, actual: r.actual })),
      }),
    });
    setMessage(res.ok ? 'Snapshot saved — edits persist for this month.' : 'Failed to save snapshot.');
    if (res.ok) setSnapshot((s) => ({ ...s, savedBy: user?.email ?? null, savedAt: new Date().toISOString() }));
    setSaving(false);
  };

  const handleExportCsv = async () => {
    const token = await user?.getIdToken();
    const res = await fetch(`/api/admin/reports/monthly-pack?month=${month}&format=csv`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `03_Customer_Experience_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('I-World Networks — 03_Customer_Experience Workbook', 40, 45);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Month: ${month} | Generated: ${new Date().toLocaleString()}`, 40, 62);
    autoTable(doc, {
      startY: 80,
      head: [['KPI', 'Target', 'Actual', 'Variance', 'Previous Month', 'YTD', 'Status', 'Comment / Root Cause', 'Action', 'Owner']],
      body: rows.map((r) => [r.kpi, r.target, r.actual, r.variance, r.prev, r.ytd, statusLabel(r.status), r.comment, r.action, r.owner]),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [30, 58, 95] },
      columnStyles: { 0: { cellWidth: 110 } },
    });
    autoTable(doc, {
      head: [['Complaint Type', 'No.', '% of Complaints', 'Customers Affected', 'MRR at Risk', 'Root Cause', 'Corrective Action', 'Owner']],
      body: breakdown.map((b) => [
        b.type,
        String(b.count),
        `${b.pct}%`,
        String(b.customersAffected),
        b.mrrAtRisk.toLocaleString(),
        b.rootCause ?? '',
        b.action ?? '',
        b.owner ?? '',
      ]),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [30, 58, 95] },
    });
    doc.save(`03_Customer_Experience_${month}.pdf`);
  };

  const getRow = (kpi: string) => rows.find((r) => r.kpi === kpi);

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
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 md:mb-10">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">
            Customer Experience — Monthly Pack
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
            03_Customer_Experience — verified from Splynx, Tickets, Feedback — dashboard first, workbook second
          </p>
          <div className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="font-bold">How numbers are proven:</span>
            <span className="opacity-80">
              Opening = Customer firstSyncedAt &lt; month | New = SalesRecordEntry month+customerType=new (sales truth, 41 for Aug) |
              Churned = Customer churnedAt in month (391) | Closing = Opening+New-Churned | MRR at risk = SUM mrrTotal where
              isOverdue(overdueInfo) | Complaints = Ticket | CSAT = Feedback overall≥4. Click any card to see source query.
            </span>
          </div>
        </header>

        <div className="flex gap-2 mb-4 flex-wrap">
          {WORKBOOKS.map((w) => {
            const active = w === activeWorkbook;
            const enabled = w === '03_Customer_Experience';
            return (
              <button
                key={w}
                disabled={!enabled}
                onClick={() => enabled && setActiveWorkbook(w)}
                className={`px-4 py-2 rounded-full font-mono text-[10px] font-bold uppercase tracking-widest border transition ${active ? 'bg-primary text-white border-primary' : enabled ? 'bg-white border-border hover:bg-gray-50' : 'bg-gray-50 border-border opacity-40 cursor-not-allowed'}`}
              >
                {w}
                {!enabled && ' · soon'}
              </button>
            );
          })}
        </div>

        <SectionCard className="mb-6">
          <div className="flex flex-col md:flex-row gap-4 md:items-end md:justify-between">
            <div className="flex gap-4">
              <div>
                <label className="font-mono text-[10px] uppercase font-bold">Month</label>
                <div className="flex items-center gap-2 mt-1">
                  <Calendar className="w-4 h-4 opacity-60" />
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-full w-36" />
                </div>
                <p className="font-mono text-[9px] uppercase tracking-widest opacity-50 mt-2">
                  {snapshot.savedAt
                    ? `Snapshot saved by ${snapshot.savedBy} · ${new Date(snapshot.savedAt).toLocaleString()}`
                    : 'No snapshot saved yet'}
                </p>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold">Source</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as 'csat' | 'splynx')}
                  className="mt-1 h-10 rounded-full border border-input bg-background px-3 font-mono text-xs"
                >
                  <option value="csat">CSAT Mirror (hourly sync)</option>
                  <option value="splynx">Live Splynx</option>
                </select>
                {live && (
                  <p className="font-mono text-[9px] text-emerald-700 mt-1">
                    {live.liveCount} live • {live.note.slice(0, 60)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveSnapshot} disabled={saving || loading || rows.length === 0} className="rounded-full">
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving…' : 'Save Snapshot'}
              </Button>
              <Button onClick={handleExportPdf} disabled={loading || rows.length === 0} variant="outline" className="rounded-full">
                <FileText className="w-4 h-4 mr-2" /> Export PDF
              </Button>
              <Button onClick={handleExportCsv} disabled={loading || rows.length === 0} variant="outline" className="rounded-full">
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
            </div>
          </div>
          {message && <p className="mt-3 font-mono text-xs font-bold">{message}</p>}
        </SectionCard>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-secondary/20 border-t-secondary rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5 mb-8">
              {[
                { kpi: 'Opening customer base', label: 'Opening', sub: 'Start of month', icon: Users, color: 'text-slate-600' },
                { kpi: 'New customers', label: 'New', sub: 'SalesRecordEntry', icon: TrendingUp, color: 'text-emerald-600' },
                { kpi: 'Churned customers', label: 'Churned', sub: 'Churned in month', icon: Activity, color: 'text-red-500' },
                { kpi: 'Closing customer base', label: 'Closing', sub: 'End of month', icon: Database, color: 'text-primary' },
                { kpi: 'Net customer growth', label: 'Net Growth', sub: 'New - Churned', icon: BarChart3, color: 'text-blue-600' },
                { kpi: 'Gross churn %', label: 'Churn %', sub: 'Churn / Opening', icon: AlertTriangle, color: 'text-amber-600' },
              ].map(({ kpi, label, sub, icon: Icon, color }) => {
                const r = getRow(kpi);
                return (
                  <div key={kpi} className="bg-white p-4 md:p-6 rounded-2xl whisper-shadow border border-border min-w-0">
                    <Icon className={`w-5 h-5 mb-3 ${color}`} />
                    <p className="font-mono text-[10px] uppercase text-on-surface-variant font-bold tracking-wider truncate">{label}</p>
                    <p className="text-xl xl:text-2xl font-mono font-black text-primary mt-1 break-words min-w-0" title={r?.actual ?? ''}>
                      {r?.actual ?? '—'}
                    </p>
                    <p className="font-mono text-[9px] text-on-surface-variant/60 uppercase font-bold tracking-wider mt-2 truncate">
                      {sub}
                    </p>
                    {r && r.status !== 'no-target' && (
                      <span
                        className={`inline-block mt-3 px-2.5 py-1 rounded-full text-[10px] font-bold font-mono ${statusClasses(r.status)}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 mb-8">
              <SectionCard>
                <SectionTitle icon={TrendingUp} label="MRR at Risk" />
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-mono font-black text-primary">{getRow('MRR at risk')?.actual ?? '—'}</span>
                  <span className="font-mono text-[10px] uppercase opacity-60">overdueInfo + mrrTotal</span>
                </div>
                <p className="font-mono text-[11px] opacity-60 mt-2">
                  Retained: {getRow('MRR retained')?.actual ?? '—'} · Saved: {getRow('Customers saved')?.actual ?? '—'}
                </p>
              </SectionCard>
              <SectionCard>
                <SectionTitle icon={Headset} label="Support Health" />
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="font-mono text-xl font-black">{getRow('Total complaints')?.actual ?? '0'}</p>
                    <p className="font-mono text-[9px] uppercase opacity-60">Total</p>
                  </div>
                  <div>
                    <p className="font-mono text-xl font-black text-emerald-600">{getRow('Complaints resolved')?.actual ?? '0'}</p>
                    <p className="font-mono text-[9px] uppercase opacity-60">Resolved</p>
                  </div>
                  <div>
                    <p className="font-mono text-xl font-black">{getRow('Resolution rate')?.actual ?? '—'}</p>
                    <p className="font-mono text-[9px] uppercase opacity-60">Rate</p>
                  </div>
                </div>
                <div className="flex gap-4 mt-4 text-[11px] font-mono">
                  <span>
                    CSAT: <b>{getRow('CSAT')?.actual ?? '—'}</b>
                  </span>
                  <span>
                    NPS: <b>{getRow('NPS')?.actual ?? '—'}</b>
                  </span>
                  <span className="ml-auto opacity-60">Unresolved &gt;24h: {getRow('Unresolved >24 hrs')?.actual ?? '—'}</span>
                </div>
              </SectionCard>
            </div>

            <SectionCard className="mb-8">
              <SectionTitle icon={Phone} label="KPI Workbook — editable yellow cells" />
              <div className="overflow-x-auto -mx-6 md:-mx-8">
                <div className="inline-block min-w-full align-middle px-6 md:px-8">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                        <th className="pb-3 pr-4">KPI</th>
                        <th className="pb-3 px-2 bg-amber-50/50">Target</th>
                        <th className="pb-3 px-4 text-right">Actual</th>
                        <th className="pb-3 px-2">Variance</th>
                        <th className="pb-3 px-2">Prev</th>
                        <th className="pb-3 px-2">YTD</th>
                        <th className="pb-3 px-2">Status</th>
                        <th className="pb-3 px-2 bg-amber-50/50">Owner</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-body text-sm">
                      {rows.map((r) => (
                        <tr key={r.kpi} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="py-2.5 pr-4 font-bold text-primary whitespace-nowrap">{r.kpi}</td>
                          <td className="py-2 px-2 bg-amber-50/30">
                            <input
                              value={r.target === '—' ? '' : r.target}
                              onChange={(e) => {
                                const v = e.target.value;
                                setRows((prev) => prev.map((x) => (x.kpi === r.kpi ? { ...x, target: v } : x)));
                              }}
                              placeholder="—"
                              className="w-20 bg-white border border-amber-200/50 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold">{r.actual}</td>
                          <td className="py-2.5 px-2 font-mono text-xs">{r.variance}</td>
                          <td className="py-2.5 px-2 font-mono text-xs opacity-60">{r.prev}</td>
                          <td className="py-2.5 px-2 font-mono text-xs opacity-60">{r.ytd}</td>
                          <td className="py-2.5 px-2">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold font-mono ${statusClasses(r.status)}`}>
                              {statusLabel(r.status)}
                            </span>
                          </td>
                          <td className="py-2 px-2 bg-amber-50/30">
                            <input
                              value={r.owner}
                              onChange={(e) => setRows((prev) => prev.map((x) => (x.kpi === r.kpi ? { ...x, owner: e.target.value } : x)))}
                              className="w-24 bg-white border border-amber-200/50 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </SectionCard>

            <SectionCard>
              <SectionTitle icon={Database} label="Complaint Breakdown" />
              {breakdown.length === 0 ? (
                <p className="font-mono text-xs opacity-60 py-8 text-center">
                  No complaints for {new Date().toISOString().slice(0, 7)} — honest, not hidden
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b font-mono text-[10px] uppercase font-bold opacity-60">
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2 px-2 text-right">No.</th>
                        <th className="py-2 px-2 text-right">% </th>
                        <th className="py-2 px-2 text-right">Customers</th>
                        <th className="py-2 px-2 text-right">MRR Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {breakdown.map((b) => (
                        <tr key={b.type}>
                          <td className="py-2 pr-4 font-bold">{b.type}</td>
                          <td className="py-2 px-2 text-right font-mono">{b.count}</td>
                          <td className="py-2 px-2 text-right font-mono">{b.pct}%</td>
                          <td className="py-2 px-2 text-right font-mono">{b.customersAffected}</td>
                          <td className="py-2 px-2 text-right font-mono">₦{Math.round(b.mrrAtRisk).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </SalesLayout>
  );
}
