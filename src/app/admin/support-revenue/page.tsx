'use client';

import React, { useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth, useUser } from '@/firebase';
import { useSupportRevenue, createSupportRevenue, updateSupportRevenue, deleteSupportRevenue, type SupportRevenueDoc } from '@/hooks/use-support-revenue';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Search, Trash2, Edit3, Receipt, Package } from 'lucide-react';
import { locations } from '@/lib/sales-staff';
import { fieldTechnicians } from '@/lib/staff';
import { isSuperAdmin } from '@/lib/admin-config';

const projectTypes = ['Router Sale', 'Cable', 'Radio', 'Relocation', 'Equipment', 'Other'];

interface EquipmentItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

function emptyForm() {
  return {
    customerName: '',
    location: '',
    projectType: 'Router Sale',
    items: [] as EquipmentItem[],
    totalAmount: 0,
    date: '',
    agentName: '',
    notes: '',
  };
}

export default function SupportRevenue() {
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const { records, loading, mutate } = useSupportRevenue({ projectType: filterProject || undefined });
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const resetForm = () => { setForm(emptyForm()); setEditId(null); };

  const filtered = records.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.customerName, r.location, r.projectType, r.agentName, r.notes]
      .some(f => f?.toLowerCase().includes(q));
  });

  const computedTotal = form.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const openEdit = (r: SupportRevenueDoc) => {
    setEditId(r.id);
    setForm({
      customerName: r.customerName || '',
      location: r.location || '',
      projectType: r.projectType || 'Router Sale',
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
        toast({ title: "Updated", description: "Revenue record updated." });
      } else {
        await createSupportRevenue(payload, user);
        toast({ title: "Created", description: "Revenue record added." });
      }
      setIsOpen(false);
      resetForm();
      mutate();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Error", description: e instanceof Error ? e.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm('Delete this record?')) return;
    try {
      await deleteSupportRevenue(id, user);
      toast({ title: "Deleted", description: "Record removed." });
      mutate();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Error", description: e instanceof Error ? e.message : 'Failed to delete' });
    }
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, { name: '', quantity: 1, unitPrice: 0 }] });
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const items = form.items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    setForm({ ...form, items });
  };

  const removeItem = (index: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  return (
    <AdminLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary uppercase tracking-tight">Support Revenue</h1>
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
              <DialogTitle className="font-display uppercase tracking-tight">{editId ? 'Edit' : 'Add'} Revenue Record</DialogTitle>
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
                    {locations.map(l => <SelectItem key={l.name} value={l.name}>{l.name} ({l.region})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Project Type</label>
                <Select value={form.projectType} onValueChange={(v) => setForm({ ...form, projectType: v })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {projectTypes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Equipment Items</label>
                <div className="space-y-3 mt-2">
                  {form.items.map((item, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="flex-1">
                        <Input className="rounded-xl" placeholder="Item name" value={item.name} onChange={(e) => updateItem(i, 'name', e.target.value)} />
                      </div>
                      <div className="w-20">
                        <Input className="rounded-xl" type="number" placeholder="Qty" min={1} value={item.quantity || ''} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 1)} />
                      </div>
                      <div className="w-28">
                        <Input className="rounded-xl" type="number" placeholder="Unit price" min={0} value={item.unitPrice || ''} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(i, 'unitPrice', e.target.value === '' ? 0 : Number(e.target.value))} />
                      </div>
                      <div className="w-20 flex items-center justify-end font-mono text-sm font-bold pt-2">
                        ₦{(item.quantity * item.unitPrice).toLocaleString()}
                      </div>
                      <button onClick={() => removeItem(i)} className="pt-2 text-destructive hover:text-destructive/80"><Trash2 className="w-4 h-4" /></button>
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
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Date</label>
                <Input className="rounded-xl mt-1" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Installation Tech</label>
                <Select value={form.agentName} onValueChange={(v) => setForm({ ...form, agentName: v })}>
                  <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="Select tech" /></SelectTrigger>
                  <SelectContent>
                    {fieldTechnicians.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Notes</label>
                <Textarea className="rounded-xl mt-1 min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
          <Input className="rounded-xl pl-10" placeholder="Search customer name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterProject} onValueChange={(v) => setFilterProject(v === 'All' ? '' : v)}>
          <SelectTrigger className="w-[160px] rounded-xl font-mono text-[10px] uppercase font-bold"><SelectValue placeholder="Project Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Types</SelectItem>
            {projectTypes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Agent</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-body text-sm">
                {filtered.map((r: SupportRevenueDoc) => (
                  <tr key={r.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td className="py-3 px-4 font-bold text-primary whitespace-nowrap">{r.customerName}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.location}</td>
                    <td className="py-3 px-4"><span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold font-mono", "bg-emerald-50 text-emerald-600")}>{r.projectType}</span></td>
                    <td className="py-3 px-4 text-right font-mono font-bold">₦{(r.totalAmount || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.agentName}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.date}</td>
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
            {filtered.length === 0 && (
              <div className="py-16 text-center border-t border-border/40">
                <Receipt className="w-8 h-8 mx-auto mb-3 text-on-surface-variant opacity-30" />
                <p className="font-mono text-sm text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">
                  {search || filterProject ? 'No Records Match Your Search' : 'No Support Revenue Records'}
                </p>
                {!search && !filterProject && (
                  <Button className="mt-4 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 shadow-lg hover:scale-105 transition-transform" onClick={() => setIsOpen(true)}>
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
