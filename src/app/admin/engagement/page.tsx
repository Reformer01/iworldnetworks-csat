'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { CalendarClock, FileDown, Phone, Pencil, Plus, Search, Trash2, TriangleAlert, Users, Zap } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AddLogDialog } from '@/components/engagement/AddLogDialog';

interface EngagementLog {
  id: string;
  customerId: string | null;
  customerName: string;
  btsName: string | null;
  accountStatus: string | null;
  accountType: string | null;
  plan: string | null;
  region: string | null;
  phone: string | null;
  callStatus: string | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  purpose: string | null;
  feedback: string | null;
  complaint: string | null;
  upsellNote: string | null;
  retentionRisk: string | null;
  resolution: string | null;
  staffName: string;
}

interface StaffGroup {
  staffName: string;
  _count: { _all: number };
}

interface EngagementStats {
  contactedToday: number;
  dueFollowUps: number;
  highRisk: number;
  byCallStatus: Array<{ label: string; count: number }>;
  byRisk: Array<{ label: string; count: number }>;
}

const CALL_STATUSES = ['Contacted', 'No Answer', 'Not reachable', 'Switched Off', 'Busy', 'Wrong Number', 'Never Contacted'];
const RISKS = ['', 'Low', 'Medium', 'High'];

function toDateInput(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function EngagementPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [logs, setLogs] = useState<EngagementLog[]>([]);
  const [staffGroups, setStaffGroups] = useState<StaffGroup[]>([]);
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [staff, setStaff] = useState('');
  const [search, setSearch] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [risk, setRisk] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EngagementLog | null>(null);
  const [showAddLog, setShowAddLog] = useState(false);
  const [quickLog, setQuickLog] = useState(false);

  // Ctrl+Shift+L shortcut for quick-log
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setQuickLog(true);
        setShowAddLog(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const token = await user.getIdToken();
    const params = new URLSearchParams({ page: String(page) });
    if (staff) params.set('staff', staff);
    if (search) params.set('search', search);
    if (callStatus) params.set('callStatus', callStatus);
    if (risk) params.set('risk', risk);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    const res = await fetch(`/api/admin/engagement?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setLogs(json.data?.logs ?? []);
      setStaffGroups(json.data?.staffGroups ?? []);
      setStats(json.data?.stats ?? null);
      setTotal(json.data?.total ?? 0);
    }
    setLoading(false);
  }, [user, staff, search, page, callStatus, risk, dateFrom, dateTo]);

  const exportScopeName = () => {
    const scope = staff ? staff.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'general';
    const range = dateFrom || dateTo ? `${dateFrom || 'start'}_to_${dateTo || 'today'}` : 'all-time';
    return `reachout-log_${scope}_${range}`;
  };

  const deleteLog = async (id: string) => {
    if (!user) return;
    if (!confirm('Delete this engagement log?')) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/engagement/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) load();
  };

  const exportCsv = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const params = new URLSearchParams();
    if (staff) params.set('staff', staff);
    if (search) params.set('search', search);
    if (callStatus) params.set('callStatus', callStatus);
    if (risk) params.set('risk', risk);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    const res = await fetch(`/api/admin/engagement/export?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${exportScopeName()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [user, staff, search, callStatus, risk, dateFrom, dateTo]);

  const exportPdf = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const params = new URLSearchParams();
    if (staff) params.set('staff', staff);
    if (search) params.set('search', search);
    if (callStatus) params.set('callStatus', callStatus);
    if (risk) params.set('risk', risk);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);

    // Pull the filtered dataset (CSV honours every filter incl. isolation).
    const res = await fetch(`/api/admin/engagement/export?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const csvText = await res.text();
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return;
    const parseLine = (line: string): string[] => {
      const cells: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      return cells;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const scopeLabel = staff || 'All Staff (General)';
    const rangeLabel = dateFrom || dateTo ? `${dateFrom || 'start'} to ${dateTo || 'today'}` : 'All time';

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Customer Reachout & Engagement Report', 40, 40);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Scope: ${scopeLabel}   |   Period: ${rangeLabel}   |   Generated: ${new Date().toLocaleString()}`, 40, 58);

    // KPI summary
    const totalCustomers = rows.length;
    const contacted = rows.filter((r) => r[7] === 'Contacted').length;
    const highRisk = rows.filter((r) => r[14] === 'High').length;
    const followUpDue = rows.filter((r) => r[9] && new Date(r[9]) <= new Date()).length;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${totalCustomers}    Contacted: ${contacted}    Follow-ups due: ${followUpDue}    High risk: ${highRisk}`, 40, 80);

    // Call outcome bar chart
    const outcomes = new Map<string, number>();
    rows.forEach((r) => {
      const k = r[7] || 'Never Contacted';
      outcomes.set(k, (outcomes.get(k) ?? 0) + 1);
    });
    const sorted = [...outcomes.entries()].sort((a, b) => b[1] - a[1]);
    const maxN = Math.max(...sorted.map(([, n]) => n), 1);
    let y = 110;
    doc.setFont('helvetica', 'bold');
    doc.text('Call Outcomes', 40, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    const chartX = 170;
    const chartW = 300;
    sorted.forEach(([label, n]) => {
      doc.text(`${label}`, 40, y + 9);
      doc.setFillColor(68, 133, 21);
      doc.rect(chartX, y, Math.max((n / maxN) * chartW, 2), 12, 'F');
      doc.text(String(n), chartX + Math.max((n / maxN) * chartW, 2) + 6, y + 9);
      y += 18;
    });

    // Records table
    autoTable(doc, {
      startY: y + 20,
      head: [headers.slice(0, 10)],
      body: rows.map((r) => r.slice(0, 10)),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [68, 133, 21] },
      alternateRowStyles: { fillColor: [245, 247, 245] },
    });

    doc.save(`${exportScopeName()}.pdf`);
  }, [user, staff, search, callStatus, risk, dateFrom, dateTo, stats]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <AdminLayout>
      <div className="mb-12">
        <h1 className="font-display text-xl md:text-2xl text-primary tracking-tight mb-2 uppercase font-black">
          Customer Reachout &amp; Engagement
        </h1>
        <p className="text-on-surface-variant mt-2 max-w-2xl font-body-md">
          Daily call log for the support team — click a customer to update their call status, follow-up and feedback.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <Button
            className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-4"
            onClick={() => { setQuickLog(false); setShowAddLog(true); }}
          >
            <Plus className="w-3 h-3 mr-1.5" /> New Log
          </Button>
          <Button
            variant="outline"
            className="rounded-full font-mono text-[10px] uppercase font-bold px-4"
            onClick={() => { setQuickLog(true); setShowAddLog(true); }}
          >
            <Zap className="w-3 h-3 mr-1.5" /> Quick Log
            <span className="ml-1.5 text-on-surface-variant/40 text-[8px]">Ctrl+Shift+L</span>
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter mb-8">
          <div className="lg:col-span-4 grid grid-cols-2 gap-gutter">
            <button
              type="button"
              onClick={() => { setCallStatus('Contacted'); setPage(1); }}
              className="text-left bg-white p-6 border border-border whisper-shadow rounded-xl hover:border-secondary/40 transition-colors"
            >
              <Phone className="w-5 h-5 text-secondary mb-3" />
              <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest">Contacted Today</p>
              <h3 className="font-mono text-xl font-black mt-1">{stats.contactedToday}</h3>
            </button>
            <button
              type="button"
              onClick={() => { setRisk(''); setCallStatus(''); setPage(1); }}
              className="text-left bg-white p-6 border border-border whisper-shadow rounded-xl hover:border-secondary/40 transition-colors"
            >
              <CalendarClock className="w-5 h-5 text-secondary mb-3" />
              <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest">Follow-Ups Due</p>
              <h3 className="font-mono text-xl font-black mt-1">{stats.dueFollowUps}</h3>
            </button>
            <button
              type="button"
              onClick={() => { setRisk('High'); setCallStatus(''); setPage(1); }}
              className="text-left bg-white p-6 border border-border whisper-shadow rounded-xl hover:border-red-300 transition-colors"
            >
              <TriangleAlert className={cn('w-5 h-5 mb-3', stats.highRisk > 0 ? 'text-red-500' : 'text-secondary')} />
              <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest">High Risk</p>
              <h3 className="font-mono text-xl font-black mt-1">{stats.highRisk}</h3>
            </button>
            <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
              <Users className="w-5 h-5 text-secondary mb-3" />
              <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest">Total Customers</p>
              <h3 className="font-mono text-xl font-black mt-1">{total}</h3>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white p-6 border border-border whisper-shadow rounded-xl">
            <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest font-bold mb-4">Call Outcomes</p>
            <div className="space-y-3">
              {stats.byCallStatus
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((s) => {
                  const max = Math.max(...stats.byCallStatus.map((x) => x.count), 1);
                  return (
                    <button
                      key={s.label}
                      type="button"
                      className="block w-full text-left group"
                      onClick={() => { setCallStatus(s.label); setPage(1); }}
                    >
                      <div className="flex justify-between mb-1">
                        <span className="font-mono text-[10px] uppercase tracking-wider group-hover:text-secondary transition-colors">{s.label}</span>
                        <span className="font-bold text-xs font-mono">{s.count}</span>
                      </div>
                      <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-secondary rounded-full transition-all duration-700" style={{ width: `${(s.count / max) * 100}%` }} />
                      </div>
                    </button>
                  );
                })}
              {stats.byCallStatus.length === 0 && <p className="font-mono text-[10px] opacity-40">No data</p>}
            </div>
          </div>

          <div className="lg:col-span-4 bg-white p-6 border border-border whisper-shadow rounded-xl">
            <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest font-bold mb-4">Retention Risk</p>
            <div className="space-y-3">
              {(['High', 'Medium', 'Low'] as const).map((riskLevel) => {
                const count = stats.byRisk.find((r) => r.label === riskLevel)?.count ?? 0;
                // Percentage of ALL customers (not just rated) — honest denominator.
                const pct = total ? Math.round((count / total) * 100) : 0;
                const color = riskLevel === 'High' ? 'bg-red-500' : riskLevel === 'Medium' ? 'bg-amber-400' : 'bg-emerald-500';
                return (
                  <button
                    key={riskLevel}
                    type="button"
                    className="block w-full text-left group"
                    onClick={() => { setRisk(riskLevel); setCallStatus(''); setPage(1); }}
                  >
                    <div className="flex justify-between mb-1">
                      <span className="font-mono text-[10px] uppercase tracking-wider group-hover:text-secondary transition-colors">{riskLevel}</span>
                      <span className="font-bold text-xs font-mono">{count} · {pct}% of all</span>
                    </div>
                    <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.max(pct * 4, count > 0 ? 3 : 0)}%` }} />
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                className="w-full pt-2 mt-2 border-t border-border/50 flex justify-between font-mono text-[10px] text-on-surface-variant hover:text-secondary transition-colors"
                onClick={() => { setRisk('unrated'); setCallStatus(''); setPage(1); }}
              >
                <span>Unrated — click to review</span>
                <span>{total - stats.byRisk.reduce((a, r) => a + r.count, 0)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff pills */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          className={cn('rounded-full font-mono text-[10px] uppercase font-bold', !staff && 'bg-secondary text-white border-secondary')}
          onClick={() => { setStaff(''); setPage(1); }}
        >
          <Users className="w-3 h-3 mr-1" /> All ({staffGroups.reduce((a, g) => a + g._count._all, 0)})
        </Button>
        {staffGroups.map((g) => (
          <Button
            key={g.staffName}
            variant="outline"
            size="sm"
            className={cn('rounded-full font-mono text-[10px] uppercase font-bold', staff === g.staffName && 'bg-secondary text-white border-secondary')}
            onClick={() => { setStaff(g.staffName); setPage(1); }}
          >
            {g.staffName} ({g._count._all})
          </Button>
        ))}
      </div>

      {/* Search + filters + date range + export */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input
            placeholder="Search customer..."
            className="pl-9 rounded-full w-full sm:w-56"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          aria-label="Filter by call status"
          className="h-10 rounded-full border border-input bg-background px-4 font-mono text-[10px] uppercase font-bold min-w-0"
          value={callStatus}
          onChange={(e) => { setCallStatus(e.target.value); setPage(1); }}
        >
          <option value="">All Calls</option>
          {CALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          aria-label="Filter by retention risk"
          className="h-10 rounded-full border border-input bg-background px-4 font-mono text-[10px] uppercase font-bold min-w-0"
          value={risk}
          onChange={(e) => { setRisk(e.target.value); setPage(1); }}
        >
          <option value="">All Risks</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
          <option value="unrated">Unrated</option>
        </select>
        <div className="hidden sm:flex items-center gap-1.5">
          <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant whitespace-nowrap">From</label>
          <Input type="date" className="rounded-xl w-36" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant whitespace-nowrap">To</label>
          <Input type="date" className="rounded-xl w-36" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="rounded-full font-mono text-[10px] uppercase font-bold px-2" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
              Clear
            </Button>
          )}
        </div>
        {/* Mobile date row */}
        <div className="flex sm:hidden items-center gap-1.5 w-full">
          <Input type="date" className="rounded-xl flex-1 min-w-0" placeholder="From" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          <span className="font-mono text-[9px] text-on-surface-variant">to</span>
          <Input type="date" className="rounded-xl flex-1 min-w-0" placeholder="To" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="rounded-full font-mono text-[10px] uppercase font-bold px-2" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
              Clear
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" className="rounded-full font-mono text-[10px] uppercase font-bold" onClick={exportCsv}>
          <FileDown className="w-3 h-3 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" className="rounded-full font-mono text-[10px] uppercase font-bold" onClick={exportPdf}>
          <FileDown className="w-3 h-3 mr-1" /> PDF
        </Button>
      </div>

      <div className="bg-white border border-border whisper-shadow rounded-xl overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-container-low text-left">
                {['Customer', 'BTS / Site', 'Status', 'Call', 'Last Contact', 'Follow-Up', 'Risk', 'Feedback', ''].map((h) => (
                  <th key={h} className="px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-on-surface-variant font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="px-4 py-12 text-center font-mono text-xs opacity-40">Loading...</td></tr>
              )}
              {!loading && logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border/50 hover:bg-surface-container-low/50 cursor-pointer"
                  onClick={() => setEditing(log)}
                >
                  <td className="px-4 py-3">
                    <p className="font-bold text-primary">{log.customerName}</p>
                    <p className="font-mono text-[9px] text-on-surface-variant">{log.phone || '—'} · {log.staffName}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px]">{log.btsName || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase',
                      log.accountStatus === 'Active' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500')}>
                      {log.accountStatus || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px]">{log.callStatus || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px]">{log.lastContactAt ? new Date(log.lastContactAt).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 font-mono text-[10px]">{log.nextFollowUpAt ? new Date(log.nextFollowUpAt).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    {log.retentionRisk ? (
                      <span className={cn('px-2 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase',
                        log.retentionRisk === 'High' ? 'bg-red-100 text-red-600' : log.retentionRisk === 'Medium' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600')}>
                        {log.retentionRisk}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    <p className="text-[11px] text-on-surface-variant line-clamp-2">{log.feedback || log.complaint || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(log); }} className="p-1 rounded hover:bg-surface-container-low">
                        <Pencil className="w-3.5 h-3.5 text-on-surface-variant/40 hover:text-secondary" />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); deleteLog(log.id); }} className="p-1 rounded hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5 text-on-surface-variant/30 hover:text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center font-mono text-xs opacity-40">No records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mb-24">
        <p className="font-mono text-[10px] text-on-surface-variant">{total} customers</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="font-mono text-xs px-3 py-1.5">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>

      {editing && (
        <EditLogDialog
          log={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {showAddLog && (
        <AddLogDialog
          open={showAddLog}
          onClose={() => { setShowAddLog(false); setQuickLog(false); }}
          onSaved={() => { setShowAddLog(false); setQuickLog(false); load(); }}
          staffName={user?.displayName || user?.email || 'Unknown'}
          staffGroups={staffGroups}
          quickMode={quickLog}
        />
      )}
    </AdminLayout>
  );
}

interface EditFormState {
  phone: string;
  callStatus: string;
  purpose: string;
  feedback: string;
  complaint: string;
  upsellNote: string;
  retentionRisk: string;
  resolution: string;
  accountStatus: string;
  lastContactAt: string;
  nextFollowUpAt: string;
}

function EditLogDialog({ log, onClose, onSaved }: { log: EngagementLog; onClose: () => void; onSaved: () => void }) {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditFormState>({
    phone: log.phone || '',
    callStatus: log.callStatus || '',
    purpose: log.purpose || '',
    feedback: log.feedback || '',
    complaint: log.complaint || '',
    upsellNote: log.upsellNote || '',
    retentionRisk: log.retentionRisk || '',
    resolution: log.resolution || '',
    accountStatus: log.accountStatus || '',
    lastContactAt: toDateInput(log.lastContactAt),
    nextFollowUpAt: toDateInput(log.nextFollowUpAt),
  });

  const set = (k: keyof EditFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/engagement/${log.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight">{log.customerName}</DialogTitle>
          <DialogDescription className="sr-only">Update the call information for this customer.</DialogDescription>
        </DialogHeader>
        <p className="font-mono text-[9px] text-on-surface-variant uppercase -mt-2">
          {log.btsName || '—'} · {log.plan || '—'} · {log.accountType || '—'} · Agent: {log.staffName}
        </p>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Call Status</label>
              <select className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm" value={form.callStatus} onChange={(e) => set('callStatus', e.target.value)}>
                <option value="">—</option>
                {CALL_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Last Contact</label>
              <Input type="date" className="rounded-xl" value={form.lastContactAt} onChange={(e) => set('lastContactAt', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Next Follow-Up</label>
              <Input type="date" className="rounded-xl" value={form.nextFollowUpAt} onChange={(e) => set('nextFollowUpAt', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Phone</label>
              <Input className="rounded-xl" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Account Status</label>
              <select className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm" value={form.accountStatus} onChange={(e) => set('accountStatus', e.target.value)}>
                <option value="">—</option>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Retention Risk</label>
              <select className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm" value={form.retentionRisk} onChange={(e) => set('retentionRisk', e.target.value)}>
                {RISKS.map((r) => <option key={r || 'none'} value={r}>{r || '—'}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Complaint Raised</label>
              <Input className="rounded-xl" value={form.complaint} maxLength={191} onChange={(e) => set('complaint', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Resolution</label>
              <Input className="rounded-xl" value={form.resolution} maxLength={191} onChange={(e) => set('resolution', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Feedback</label>
            <Textarea className="min-h-[60px] rounded-xl" value={form.feedback} onChange={(e) => set('feedback', e.target.value)} placeholder="Customer feedback from this call..." />
          </div>
          <div className="space-y-1">
            <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Upsell / Cross-sell Opportunity</label>
            <Textarea className="min-h-[60px] rounded-xl" value={form.upsellNote} onChange={(e) => set('upsellNote', e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" className="rounded-full font-mono text-[10px] uppercase font-bold" onClick={onClose}>
            Cancel
          </Button>
          <Button className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8" disabled={saving} onClick={save}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
