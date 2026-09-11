'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { Search, Loader2, User, MapPin, Phone, Wifi, Plus, Zap } from 'lucide-react';

const CALL_STATUSES = ['Contacted', 'No Answer', 'Not reachable', 'Switched Off', 'Busy', 'Wrong Number'];
const RISKS = ['', 'Low', 'Medium', 'High'];
const PURPOSES = ['Relationship Building', 'Follow-Up', 'Upsell', 'Complaint Resolution', 'Feedback Collection', 'Win-back', 'Other'];

interface CustomerSearchResult {
  id: string;
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  btsName: string | null;
  servicePlan: string | null;
  status: string | null;
  city: string | null;
  lifecycle: string | null;
  accountType: string | null;
  mrrTotal: number | null;
}

interface AddLogFormState {
  customerId: string | null;
  customerName: string;
  phone: string;
  btsName: string;
  plan: string;
  accountStatus: string;
  accountType: string;
  region: string;
  callStatus: string;
  purpose: string;
  feedback: string;
  complaint: string;
  upsellNote: string;
  retentionRisk: string;
  resolution: string;
  lastContactAt: string;
  nextFollowUpAt: string;
  assignedStaff: string;
}

const EMPTY_FORM: AddLogFormState = {
  customerId: null,
  customerName: '',
  phone: '',
  btsName: '',
  plan: '',
  accountStatus: 'Active',
  accountType: '',
  region: '',
  callStatus: '',
  purpose: '',
  feedback: '',
  complaint: '',
  upsellNote: '',
  retentionRisk: '',
  resolution: '',
  lastContactAt: new Date().toISOString().slice(0, 10),
  nextFollowUpAt: '',
  assignedStaff: '',
};

interface StaffGroup {
  staffName: string;
  _count: { _all: number };
}

interface AddLogDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  staffName: string;
  staffGroups?: StaffGroup[];
  /** Quick-log mode: only show essential fields */
  quickMode?: boolean;
}

export function AddLogDialog({ open, onClose, onSaved, staffName, staffGroups = [], quickMode = false }: AddLogDialogProps) {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [form, setForm] = useState<AddLogFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [staffList, setStaffList] = useState<string[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, lastContactAt: new Date().toISOString().slice(0, 10) });
      setQuery('');
      setResults([]);
      setSelectedCustomer(null);
      // Focus search input after a tick
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search customers with debounce
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setForm((f) => ({ ...f, customerName: value }));

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (value.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      if (!user) return;
      setSearching(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(value)}&limit=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.data?.customers || []);
          setShowResults(true);
        }
      } catch {
        // Search is best-effort
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [user]);

  const selectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer);
    setForm((f) => ({
      ...f,
      customerId: customer.id,
      customerName: customer.customerName || '',
      phone: customer.phone || '',
      btsName: customer.btsName || '',
      plan: customer.servicePlan || '',
      accountStatus: customer.status || 'Active',
      accountType: customer.accountType || '',
      region: customer.city || '',
    }));
    setQuery(customer.customerName || '');
    setShowResults(false);
  };

  const set = (k: keyof AddLogFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!user || !form.customerName.trim()) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerId: form.customerId,
          customerName: form.customerName,
          phone: form.phone || null,
          btsName: form.btsName || null,
          plan: form.plan || null,
          accountStatus: form.accountStatus || null,
          accountType: form.accountType || null,
          region: form.region || null,
          callStatus: form.callStatus || null,
          purpose: form.purpose || null,
          feedback: form.feedback || null,
          complaint: form.complaint || null,
          upsellNote: form.upsellNote || null,
          retentionRisk: form.retentionRisk || null,
          resolution: form.resolution || null,
          lastContactAt: form.lastContactAt || new Date().toISOString(),
          nextFollowUpAt: form.nextFollowUpAt || null,
          staffName: form.assignedStaff || staffName,
        }),
      });
      if (res.ok) {
        onSaved();
      }
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('rounded-3xl max-h-[85vh] overflow-y-auto', quickMode ? 'max-w-md' : 'max-w-lg')}>
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-tight flex items-center gap-2">
            {quickMode ? <Zap className="w-4 h-4 text-secondary" /> : <Plus className="w-4 h-4 text-secondary" />}
            {quickMode ? 'Quick Log' : 'New Engagement Log'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {quickMode ? 'Quickly log a customer interaction' : 'Create a new customer engagement log entry'}
          </DialogDescription>
        </DialogHeader>

        {/* Customer Search */}
        <div className="relative" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search customer by name, phone, or email..."
            className="pl-9 rounded-xl font-mono text-xs"
            onFocus={() => results.length > 0 && setShowResults(true)}
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-on-surface-variant/40" />
          )}

          {/* Autocomplete dropdown */}
          {showResults && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-border shadow-lg z-50 max-h-64 overflow-y-auto">
              {results.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  className="w-full px-4 py-3 text-left hover:bg-surface-container-low transition-colors border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-on-surface-variant/40 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold text-primary truncate">
                        {customer.customerName || 'Unnamed'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {customer.phone && (
                          <span className="font-mono text-[9px] text-on-surface-variant/50 flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5" /> {customer.phone}
                          </span>
                        )}
                        {customer.btsName && (
                          <span className="font-mono text-[9px] text-on-surface-variant/50 flex items-center gap-1">
                            <Wifi className="w-2.5 h-2.5" /> {customer.btsName}
                          </span>
                        )}
                        {customer.city && (
                          <span className="font-mono text-[9px] text-on-surface-variant/50 flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5" /> {customer.city}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase',
                        customer.status === 'Active' ? 'bg-emerald-100 text-emerald-600' : 'bg-zinc-100 text-zinc-500'
                      )}>
                        {customer.status || 'Unknown'}
                      </span>
                      {customer.mrrTotal != null && customer.mrrTotal > 0 && (
                        <p className="font-mono text-[9px] text-on-surface-variant/40 mt-0.5">
                          ₦{customer.mrrTotal.toLocaleString()}/mo
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {showResults && results.length === 0 && query.length >= 2 && !searching && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-border shadow-lg z-50 px-4 py-3">
              <p className="font-mono text-[10px] text-on-surface-variant/50">
                No customers found. You can still create a manual entry.
              </p>
            </div>
          )}
        </div>

        {/* Selected customer indicator */}
        {selectedCustomer && (
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-container-low rounded-xl">
            <User className="w-3.5 h-3.5 text-secondary" />
            <span className="font-mono text-[10px] text-secondary font-bold">
              {selectedCustomer.customerName}
            </span>
            <span className="font-mono text-[9px] text-on-surface-variant/40">
              {selectedCustomer.btsName} · {selectedCustomer.servicePlan} · {selectedCustomer.accountType}
            </span>
          </div>
        )}

        {/* Form */}
        <div className="space-y-4 py-2">
          {/* Quick mode: minimal fields */}
          {quickMode ? (
            <>
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Customer Name *</label>
                <Input
                  className="rounded-xl font-mono text-xs"
                  value={form.customerName}
                  onChange={(e) => set('customerName', e.target.value)}
                  placeholder="Customer name"
                />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Call Status *</label>
                <select
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs"
                  value={form.callStatus}
                  onChange={(e) => set('callStatus', e.target.value)}
                >
                  <option value="">Select status...</option>
                  {CALL_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Notes</label>
                <Textarea
                  className="min-h-[60px] rounded-xl font-mono text-xs"
                  value={form.feedback}
                  onChange={(e) => set('feedback', e.target.value)}
                  placeholder="Quick notes about this call..."
                />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Risk</label>
                <select
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs"
                  value={form.retentionRisk}
                  onChange={(e) => set('retentionRisk', e.target.value)}
                >
                  {RISKS.map((r) => <option key={r || 'none'} value={r}>{r || '—'}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              {/* Full mode: all fields */}
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Customer Name *</label>
                <Input
                  className="rounded-xl font-mono text-xs"
                  value={form.customerName}
                  onChange={(e) => set('customerName', e.target.value)}
                  placeholder="Customer name"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Phone</label>
                  <Input className="rounded-xl font-mono text-xs" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">BTS / Site</label>
                  <Input className="rounded-xl font-mono text-xs" value={form.btsName} onChange={(e) => set('btsName', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Assign To (Staff)</label>
                <select
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs"
                  value={form.assignedStaff}
                  onChange={(e) => set('assignedStaff', e.target.value)}
                >
                  <option value="">— Me ({staffName}) —</option>
                  {staffGroups.map((g) => (
                    <option key={g.staffName} value={g.staffName}>{g.staffName}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Call Status</label>
                  <select className="w-full h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs" value={form.callStatus} onChange={(e) => set('callStatus', e.target.value)}>
                    <option value="">—</option>
                    {CALL_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Purpose</label>
                  <select className="w-full h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs" value={form.purpose} onChange={(e) => set('purpose', e.target.value)}>
                    <option value="">—</option>
                    {PURPOSES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Risk</label>
                  <select className="w-full h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs" value={form.retentionRisk} onChange={(e) => set('retentionRisk', e.target.value)}>
                    {RISKS.map((r) => <option key={r || 'none'} value={r}>{r || '—'}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Account Status</label>
                  <select className="w-full h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs" value={form.accountStatus} onChange={(e) => set('accountStatus', e.target.value)}>
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Plan</label>
                  <Input className="rounded-xl font-mono text-xs" value={form.plan} onChange={(e) => set('plan', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Last Contact</label>
                  <Input type="date" className="rounded-xl font-mono text-xs" value={form.lastContactAt} onChange={(e) => set('lastContactAt', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Follow-Up</label>
                  <Input type="date" className="rounded-xl font-mono text-xs" value={form.nextFollowUpAt} onChange={(e) => set('nextFollowUpAt', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Feedback</label>
                <Textarea className="min-h-[60px] rounded-xl font-mono text-xs" value={form.feedback} onChange={(e) => set('feedback', e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Complaint</label>
                  <Input className="rounded-xl font-mono text-xs" value={form.complaint} onChange={(e) => set('complaint', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Resolution</label>
                  <Input className="rounded-xl font-mono text-xs" value={form.resolution} onChange={(e) => set('resolution', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Upsell Note</label>
                <Textarea className="min-h-[40px] rounded-xl font-mono text-xs" value={form.upsellNote} onChange={(e) => set('upsellNote', e.target.value)} />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" className="rounded-full font-mono text-[10px] uppercase font-bold" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8"
            disabled={saving || !form.customerName.trim()}
            onClick={save}
          >
            {saving ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : null}
            {saving ? 'Saving...' : 'Log Interaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
