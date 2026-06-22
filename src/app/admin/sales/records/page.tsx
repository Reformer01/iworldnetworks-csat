'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useSalesRecords, createSalesRecord, updateSalesRecord, deleteSalesRecord, type SalesRecordDoc } from '@/hooks/use-sales-data';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Search, Trash2, Edit3, Database, ChevronLeft, ChevronRight } from 'lucide-react';
import { salesAgents, planCodes, locations, getPlanMrc } from '@/lib/sales-staff';
import { isSuperAdmin } from '@/lib/admin-config';
import type { SaleQuarter, PackageType, AccountStatus } from '@/lib/sales-types';

const accountStatuses = ['Active', 'Inactive', 'Blocked', 'Refunded', 'Retrieved'];
const packageTypes = ['Outright', 'Lease'];
const regions = ['Ogun', 'Oyo', 'Osun', 'Ondo'];
const meansOfSaleOptions = ['Direct', 'Referral', 'Walk-In', 'Field Visit', 'Online', 'Partner'];

function emptyRecord() {
  return {
    serialNumber: 0,
    customerName: '',
    location: '',
    nrc: 0,
    mrc: 0,
    totalPaid: 0,
    planCode: 'H-Lite',
    saleDate: '',
    quarter: 'QUARTER 1' as SaleQuarter,
    month: 'June',
    packageType: 'Outright' as PackageType,
    salesAgent: '',
    meansOfSale: '',
    accountStatus: 'Active' as AccountStatus,
    statusNotes: '',
    importBatchId: '',
  };
}

export default function SalesRecords() {
  const [search, setSearch] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const { records, loading, mutate } = useSalesRecords({
    search: search || undefined,
    region: filterRegion && filterRegion !== 'All' ? filterRegion : undefined,
    status: filterStatus && filterStatus !== 'All' ? filterStatus : undefined,
  });
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyRecord());
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const resetForm = () => { setForm(emptyRecord()); setEditId(null); };
  const paginatedRecords = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));

  useEffect(() => { setPage(0); }, [search, filterRegion, filterStatus]);

  useEffect(() => {
    const planMrc = getPlanMrc(form.planCode);
    setForm(prev => {
      const mrc = planMrc !== null ? planMrc : prev.mrc;
      const nrc = Math.max(0, form.totalPaid - mrc);
      return { ...prev, mrc, nrc };
    });
  }, [form.planCode, form.totalPaid]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (editId) {
        await updateSalesRecord(editId, form, user);
        toast({ title: "Updated", description: "Sales record updated." });
      } else {
        await createSalesRecord(form, user);
        toast({ title: "Created", description: "New sales record added." });
      }
      setIsOpen(false);
      resetForm();
      mutate();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      const detailed = msg === 'Validation failed.' ? 'Please check all required fields (name, location, plan, agent).' : msg;
      toast({ variant: "destructive", title: "Error", description: detailed });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm('Delete this record?')) return;
    try {
      await deleteSalesRecord(id, user);
      toast({ title: "Deleted", description: "Record removed." });
      mutate();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Error", description: e instanceof Error ? e.message : 'Failed to delete' });
    }
  };

  const openEdit = (r: SalesRecordDoc) => {
    setEditId(r.id);
    const nrcVal = r.nrc || 0;
    const mrcVal = r.mrc || 0;
    setForm({
      serialNumber: r.serialNumber || 0,
      customerName: r.customerName || '',
      location: r.location || '',
      nrc: nrcVal,
      mrc: mrcVal,
      totalPaid: nrcVal + mrcVal,
      planCode: r.planCode || '',
      saleDate: r.saleDate || '',
      quarter: (r.quarter || 'QUARTER 1') as SaleQuarter,
      month: r.month || '',
      packageType: (r.packageType || 'Outright') as PackageType,
      salesAgent: r.salesAgent || '',
      meansOfSale: r.meansOfSale || '',
      accountStatus: (r.accountStatus || 'Active') as AccountStatus,
      statusNotes: r.statusNotes || '',
      importBatchId: r.importBatchId || '',
    });
    setIsOpen(true);
  };

  return (
    <SalesLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary uppercase tracking-tight">Sales Records</h1>
          <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold mt-1">{records.length} records</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(v) => { if (!v) resetForm(); setIsOpen(v); }}>
          <DialogTrigger asChild>
            <Button className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 shadow-lg hover:scale-105 transition-transform">
              <Plus className="w-3 h-3 mr-2" /> Add Record
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl rounded-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display uppercase tracking-tight">{editId ? 'Edit' : 'Add'} Record</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Customer Name</label>
                <Input className="rounded-xl mt-1" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Location</label>
                <Select value={form.location} onValueChange={(v) => setForm({ ...form, location: v })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {locations.map(l => <SelectItem key={l.name} value={l.name}>{l.name} <span className="text-on-surface-variant ml-1">({l.region})</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Plan Code</label>
                <Select value={form.planCode} onValueChange={(v) => setForm({ ...form, planCode: v })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {planCodes.map(p => <SelectItem key={p.code} value={p.code}>{p.label} <span className="text-on-surface-variant ml-1">({p.segment})</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">MRC (₦)</label>
                <Input className="rounded-xl mt-1" type="number" value={form.mrc || ''} disabled={getPlanMrc(form.planCode) !== null} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, mrc: e.target.value === '' ? 0 : Number(e.target.value) })} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Total Paid (₦)</label>
                <Input className="rounded-xl mt-1" type="number" value={form.totalPaid || ''} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, totalPaid: e.target.value === '' ? 0 : Number(e.target.value) })} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">NRC (₦)</label>
                <Input className="rounded-xl mt-1" type="number" value={form.nrc || ''} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, nrc: e.target.value === '' ? 0 : Number(e.target.value) })} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Sale Date</label>
                <Input className="rounded-xl mt-1" value={form.saleDate} onChange={(e) => setForm({ ...form, saleDate: e.target.value })} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Month</label>
                <Input className="rounded-xl mt-1" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Quarter</label>
                <Select value={form.quarter} onValueChange={(v: string) => setForm({ ...form, quarter: v as SaleQuarter })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['QUARTER 1', 'QUARTER 2', 'QUARTER 3', 'QUARTER 4'].map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Package Type</label>
                <Select value={form.packageType} onValueChange={(v: string) => setForm({ ...form, packageType: v as PackageType })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {packageTypes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Sales Agent</label>
                <Select value={form.salesAgent} onValueChange={(v) => setForm({ ...form, salesAgent: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select agent" /></SelectTrigger>
                  <SelectContent>
                    {salesAgents.map(a => <SelectItem key={a.name} value={a.name}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Means of Sale</label>
                <Select value={form.meansOfSale} onValueChange={(v) => setForm({ ...form, meansOfSale: v })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>
                    {meansOfSaleOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Account Status</label>
                <Select value={form.accountStatus} onValueChange={(v: string) => setForm({ ...form, accountStatus: v as AccountStatus })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accountStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Status Notes</label>
                <Input className="rounded-xl mt-1" value={form.statusNotes} onChange={(e) => setForm({ ...form, statusNotes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="rounded-full font-mono text-[10px] uppercase font-bold" onClick={() => { setIsOpen(false); resetForm(); }}>Cancel</Button>
              <Button className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-3 h-3 animate-spin mr-2" />}
                {editId ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <Input className="rounded-xl pl-10" placeholder="Search name, location, plan..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterRegion} onValueChange={setFilterRegion}>
          <SelectTrigger className="w-[140px] rounded-xl font-mono text-[10px] uppercase font-bold"><SelectValue placeholder="Region" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Regions</SelectItem>
            {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] rounded-xl font-mono text-[10px] uppercase font-bold"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {accountStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-2xl whisper-shadow border border-border overflow-hidden mb-24">
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest bg-surface-container-low">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4 text-right">MRC</th>
                  <th className="py-3 px-4 text-right">NRC</th>
                  <th className="py-3 px-4">Agent</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-body text-sm">
                {paginatedRecords.map((r: SalesRecordDoc) => (
                  <tr key={r.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-on-surface-variant">{r.serialNumber}</td>
                    <td className="py-3 px-4 font-bold text-primary whitespace-nowrap">{r.customerName}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.location}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.planCode}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">₦{(r.mrc || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono">₦{(r.nrc || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">{r.salesAgent}</td>
                    <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">{r.saleDate}</td>
                    <td className="py-3 px-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap",
                        r.accountStatus === 'Active' ? "bg-green-100 text-green-600" :
                        r.accountStatus === 'Inactive' ? "bg-red-100 text-red-600" :
                        r.accountStatus === 'Blocked' ? "bg-slate-100 text-slate-600" :
                        "bg-yellow-100 text-yellow-600"
                      )}>{r.accountStatus}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user && isSuperAdmin(user.email || '') && (
                          <>
                            <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><Edit3 className="w-3.5 h-3.5 text-on-surface-variant" /></button>
                            <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {records.length === 0 && (
              <div className="py-16 text-center border-t border-border/40">
                <p className="font-mono text-sm text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">No Records Found</p>
              </div>
            )}
          </div>
        )}
        {records.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-4 border-t border-border/40 bg-surface-container-low">
            <p className="font-mono text-[10px] text-on-surface-variant uppercase font-bold">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, records.length)} of {records.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-xl hover:bg-surface-container-lowest transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-[10px] text-on-surface-variant font-bold px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 rounded-xl hover:bg-surface-container-lowest transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </SalesLayout>
  );
}
