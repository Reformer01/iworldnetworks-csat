'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth, useUser } from '@/firebase';
import { isSuperAdmin } from '@/lib/admin-config';
import { SavedViewBar } from '@/components/finance/paystack/SavedViewBar';
import { ExportButtons } from '@/components/finance/paystack/ExportButtons';
import {
  buildCustomersPdfTables,
  buildOverviewPdfTables,
  buildReconciliationPdfTables,
  buildSnapshotPdfTables,
  type ReportCustomerRow,
} from '@/lib/finance/paystack-report';

interface SnapshotItem {
  id: string;
  month: string;
  totals: {
    collectedNaira: number;
    successCount: number;
    successRate: number;
    unmatchedNaira: number;
    refundedNaira: number;
    disputeCount: number;
  };
  channels?: { channel: string; collectedNaira: number; count: number }[] | null;
  savedBy?: string | null;
}

const CSV_SCOPES = ['transactions', 'reconciliation', 'exceptions', 'customers', 'snapshot'];

export default function PaystackReportsPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [activeSnapshot, setActiveSnapshot] = useState<SnapshotItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freezing, setFreezing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = isSuperAdmin((user?.email || '').toLowerCase());
  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const filters = useMemo(() => ({ month }), [month]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDenied(false);
      try {
        const token = await user!.getIdToken();
        const res = await fetch('/api/admin/finance/paystack/snapshots', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setDenied(true);
          return;
        }
        const json = await res.json();
        if (!json.success) {
          if (!cancelled) setError(json.error || 'Failed to load snapshots');
          return;
        }
        if (!cancelled) setSnapshots(json.data.items as SnapshotItem[]);
      } catch {
        if (!cancelled) setError('Failed to load snapshots');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function viewSnapshot(value: string) {
    if (!user || !value) {
      setActiveSnapshot(null);
      return;
    }
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/finance/paystack/snapshots?month=${encodeURIComponent(value)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Snapshot not found');
      setActiveSnapshot(json.data.item as SnapshotItem);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Failed to load snapshot');
    }
  }

  async function freezeSnapshot() {
    if (!user) return;
    setFreezing(true);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/finance/paystack/snapshots', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Snapshot freeze failed');
      const item = json.data as SnapshotItem;
      setSnapshots((s) => [item, ...s.filter((x) => x.month !== item.month)]);
      setActiveSnapshot(item);
      setNotice(`Snapshot frozen for ${month}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Snapshot freeze failed');
    } finally {
      setFreezing(false);
    }
  }

  async function generatePdf() {
    if (!user) return;
    setGenerating(true);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [overviewRes, reconRes, customersRes] = await Promise.all([
        fetch(`/api/admin/finance/paystack/overview?month=${encodeURIComponent(month)}`, { headers }),
        fetch('/api/admin/finance/paystack/reports?format=json&scope=reconciliation', { headers }),
        fetch(`/api/admin/finance/paystack/reports?format=json&scope=customers&month=${encodeURIComponent(month)}`, { headers }),
      ]);
      const overviewJson = await overviewRes.json();
      if (!overviewJson.success) throw new Error(overviewJson.error || 'Overview unavailable');
      const overview = overviewJson.data as {
        month: string;
        kpis: SnapshotItem['totals'];
        channels: { channel: string; collectedNaira: number; count: number }[];
      };
      const reconJson = await reconRes.json();
      const reconItems = (reconJson.success ? (reconJson.data.items as { status: string }[]) : []) || [];
      const reconCounts: Record<string, number> = {};
      for (const item of reconItems) {
        const key = String(item.status || 'unknown').toLowerCase();
        reconCounts[key] = (reconCounts[key] ?? 0) + 1;
      }
      const customersJson = await customersRes.json();
      const customerRows = (customersJson.success ? (customersJson.data.items as ReportCustomerRow[]) : []) || [];

      const tables = [
        ...buildOverviewPdfTables({ month: overview.month, totals: overview.kpis, channels: overview.channels }),
        ...buildReconciliationPdfTables(reconCounts),
        ...buildCustomersPdfTables(customerRows.slice(0, 50)),
      ];
      if (activeSnapshot) tables.push(...buildSnapshotPdfTables(activeSnapshot));

      const { default: JsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new JsPDF();
      doc.setFontSize(14);
      doc.text(`Paystack management report — ${month}`, 14, 16);
      let y = 24;
      for (const table of tables) {
        doc.setFontSize(11);
        doc.text(table.title, 14, y);
        autoTable(doc, { startY: y + 4, head: [table.head], body: table.body, styles: { fontSize: 8 } });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
        if (y > 260) {
          doc.addPage();
          y = 16;
        }
      }
      doc.save(`paystack-management-report-${month}.pdf`);
      setNotice('Management PDF downloaded');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'PDF generation failed');
    } finally {
      setGenerating(false);
    }
  }

  function applySaved(saved: Record<string, unknown>) {
    if (typeof saved.month === 'string' && saved.month) {
      setMonth(saved.month);
      void viewSnapshot(saved.month);
    }
  }

  if (loading && snapshots.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="Loading reports">
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
          <h1 className="font-display text-2xl font-black uppercase tracking-tight md:text-3xl">Reports</h1>
          <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest opacity-60">
            CSV downloads, management PDF, and monthly snapshots
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          aria-label="Report month"
          className="rounded-full border border-border bg-white px-4 py-2 font-mono text-xs"
        />
      </header>

      {error && <p className="mb-3 font-mono text-xs font-bold text-red-600">{error}</p>}
      {notice && <p className="mb-3 font-mono text-[11px] text-emerald-700">{notice}</p>}

      <SavedViewBar scope="reports" currentFilters={filters} getToken={getToken} canManage={canManage} onApply={applySaved} />

      <section className="mt-3 rounded-2xl border border-border bg-white p-4 whisper-shadow" aria-label="Downloads">
        <h2 className="font-display text-sm font-black uppercase tracking-tight">Downloads</h2>
        <div className="mt-2">
          <ExportButtons
            items={CSV_SCOPES.map((scope) => ({ scope, label: `${scope} CSV`, month }))}
            getToken={getToken}
            onGeneratePdf={() => void generatePdf()}
            pdfLabel={generating ? 'Generating…' : 'Management PDF'}
            pdfDisabled={generating}
          />
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-border bg-white p-4 whisper-shadow" aria-label="Monthly snapshots">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-black uppercase tracking-tight">Monthly snapshots</h2>
          {canManage && (
            <button
              onClick={() => void freezeSnapshot()}
              disabled={freezing}
              className="rounded-full bg-secondary px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
            >
              {freezing ? 'Freezing…' : `Freeze ${month}`}
            </button>
          )}
        </div>
        {snapshots.length === 0 ? (
          <p className="mt-2 font-mono text-[11px] opacity-60">No snapshots frozen yet</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {snapshots.map((snap) => (
              <button
                key={snap.month}
                onClick={() => void viewSnapshot(snap.month)}
                className="rounded-full border border-border bg-white px-3 py-1 font-mono text-[11px] hover:bg-gray-50"
              >
                {snap.month}
              </button>
            ))}
          </div>
        )}
        {activeSnapshot && (
          <div className="mt-3 rounded-xl border border-border bg-gray-50 p-3">
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest opacity-60">
              Snapshot {activeSnapshot.month}
              {activeSnapshot.savedBy ? ` · frozen by ${activeSnapshot.savedBy}` : ''}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
              {(
                [
                  ['Collected', `₦${activeSnapshot.totals.collectedNaira.toLocaleString('en-NG')}`],
                  ['Successful', String(activeSnapshot.totals.successCount)],
                  ['Success rate', `${activeSnapshot.totals.successRate}%`],
                  ['Unmatched', `₦${activeSnapshot.totals.unmatchedNaira.toLocaleString('en-NG')}`],
                  ['Refunded', `₦${activeSnapshot.totals.refundedNaira.toLocaleString('en-NG')}`],
                  ['Disputes', String(activeSnapshot.totals.disputeCount)],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-white p-2">
                  <dt className="font-mono text-[9px] font-bold uppercase tracking-widest opacity-60">{label}</dt>
                  <dd className="font-mono text-sm font-bold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>
    </div>
  );
}
