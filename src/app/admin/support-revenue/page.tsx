'use client';

import React, { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth, useUser } from '@/firebase';
import {
  useSupportRevenue,
  createSupportRevenue,
  updateSupportRevenue,
  deleteSupportRevenue,
  type SupportRevenueDoc,
} from '@/hooks/use-support-revenue';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Search, Trash2, Edit3, Receipt, Package, TrendingUp, Users, RotateCcw, ArrowRight, FileDown } from 'lucide-react';
import { locations } from '@/lib/sales-staff';
import { salesAgents } from '@/lib/sales-staff';
import { supportStaff } from '@/lib/staff';
import { isSuperAdmin } from '@/lib/admin-config';
import { SUPPORT_SALE_TYPES } from '@/lib/support-revenue-types';

const SALE_TYPES = SUPPORT_SALE_TYPES;
const SALE_KINDS = ['New', 'Upsell', 'Cross-sell'] as const;

interface EquipmentItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

function emptyForm() {
  return {
    customerName: '',
    location: '',
    projectType: 'ROUTER SALES',
    saleKind: 'New',
    assignedSalesRep: '',
    bandwidthFrom: '',
    bandwidthTo: '',
    items: [] as EquipmentItem[],
    totalAmount: 0,
    date: '',
    agentName: '',
    notes: '',
  };
}

interface StaffPerf {
  agent: string;
  closed: number;
  amount: number;
  upsells: number;
  crossSells: number;
  referrals: number;
  revivals: number;
  byType: Record<string, number>;
}

export default function SupportRevenue() {
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterMonth, setFilterMonth] = useState('__all');
  const [filterAgent, setFilterAgent] = useState('__all');
  const { records, loading, mutate } = useSupportRevenue({ projectType: filterProject || undefined });
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (filtered: boolean) => {
    if (!user) return;
    setExporting(true);
    try {
      const token = await user.getIdToken();
      const sp = new URLSearchParams();
      if (filtered) {
        if (search.trim()) sp.set('search', search.trim());
        if (filterProject) sp.set('purpose', filterProject);
        if (filterAgent !== '__all') sp.set('agent', filterAgent);
        if (filterMonth !== '__all') {
          const [y, m] = filterMonth.split('-').map(Number);
          const from = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
          const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
          sp.set('from', from);
          sp.set('to', to);
        }
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
      toast({ title: 'Export ready', description: `CSV downloaded (${filtered ? 'filtered' : 'overall'}).` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Export failed', description: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setExporting(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditId(null);
  };

  // Staff performance — computed over ALL records (not search-filtered).
  const perf = useMemo<StaffPerf[]>(() => {
    const map = new Map<string, StaffPerf>();
    for (const r of records) {
      const agent = (r.agentName || '').trim();
      if (!agent) continue;
      let p = map.get(agent);
      if (!p) {
        p = { agent, closed: 0, amount: 0, upsells: 0, crossSells: 0, referrals: 0, revivals: 0, byType: {} };
        map.set(agent, p);
      }
      p.closed += 1;
      p.amount += r.totalAmount || 0;
      if (r.saleKind === 'Upsell') p.upsells += 1;
      if (r.saleKind === 'Cross-sell') p.crossSells += 1;
      if (r.projectType === 'REFERRALS') p.referrals += 1;
      if (r.projectType === 'REVIVED CUSTOMER') p.revivals += 1;
      const t = r.projectType || 'Other';
      p.byType[t] = (p.byType[t] ?? 0) + 1;
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [records]);

  const totals = useMemo(
    () => ({
      revenue: records.reduce((a, r) => a + (r.totalAmount || 0), 0),
      closed: records.length,
      upsells: records.filter((r) => r.saleKind === 'Upsell').length,
      crossSells: records.filter((r) => r.saleKind === 'Cross-sell').length,
      referrals: records.filter((r) => r.projectType === 'REFERRALS').length,
      revivals: records.filter((r) => r.projectType === 'REVIVED CUSTOMER').length,
    }),
    [records],
  );

  // Business date is truth — prefer editable date over immutable createdAt
  const effectiveMonth = (r: { date?: string; createdAt?: number }): string | null => {
    if (r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date)) return r.date.slice(0, 7);
    const ts = r.createdAt ? Number(r.createdAt) : null;
    if (!ts || !Number.isFinite(ts)) return null;
    const d = new Date(ts);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      const m = effectiveMonth(r);
      if (m) set.add(m);
    }
    return Array.from(set).sort().reverse();
  }, [records]);

  const availableAgents = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      const name = (r.agentName || r.assignedSalesRep || '').trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort();
  }, [records]);

  const filtered = records.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (![r.customerName, r.location, r.projectType, r.agentName, r.notes, r.assignedSalesRep].some((f) => f?.toLowerCase().includes(q))) return false;
    }
    if (filterAgent !== '__all' && (r.agentName || '').trim() !== filterAgent && (r.assignedSalesRep || '').trim() !== filterAgent) return false;
    if (filterMonth !== '__all' && effectiveMonth(r) !== filterMonth) return false;
    return true;
  });

  const computedTotal = form.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const openEdit = (r: SupportRevenueDoc) => {
    if (!r.id) return;
    setEditId(r.id);
    setForm({
      customerName: r.customerName || '',
      location: r.location || '',
      projectType: r.projectType || 'ROUTER SALES',
      saleKind: r.saleKind || 'New',
      assignedSalesRep: r.assignedSalesRep || '',
      bandwidthFrom: r.bandwidthFrom || '',
      bandwidthTo: r.bandwidthTo || '',
      items: r.items || [],
      totalAmount: r.totalAmount || 0,
      date: r.date || '',
      agentName: r.agentName || '',
      notes: r.notes || '',
    });
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = { ...form, totalAmount: computedTotal || form.totalAmount };
      if (editId) {
        await updateSupportRevenue(editId, payload, user);
        toast({ title: 'Updated', description: 'Revenue record updated.' });
      } else {
        await createSupportRevenue(payload, user);
        toast({ title: 'Created', description: 'Revenue record added.' });
      }
      setIsOpen(false);
      resetForm();
      mutate();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id?: string) => {
    if (!user || !id) return;
    if (!confirm('Delete this record?')) return;
    try {
      await deleteSupportRevenue(id, user);
      toast({ title: 'Deleted', description: 'Record removed.' });
      mutate();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete' });
    }
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { name: '', quantity: 1, unitPrice: 0 }] });
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const items = form.items.map((item, i) => (i === index ? { ...item, [field]: value } : item));
    setForm({ ...form, items });
  };

  const removeItem = (index: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  return (
    <AdminLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-display font-bold text-primary uppercase tracking-tight break-words">Support Revenue</h1>
          <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold mt-1 break-words">
            Sales closed by the support team — radio, SIP, relocation, routers, upgrades &amp; referrals
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="outline"
            className="rounded-full font-mono text-[10px] uppercase font-bold"
            onClick={() => handleExport(false)}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <FileDown className="w-3 h-3 mr-2" />} Export Overall
          </Button>
          <Button
            variant="outline"
            className="rounded-full font-mono text-[10px] uppercase font-bold"
            onClick={() => handleExport(true)}
            disabled={exporting}
          >
            <FileDown className="w-3 h-3 mr-2" /> Export Filtered
          </Button>
          <Dialog
            open={isOpen}
            onOpenChange={(v) => {
              if (!v) resetForm();
              setIsOpen(v);
            }}
          >
            <DialogTrigger asChild>
              <Button className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 shadow-lg hover:scale-105 transition-transform">
                <Plus className="w-3 h-3 mr-2" /> Add Record
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl rounded-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display uppercase tracking-tight">{editId ? 'Edit' : 'Add'} Revenue Record</DialogTitle>
              <DialogDescription className="sr-only">
                {editId ? 'Edit an existing revenue record.' : 'Add a new support revenue record.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Customer Name</label>
                <Input
                  className="rounded-xl mt-1"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Location</label>
                <Select value={form.location} onValueChange={(v) => setForm({ ...form, location: v })}>
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.name} value={l.name}>
                        {l.name} ({l.region})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Sale Type</label>
                <Select value={form.projectType} onValueChange={(v) => setForm({ ...form, projectType: v })}>
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SALE_TYPES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Sale Kind</label>
                <Select value={form.saleKind} onValueChange={(v) => setForm({ ...form, saleKind: v })}>
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SALE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.projectType === 'BANDWIDTH UPGRADE' && (
                <>
                  <div>
                    <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">From Bandwidth</label>
                    <Input
                      className="rounded-xl mt-1"
                      placeholder="e.g. 10Mbps"
                      value={form.bandwidthFrom}
                      onChange={(e) => setForm({ ...form, bandwidthFrom: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">To Bandwidth</label>
                    <Input
                      className="rounded-xl mt-1"
                      placeholder="e.g. 20Mbps"
                      value={form.bandwidthTo}
                      onChange={(e) => setForm({ ...form, bandwidthTo: e.target.value })}
                    />
                  </div>
                </>
              )}
              {(form.projectType === 'REFERRALS' || form.projectType === 'REVIVED CUSTOMER') && (
                <div className="col-span-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Assigned Sales Rep</label>
                  <Select value={form.assignedSalesRep} onValueChange={(v) => setForm({ ...form, assignedSalesRep: v })}>
                    <SelectTrigger className="rounded-xl mt-1">
                      <SelectValue placeholder="Select sales rep" />
                    </SelectTrigger>
                    <SelectContent>
                      {salesAgents.map((a) => (
                        <SelectItem key={a.name} value={a.name}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Closed By (Frontend Support)</label>
                <Select value={form.agentName} onValueChange={(v) => setForm({ ...form, agentName: v })}>
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {supportStaff.map((s) => (
                      <SelectItem key={s.id} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Date</label>
                <Input
                  className="rounded-xl mt-1"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Items</label>
                <div className="space-y-3 mt-2">
                  {form.items.map((item, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="flex-1">
                        <Input
                          className="rounded-xl"
                          placeholder="Item name"
                          value={item.name}
                          onChange={(e) => updateItem(i, 'name', e.target.value)}
                        />
                      </div>
                      <div className="w-20">
                        <Input
                          className="rounded-xl"
                          type="number"
                          placeholder="Qty"
                          min={1}
                          value={item.quantity || ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div className="w-28">
                        <Input
                          className="rounded-xl"
                          type="number"
                          placeholder="Unit price"
                          min={0}
                          value={item.unitPrice || ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateItem(i, 'unitPrice', e.target.value === '' ? 0 : Number(e.target.value))}
                        />
                      </div>
                      <div className="w-20 flex items-center justify-end font-mono text-sm font-bold pt-2">
                        ₦{(item.quantity * item.unitPrice).toLocaleString()}
                      </div>
                      <button onClick={() => removeItem(i)} className="pt-2 text-destructive hover:text-destructive/80">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <Button variant="outline" className="rounded-full font-mono text-[10px] uppercase font-bold" onClick={addItem}>
                    <Package className="w-3 h-3 mr-2" /> Add Item
                  </Button>
                </div>
              </div>
              <div className="col-span-2 text-right font-mono text-sm font-bold pt-2">
                Total: ₦{(computedTotal || form.totalAmount).toLocaleString()}
              </div>
              <div className="col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Notes</label>
                <Textarea
                  className="rounded-xl mt-1 min-h-[80px]"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="rounded-full font-mono text-[10px] uppercase font-bold"
                onClick={() => {
                  setIsOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8"
                onClick={handleSave}
                disabled={saving}
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                {editId ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
            </DialogContent>
        </Dialog>
        </div>
      </header>

      {/* Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-gutter mb-8">
        {[
          { label: 'Total Revenue', val: `₦${Math.round(totals.revenue).toLocaleString()}`, icon: TrendingUp },
          { label: 'Sales Closed', val: totals.closed, icon: Receipt },
          { label: 'Referrals', val: totals.referrals, icon: Users },
          { label: 'Revived Customers', val: totals.revivals, icon: RotateCcw },
          { label: 'Upsells', val: totals.upsells, icon: TrendingUp },
          { label: 'Cross-sells', val: totals.crossSells, icon: Users },
        ].map((c) => (
          <div key={c.label} className="bg-white p-4 md:p-5 border border-border whisper-shadow rounded-xl min-w-0">
            <c.icon className="w-5 h-5 text-secondary mb-3" />
            <p className="font-mono text-[9px] text-on-surface-variant uppercase tracking-widest truncate">{c.label}</p>
            <h3 className="font-mono text-xl xl:text-2xl font-black mt-1 break-words" title={typeof c.val === 'number' ? String(c.val) : c.val}>{typeof c.val === 'number' ? c.val : c.val}</h3>
          </div>
        ))}
      </div>

      {/* Staff performance */}
      <section className="bg-white border border-border whisper-shadow rounded-xl p-6 mb-8">
        <h2 className="font-display text-lg font-bold text-primary uppercase mb-4">Staff Performance — Sales Closed</h2>
        {perf.length === 0 ? (
          <p className="font-mono text-xs opacity-40 py-4 text-center">No sales recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[9px] uppercase tracking-widest text-on-surface-variant font-bold text-left">
                  <th className="py-2 px-3">Staff</th>
                  <th className="py-2 px-3 text-right">Closed</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3 text-right">Referrals</th>
                  <th className="py-2 px-3 text-right">Revivals</th>
                  <th className="py-2 px-3 text-right">Upsells</th>
                  <th className="py-2 px-3 text-right">Cross-sells</th>
                  <th className="py-2 px-3">Sales Mix</th>
                </tr>
              </thead>
              <tbody>
                {perf.map((p) => (
                  <tr key={p.agent} className="border-b border-border/40 last:border-0">
                    <td className="py-2.5 px-3 font-bold text-primary">{p.agent}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-secondary">{p.closed}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">₦{Math.round(p.amount).toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{p.referrals}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{p.revivals}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{p.upsells}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{p.crossSells}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(p.byType)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 3)
                          .map(([t, n]) => (
                            <span key={t} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-mono font-bold">
                              {t} ×{n}
                            </span>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <Input
            className="rounded-xl pl-10"
            placeholder="Search customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterProject} onValueChange={(v) => setFilterProject(v === 'All' ? '' : v)}>
          <SelectTrigger className="w-[150px] sm:w-[190px] max-w-full rounded-xl font-mono text-[10px] uppercase font-bold">
            <SelectValue placeholder="Sale Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Types</SelectItem>
            {SALE_TYPES.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-[130px] sm:w-[160px] max-w-full rounded-xl font-mono text-[10px] uppercase font-bold">
            <SelectValue placeholder="All Months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Months</SelectItem>
            {availableMonths.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-[140px] sm:w-[180px] max-w-full rounded-xl font-mono text-[10px] uppercase font-bold">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Agents</SelectItem>
            {availableAgents.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-2xl whisper-shadow border border-border overflow-hidden mb-24">
        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-secondary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left border-collapse">
              <thead>
                <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest bg-surface-container-low whitespace-nowrap">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Sale Type</th>
                  <th className="py-3 px-4">Kind</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Closed By</th>
                  <th className="py-3 px-4">Sales Rep</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-body text-sm">
                {filtered.map((r: SupportRevenueDoc) => (
                  <tr key={r.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="py-3 px-4 font-bold text-primary whitespace-nowrap">{r.customerName}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.location}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-50 text-emerald-600">
                        {r.projectType}
                      </span>
                      {r.projectType === 'BANDWIDTH UPGRADE' && r.bandwidthFrom && (
                        <span className="ml-1 font-mono text-[9px] text-on-surface-variant">
                          {r.bandwidthFrom} <ArrowRight className="w-3 h-3 inline" /> {r.bandwidthTo}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.saleKind || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">₦{Math.round(r.totalAmount || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.agentName || '—'}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.assignedSalesRep || '—'}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.date}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user && r.id && isSuperAdmin(user.email || '') && (
                          <>
                            <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                              <Edit3 className="w-3.5 h-3.5 text-on-surface-variant" />
                            </button>
                            <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-16 text-center border-t border-border/40">
                <Receipt className="w-8 h-8 mx-auto mb-3 text-on-surface-variant opacity-30" />
                <p className="font-mono text-sm text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">
                  {search || filterProject ? 'No Records Match Your Search' : 'No Support Revenue Records'}
                </p>
                {!search && !filterProject && (
                  <Button
                    className="mt-4 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 shadow-lg hover:scale-105 transition-transform"
                    onClick={() => setIsOpen(true)}
                  >
                    <Plus className="w-3 h-3 mr-2" /> Add Your First Record
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
