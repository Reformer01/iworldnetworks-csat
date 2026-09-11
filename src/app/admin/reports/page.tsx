'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileDown, Users, TrendingUp, Phone, Headset, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function SupportRevenueExportCard() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [purpose, setPurpose] = useState('__all');
  const [agent, setAgent] = useState('__all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const doExport = async (filtered: boolean) => {
    if (!user) return;
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const sp = new URLSearchParams();
      if (filtered) {
        if (from) sp.set('from', from);
        if (to) sp.set('to', to);
        if (purpose !== '__all') sp.set('purpose', purpose);
        if (agent !== '__all') sp.set('agent', agent);
        if (search.trim()) sp.set('search', search.trim());
      }
      const qs = sp.toString();
      const res = await fetch(`/api/admin/reports/support-revenue-export${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `support-revenue_${filtered ? 'filtered' : 'overall'}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-lg text-xs" placeholder="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-lg text-xs" placeholder="To" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={purpose} onValueChange={setPurpose}>
          <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="Purpose" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Purposes</SelectItem>
            <SelectItem value="support">Support</SelectItem>
            <SelectItem value="installation">Installation</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="bts">BTS</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="h-8 rounded-lg text-xs"><SelectValue placeholder="Agent" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Agents</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer search..." className="h-8 rounded-lg text-xs" />
      <div className="flex gap-2">
        <Button onClick={() => doExport(false)} disabled={busy} variant="outline" className="flex-1 h-8 rounded-full text-[10px] uppercase font-bold">
          <Download className="w-3 h-3 mr-1" /> Overall
        </Button>
        <Button onClick={() => doExport(true)} disabled={busy} className="flex-1 h-8 rounded-full bg-secondary text-white text-[10px] uppercase font-bold">
          <Download className="w-3 h-3 mr-1" /> Filtered
        </Button>
      </div>
    </div>
  );
}

interface StaffReport {
  staffName: string;
  revenue: { closed: number; amount: number; referrals: number; revivals: number; upsells: number; crossSells: number };
  reachout: { total: number; contacted: number; neverContacted: number; followUpsDue: number; highRisk: number };
  support: { totalFeedback: number; avgOverall: number; resolvedCount: number; escalatedCount: number };
}

export default function ReportsPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [reports, setReports] = useState<StaffReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const token = await user.getIdToken();
    const params = new URLSearchParams();
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    const res = await fetch(`/api/admin/reports/support-team?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setReports(json.data?.reports ?? []);
    }
    setLoading(false);
  }, [user, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const scopeName = () => {
    const range = dateFrom || dateTo ? `${dateFrom || 'start'}_to_${dateTo || 'present'}` : 'all-time';
    return `support-team-report_${range}`;
  };

  const generatePdf = () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text('I-World Networks — Support Team Report', 40, 45);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${dateFrom || 'Beginning'} → ${dateTo || 'Present'}   |   Generated: ${new Date().toLocaleDateString()}`, 40, 62);
      doc.text(`Staff covered: ${reports.length}`, 40, 76);

      // Collective summary
      const totalRev = reports.reduce((a, r) => a + r.revenue.amount, 0);
      const totalClosed = reports.reduce((a, r) => a + r.revenue.closed, 0);
      const totalReachout = reports.reduce((a, r) => a + r.reachout.total, 0);
      const totalFeedback = reports.reduce((a, r) => a + r.support.totalFeedback, 0);

      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text('Collective Summary', 40, 105);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text([
        `Total Revenue: ₦${totalRev.toLocaleString()}`,
        `Total Sales Closed: ${totalClosed}`,
        `Total Reachout Records: ${totalReachout}`,
        `Total Feedback Received: ${totalFeedback}`,
      ], 40, 120);

      // Revenue table
      autoTable(doc, {
        startY: 165,
        head: [['Staff', 'Sales', 'Amount (₦)', 'Referrals', 'Revivals', 'Upsells', 'Cross-sells']],
        body: reports.map((r) => [r.staffName, r.revenue.closed, `₦${r.revenue.amount.toLocaleString()}`, r.revenue.referrals, r.revenue.revivals, r.revenue.upsells, r.revenue.crossSells]),
        foot: [['TOTAL', totalClosed, `₦${totalRev.toLocaleString()}`, reports.reduce((a,r)=>a+r.revenue.referrals,0), reports.reduce((a,r)=>a+r.revenue.revivals,0), reports.reduce((a,r)=>a+r.revenue.upsells,0), reports.reduce((a,r)=>a+r.revenue.crossSells,0)]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [68, 133, 21] },
        footStyles: { fillColor: [68, 133, 21], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 245] },
        margin: { left: 40, right: 40 },
      });

      // Reachout table
      let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text('Reachout & Engagement', 40, y);
      autoTable(doc, {
        startY: y + 10,
        head: [['Staff', 'Records', 'Contacted', 'Never Contacted', 'Follow-ups Due', 'High Risk']],
        body: reports.map((r) => [r.staffName, r.reachout.total, r.reachout.contacted, r.reachout.neverContacted, r.reachout.followUpsDue, r.reachout.highRisk]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [68, 133, 21] },
        alternateRowStyles: { fillColor: [245, 247, 245] },
        margin: { left: 40, right: 40 },
      });

      // Support feedback table
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text('Customer Support Feedback', 40, y);
      autoTable(doc, {
        startY: y + 10,
        head: [['Staff', 'Feedback Count', 'Avg Rating', 'Resolved', 'Escalated']],
        body: reports.map((r) => [r.staffName, r.support.totalFeedback, r.support.avgOverall || '—', r.support.resolvedCount, r.support.escalatedCount]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [68, 133, 21] },
        alternateRowStyles: { fillColor: [245, 247, 245] },
        margin: { left: 40, right: 40 },
      });

      // Individual staff pages
      for (const r of reports) {
        doc.addPage();
        doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text(r.staffName, 40, 50);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');

        autoTable(doc, {
          startY: 65,
          head: [['Metric', 'Revenue', 'Reachout', 'Support']],
          body: [
            ['Volume', `${r.revenue.closed} sales`, `${r.reachout.total} records`, `${r.support.totalFeedback} feedbacks`],
            ['Key Figure', `₦${r.revenue.amount.toLocaleString()}`, `${r.reachout.contacted} contacted`, `Avg ${r.support.avgOverall || '—'}/5`],
            ['Referrals/Revivals', `${r.revenue.referrals} ref, ${r.revenue.revivals} rev`, `${r.reachout.followUpsDue} due`, `${r.support.resolvedCount} resolved`],
            ['Quality', `${r.revenue.upsells} up, ${r.revenue.crossSells} cross`, `${r.reachout.highRisk} high risk`, `${r.support.escalatedCount} escalated`],
          ],
          styles: { fontSize: 8 },
          headStyles: { fillColor: [68, 133, 21] },
          alternateRowStyles: { fillColor: [245, 247, 245] },
          margin: { left: 40, right: 40 },
        });
      }

      doc.save(`${scopeName()}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-xl md:text-2xl font-display font-bold text-primary uppercase tracking-tight">Team Reports</h1>
        <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold mt-1">
          Generate comprehensive PDF reports covering revenue, reachout &amp; customer support
        </p>
      </div>

      {/* Monthly pack workbooks + Support Revenue Export */}
      <div className="flex flex-wrap gap-3 mb-8">
        <a href="/admin/reports/monthly-pack" className="flex-1 min-w-[240px] bg-white border border-border whisper-shadow rounded-xl p-4 hover:border-secondary transition">
          <p className="font-display text-sm font-bold text-primary uppercase">Monthly Pack — 03_Customer_Experience</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">
            KPI workbook preview · snapshot · CSV / PDF export
          </p>
        </a>
        <a href="/admin/reports/risk-register" className="flex-1 min-w-[240px] bg-white border border-border whisper-shadow rounded-xl p-4 hover:border-secondary transition">
          <p className="font-display text-sm font-bold text-primary uppercase">Customer Risk Register</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">
            At-risk customers by MRR · actions · owners
          </p>
        </a>
        <div className="flex-1 min-w-[240px] bg-white border border-border whisper-shadow rounded-xl p-4">
          <p className="font-display text-sm font-bold text-primary uppercase">Support Revenue Export</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant font-bold mt-1">
            Customers + BTS/MRR + Purpose + Agent — overall & filtered
          </p>
          <SupportRevenueExportCard />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-8">
        <div>
          <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant block mb-1">From</label>
          <Input type="date" className="rounded-xl w-44" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant block mb-1">To</label>
          <Input type="date" className="rounded-xl w-44" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="rounded-full font-mono text-[10px] uppercase font-bold mt-5" onClick={() => { setDateFrom(''); setDateTo(''); }}>
            Clear
          </Button>
        )}
        <Button
          className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 ml-auto"
          onClick={generatePdf}
          disabled={generating || loading}
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <FileDown className="w-3 h-3 mr-2" />}
          Generate PDF Report
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
      ) : (
        <div className="space-y-6">
          {/* Revenue table */}
          <section className="bg-white border border-border whisper-shadow rounded-xl p-5">
            <h2 className="font-display text-base font-bold text-primary uppercase mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-secondary" /> Revenue</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border font-mono text-[9px] uppercase text-on-surface-variant font-bold text-left"><th className="py-2 px-2">Staff</th><th className="py-2 px-2 text-right">Closed</th><th className="py-2 px-2 text-right">Amount</th><th className="py-2 px-2 text-right">Referrals</th><th className="py-2 px-2 text-right">Revivals</th></tr></thead>
              <tbody>{reports.map((r) => (<tr key={r.staffName} className="border-b border-border/30"><td className="py-2 px-2 font-bold">{r.staffName}</td><td className="py-2 px-2 text-right font-mono">{r.revenue.closed}</td><td className="py-2 px-2 text-right font-mono font-bold">₦{r.revenue.amount.toLocaleString()}</td><td className="py-2 px-2 text-right font-mono">{r.revenue.referrals}</td><td className="py-2 px-2 text-right font-mono">{r.revenue.revivals}</td></tr>))}</tbody>
            </table>
          </section>

          {/* Reachout table */}
          <section className="bg-white border border-border whisper-shadow rounded-xl p-5">
            <h2 className="font-display text-base font-bold text-primary uppercase mb-3 flex items-center gap-2"><Phone className="w-4 h-4 text-secondary" /> Reachout &amp; Engagement</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border font-mono text-[9px] uppercase text-on-surface-variant font-bold text-left"><th className="py-2 px-2">Staff</th><th className="py-2 px-2 text-right">Records</th><th className="py-2 px-2 text-right">Contacted</th><th className="py-2 px-2 text-right">Never Contacted</th><th className="py-2 px-2 text-right">High Risk</th></tr></thead>
              <tbody>{reports.map((r) => (<tr key={r.staffName} className="border-b border-border/30"><td className="py-2 px-2 font-bold">{r.staffName}</td><td className="py-2 px-2 text-right font-mono">{r.reachout.total}</td><td className="py-2 px-2 text-right font-mono">{r.reachout.contacted}</td><td className="py-2 px-2 text-right font-mono">{r.reachout.neverContacted}</td><td className="py-2 px-2 text-right font-mono">{r.reachout.highRisk}</td></tr>))}</tbody>
            </table>
          </section>

          {/* Support feedback table */}
          <section className="bg-white border border-border whisper-shadow rounded-xl p-5 mb-24">
            <h2 className="font-display text-base font-bold text-primary uppercase mb-3 flex items-center gap-2"><Headset className="w-4 h-4 text-secondary" /> Customer Support Feedback</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border font-mono text-[9px] uppercase text-on-surface-variant font-bold text-left"><th className="py-2 px-2">Staff</th><th className="py-2 px-2 text-right">Feedbacks</th><th className="py-2 px-2 text-right">Avg Rating</th><th className="py-2 px-2 text-right">Resolved</th><th className="py-2 px-2 text-right">Escalated</th></tr></thead>
              <tbody>{reports.map((r) => (<tr key={r.staffName} className="border-b border-border/30"><td className="py-2 px-2 font-bold">{r.staffName}</td><td className="py-2 px-2 text-right font-mono">{r.support.totalFeedback}</td><td className="py-2 px-2 text-right font-mono">{r.support.avgOverall || '—'}</td><td className="py-2 px-2 text-right font-mono">{r.support.resolvedCount}</td><td className="py-2 px-2 text-right font-mono">{r.support.escalatedCount}</td></tr>))}</tbody>
            </table>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
