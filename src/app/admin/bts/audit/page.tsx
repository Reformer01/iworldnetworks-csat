'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Plus,
  Search,
  Filter,
  Download,
  Edit3,
  Trash2,
  AlertCircle,
  CheckCircle,
  MapPin,
  Target,
  DollarSign,
  Users,
  Wifi,
  Eye,
  FileText,
} from 'lucide-react';
import type { BtsAuditRecord, BtsStatus, BtsSiteType, SalesRegion } from '@/lib/sales-types';

const STATUSES: BtsStatus[] = ['Active', 'Inactive', 'Dismantled', 'Under Maintenance', 'Planned'];
const SITE_TYPES: BtsSiteType[] = ['Tower', 'Rooftop', 'Indoor', 'Pole', 'Wall Mount'];
const REGIONS: SalesRegion[] = ['Ogun', 'Oyo', 'Osun', 'Ondo'];

function formatNaira(amount: number) {
  if (amount >= 1000000) return '₦' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '₦' + (amount / 1000).toFixed(1) + 'K';
  return '₦' + amount.toLocaleString();
}

function getAttainmentColor(pct: number) {
  if (pct >= 100) return 'text-green-600';
  if (pct >= 75) return 'text-yellow-600';
  if (pct >= 50) return 'text-orange-600';
  return 'text-red-600';
}

const STATUS_COLORS: Record<BtsStatus, string> = {
  Active: 'bg-green-100 text-green-700',
  Inactive: 'bg-red-100 text-red-700',
  Dismantled: 'bg-slate-100 text-slate-700',
  'Under Maintenance': 'bg-yellow-100 text-yellow-700',
  Planned: 'bg-blue-100 text-blue-700',
};

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

function EmptyState({ message, icon: Icon = Wifi }: { message: string; icon?: React.ElementType }) {
  return (
    <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/60 rounded-xl">
      <Icon className="w-10 h-10 text-on-surface-variant/20 mb-3" />
      <p className="font-mono text-[11px] text-on-surface-variant/40 uppercase font-bold tracking-widest px-4">{message}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl whisper-shadow border border-border group hover:border-secondary transition-all duration-500 min-h-[184px]">
      <div className="mb-5">
        <Icon className={cn('w-6 h-6', color)} />
      </div>
      <p className="font-mono text-[10px] uppercase text-on-surface-variant mb-1 font-bold tracking-wider">{label}</p>
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className="text-2xl font-mono font-black text-primary">{value}</span>
      </div>
      <p className="mt-4 font-mono text-[9px] text-on-surface-variant/60 uppercase font-bold tracking-wider">{detail}</p>
    </div>
  );
}

function emptyForm() {
  return {
    btsName: '',
    btsId: undefined as number | undefined,
    region: '' as SalesRegion,
    siteType: 'Tower' as BtsSiteType,
    status: 'Planned' as BtsStatus,
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    address: '',
    host: '',
    activeCustomers: 0,
    totalCustomers: 0,
    enterpriseCustomers: 0,
    retailCustomers: 0,
    monthlyRecurringRevenue: 0,
    targetMrr: 5000000,
    nrcRevenue: 0,
    splynxRouterIds: [] as number[],
    splynxRouterNames: [] as string[],
    maintenanceNotes: '',
    auditPeriod: getCurrentAuditPeriod(),
  };
}

function getCurrentAuditPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

export default function BtsAuditPage() {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const { toast } = useToast();

  const [records, setRecords] = useState<BtsAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('__all');
  const [filterRegion, setFilterRegion] = useState<string>('__all');
  const [isOpen, setIsOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<BtsAuditRecord | null>(null);
  const [form, setForm] = useState<Partial<BtsAuditRecord>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const auditPeriod = useMemo(() => getCurrentAuditPeriod(), []);

  const fetchRecords = useCallback(async () => {
    if (authLoading) return;
    if (!user || !user.emailVerified) return;

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (filterStatus && filterStatus !== '__all') params.set('status', filterStatus);
      if (filterRegion && filterRegion !== '__all') params.set('region', filterRegion);
      if (auditPeriod) params.set('auditPeriod', auditPeriod);
      params.set('pageSize', '200');

      const res = await fetch(`/api/admin/bts/audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Failed: ${res.statusText}`);
      setRecords(result.data.records || []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching records');
    } finally {
      setLoading(false);
    }
  }, [user, authLoading, filterStatus, filterRegion, auditPeriod]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchRecords();
    }, 100);
    return () => clearTimeout(timeout);
  }, [fetchRecords]);

  const filteredRecords = useMemo(() => {
    if (!search) return records;
    const s = search.toLowerCase();
    return records.filter(
      (r) =>
        r.btsName.toLowerCase().includes(s) ||
        r.region.toLowerCase().includes(s) ||
        r.host?.toLowerCase().includes(s) ||
        r.address?.toLowerCase().includes(s),
    );
  }, [records, search]);

  const kpiData = useMemo(() => {
    const totalBts = records.length;
    const activeBts = records.filter((r) => r.status === 'Active').length;
    const totalCustomers = records.reduce((sum, r) => sum + (r.activeCustomers || 0), 0);
    const totalMrr = records.reduce((sum, r) => sum + (r.monthlyRecurringRevenue || 0), 0);
    const totalTarget = records.reduce((sum, r) => sum + (r.targetMrr || 5000000), 0);
    const avgAttainment = totalTarget > 0 ? Math.round((totalMrr / totalTarget) * 10000) / 100 : 0;
    const atTarget = records.filter((r) => r.attainmentPercentage >= 100).length;
    return { totalBts, activeBts, totalCustomers, totalMrr, totalTarget, avgAttainment, atTarget };
  }, [records]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const isEdit = !!editRecord;
      const url = '/api/admin/bts/audit';
      const method = isEdit ? 'PUT' : 'POST';

      const payload: Partial<BtsAuditRecord> = {
        ...form,
        btsName: form.btsName || '',
        region: form.region || '',
        siteType: form.siteType || 'Tower',
        status: form.status || 'Planned',
        auditPeriod: form.auditPeriod || auditPeriod,
      };

      if (isEdit && editRecord?.id) payload.id = editRecord.id;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }

      toast({ title: isEdit ? 'Updated' : 'Created', description: `${form.btsName} audit record ${isEdit ? 'updated' : 'created'}.` });
      setIsOpen(false);
      setForm(emptyForm());
      setEditRecord(null);
      fetchRecords();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!user || !confirm(`Delete audit record for ${name}?`)) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/bts/audit', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to delete');
      toast({ title: 'Deleted', description: `${name} removed.` });
      fetchRecords();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete' });
    }
  };

  const openEdit = (record: BtsAuditRecord) => {
    setEditRecord(record);
    setForm({
      btsName: record.btsName,
      btsId: record.btsId,
      region: record.region,
      siteType: record.siteType,
      status: record.status,
      latitude: record.latitude,
      longitude: record.longitude,
      address: record.address || '',
      host: record.host || '',
      activeCustomers: record.activeCustomers || 0,
      totalCustomers: record.totalCustomers || 0,
      enterpriseCustomers: record.enterpriseCustomers || 0,
      retailCustomers: record.retailCustomers || 0,
      monthlyRecurringRevenue: record.monthlyRecurringRevenue || 0,
      targetMrr: record.targetMrr || 5000000,
      nrcRevenue: record.nrcRevenue || 0,
      splynxRouterIds: record.splynxRouterIds || [],
      splynxRouterNames: record.splynxRouterNames || [],
      maintenanceNotes: record.maintenanceNotes || '',
      auditPeriod: record.auditPeriod,
    });
    setIsOpen(true);
  };

  const openCreate = () => {
    setEditRecord(null);
    setForm(emptyForm());
    setIsOpen(true);
  };

  if (authLoading) {
    return (
      <SalesLayout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-secondary/20 border-t-secondary rounded-full animate-spin" />
            <p className="font-mono text-[10px] text-on-surface-variant uppercase animate-pulse font-bold">Loading BTS Audit...</p>
          </div>
        </div>
      </SalesLayout>
    );
  }

  return (
    <SalesLayout>
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 md:mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">BTS Audit</h1>
            <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold mt-1">
              Audit Period: {auditPeriod} | {kpiData.totalBts} sites tracked
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Button
              className="rounded-full border border-border font-mono text-[10px] uppercase font-bold px-5 py-2.5 hover:bg-surface-container-low transition-all"
              onClick={openCreate}
            >
              <Plus className="w-3.5 h-3.5 mr-2" /> New Audit
            </Button>
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-8 md:mb-10">
          <KpiCard label="Total BTS Sites" value={String(kpiData.totalBts)} icon={Wifi} color="text-secondary" detail={kpiData.activeBts} />
          <KpiCard
            label="Active Sites"
            value={String(kpiData.activeBts)}
            icon={CheckCircle}
            color="text-green-600"
            detail={kpiData.totalBts - kpiData.activeBts}
          />
          <KpiCard
            label="Active Customers"
            value={String(kpiData.totalCustomers)}
            icon={Users}
            color="text-blue-600"
            detail="Across all sites"
          />
          <KpiCard
            label="Monthly Revenue"
            value={formatNaira(kpiData.totalMrr)}
            icon={DollarSign}
            color="text-orange-500"
            detail={`Target: ${formatNaira(kpiData.totalTarget)} (${kpiData.avgAttainment}%)`}
          />
        </div>

        {/* Filters & Search */}
        <SectionCard className="mb-8 md:mb-10">
          <div className="flex flex-col sm:flex-row gap-4 md:gap-5 mb-6">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <Input
                className="rounded-xl pl-10"
                placeholder="Search BTS name, region, host..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px] rounded-xl font-mono text-[10px] uppercase font-bold">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterRegion} onValueChange={setFilterRegion}>
              <SelectTrigger className="w-[160px] rounded-xl font-mono text-[10px] uppercase font-bold">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Regions</SelectItem>
                {REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-mono text-[10px] text-green-600 uppercase">At Target</p>
                <p className="font-bold text-green-800">
                  {kpiData.atTarget} / {kpiData.totalBts}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-xl">
              <Target className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="font-mono text-[10px] text-yellow-600 uppercase">Avg Attainment</p>
                <p className="font-bold text-yellow-800">{kpiData.avgAttainment}%</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-mono text-[10px] text-blue-600 uppercase">Total MRR</p>
                <p className="font-bold text-blue-800">{formatNaira(kpiData.totalMrr)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-xl">
              <Target className="w-5 h-5 text-purple-600" />
              <div>
                <p className="font-mono text-[10px] text-purple-600 uppercase">Total Target</p>
                <p className="font-bold text-purple-800">{formatNaira(kpiData.totalTarget)}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Data Table */}
        <SectionCard>
          <SectionTitle icon={FileText} label={`Audit Records (${filteredRecords.length})`} />

          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse bg-surface-container-low/50 rounded-xl h-16" />
              ))}
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-4" />
              <h3 className="font-display text-xl font-bold text-primary mb-2">Could Not Load</h3>
              <p className="text-on-surface-variant text-sm max-w-md text-center mx-auto">{error}</p>
              {error.includes('index') || error.includes('412') || error.includes('PRECONDITION') ? (
                <div className="mt-4 flex flex-col items-center gap-3">
                  <code className="bg-surface-container-low px-4 py-2 rounded-xl font-mono text-xs">
                    firebase deploy --only firestore:indexes
                  </code>
                  <Button
                    className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 py-3 hover:scale-105 transition-transform shadow-lg"
                    onClick={fetchRecords}
                  >
                    Retry After Deploying
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-4 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8 py-3 hover:scale-105 transition-transform shadow-lg"
                  onClick={fetchRecords}
                >
                  Retry
                </Button>
              )}
            </div>
          ) : filteredRecords.length === 0 ? (
            <EmptyState message="No audit records found. Create your first BTS audit entry." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest bg-surface-container-low">
                    <TableHead className="pb-3 pr-4">BTS Name</TableHead>
                    <TableHead className="pb-3 pr-4">Region</TableHead>
                    <TableHead className="pb-3 pr-4">Type</TableHead>
                    <TableHead className="pb-3 pr-4">Status</TableHead>
                    <TableHead className="pb-3 px-4 text-right">Active Cust</TableHead>
                    <TableHead className="pb-3 px-4 text-right">MRR</TableHead>
                    <TableHead className="pb-3 px-4 text-right">Target</TableHead>
                    <TableHead className="pb-3 pl-4 text-right">Attainment</TableHead>
                    <TableHead className="pb-3 pl-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40 font-body text-sm">
                  {filteredRecords.map((r, i) => (
                    <TableRow
                      key={r.id}
                      className="hover:bg-surface-container-lowest transition-colors"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <TableCell className="py-3.5 pr-4 font-bold text-primary whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{r.btsName}</span>
                          {r.btsId && <span className="font-mono text-[9px] text-on-surface-variant/50">#{r.btsId}</span>}
                        </div>
                        {r.address && <p className="font-mono text-[10px] text-on-surface-variant/50 mt-0.5">{r.address}</p>}
                        {r.host && <p className="font-mono text-[9px] text-secondary/70 mt-0.5">Host: {r.host}</p>}
                      </TableCell>
                      <TableCell className="py-3.5 pr-4 font-mono text-[11px]">
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                          {r.region}
                        </Badge>
                        <p className="font-mono text-[9px] text-on-surface-variant/50 mt-0.5 capitalize">{r.siteType.toLowerCase()}</p>
                      </TableCell>
                      <TableCell className="py-3.5 pr-4">
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                          {r.siteType}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3.5 pr-4">
                        <Badge className={cn('text-[10px] px-2 py-0.5', STATUS_COLORS[r.status])}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-right font-mono">
                        <span className="font-bold">{r.activeCustomers || 0}</span>
                        <span className="text-on-surface-variant/50 ml-1">/ {r.totalCustomers || 0}</span>
                        {r.enterpriseCustomers && <p className="font-mono text-[9px] text-blue-600 mt-0.5">Ent: {r.enterpriseCustomers}</p>}
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-right font-mono font-bold">
                        {formatNaira(r.monthlyRecurringRevenue || 0)}
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-right font-mono text-on-surface-variant">
                        {formatNaira(r.targetMrr || 5000000)}
                      </TableCell>
                      <TableCell
                        className="py-3.5 pl-4 text-right font-mono font-bold"
                        style={{ color: getAttainmentColor(r.attainmentPercentage || 0) }}
                      >
                        {r.attainmentPercentage?.toFixed(1) || '0'}%
                      </TableCell>
                      <TableCell className="py-3.5 pl-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg transition-colors" title="Edit">
                            <Edit3 className="w-3.5 h-3.5 text-on-surface-variant" />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id || '', r.btsName)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={isOpen}
        onOpenChange={(v) => {
          if (!v) {
            setIsOpen(false);
            setForm(emptyForm());
            setEditRecord(null);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="ghost" className="hidden" />
        </DialogTrigger>
        <DialogContent className="max-w-2xl rounded-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight">{editRecord ? 'Edit' : 'Add'} BTS Audit Record</DialogTitle>
            <DialogDescription className="sr-only">
              {editRecord ? 'Edit an existing BTS audit record.' : 'Add a new BTS audit record.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2">
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">BTS Name</label>
              <Input
                className="rounded-xl mt-1"
                value={form.btsName || ''}
                onChange={(e) => setForm({ ...form, btsName: e.target.value })}
                placeholder="e.g., Dominion, Space, Sijuwola House"
              />
            </div>

            <div className="col-span-2 flex gap-4">
              <div className="flex-1">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Region</label>
                <Select value={form.region || ''} onValueChange={(v) => setForm({ ...form, region: v as SalesRegion })}>
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Status</label>
                <Select value={form.status || 'Planned'} onValueChange={(v) => setForm({ ...form, status: v as BtsStatus })}>
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Site Type</label>
              <Select value={form.siteType || 'Tower'} onValueChange={(v) => setForm({ ...form, siteType: v as BtsSiteType })}>
                <SelectTrigger className="rounded-xl mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {SITE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Host / Building</label>
              <Input
                className="rounded-xl mt-1"
                value={form.host || ''}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="e.g., Conference Hotel, FM Station"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Address</label>
              <Input
                className="rounded-xl mt-1"
                value={form.address || ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Physical address"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Latitude</label>
              <Input
                className="rounded-xl mt-1"
                type="number"
                step="any"
                value={form.latitude !== undefined ? String(form.latitude) : ''}
                onChange={(e) => setForm({ ...form, latitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="7.3775"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Longitude</label>
              <Input
                className="rounded-xl mt-1"
                type="number"
                step="any"
                value={form.longitude !== undefined ? String(form.longitude) : ''}
                onChange={(e) => setForm({ ...form, longitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="3.9470"
              />
            </div>

            <div className="col-span-2">
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Active Customers</label>
              <Input
                className="rounded-xl mt-1"
                type="number"
                value={String(form.activeCustomers || 0)}
                onChange={(e) => setForm({ ...form, activeCustomers: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Enterprise Customers</label>
              <Input
                className="rounded-xl mt-1"
                type="number"
                value={String(form.enterpriseCustomers || 0)}
                onChange={(e) => setForm({ ...form, enterpriseCustomers: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Retail Customers</label>
              <Input
                className="rounded-xl mt-1"
                type="number"
                value={String(form.retailCustomers || 0)}
                onChange={(e) => setForm({ ...form, retailCustomers: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Total Customers</label>
              <Input
                className="rounded-xl mt-1"
                type="number"
                value={String(form.totalCustomers || 0)}
                onChange={(e) => setForm({ ...form, totalCustomers: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Monthly Revenue (₦)</label>
              <Input
                className="rounded-xl mt-1"
                type="number"
                value={String(form.monthlyRecurringRevenue || 0)}
                onChange={(e) => setForm({ ...form, monthlyRecurringRevenue: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Target MRR (₦)</label>
              <Input
                className="rounded-xl mt-1"
                type="number"
                value={String(form.targetMrr || 5000000)}
                onChange={(e) => setForm({ ...form, targetMrr: parseInt(e.target.value) || 5000000 })}
                placeholder="5000000"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">NRC Revenue (₦)</label>
              <Input
                className="rounded-xl mt-1"
                type="number"
                value={String(form.nrcRevenue || 0)}
                onChange={(e) => setForm({ ...form, nrcRevenue: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Splynx Router IDs</label>
              <Input
                className="rounded-xl mt-1"
                value={form.splynxRouterIds?.join(',') || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    splynxRouterIds: e.target.value
                      .split(',')
                      .map((v) => parseInt(v.trim()))
                      .filter((v) => !isNaN(v)),
                  })
                }
                placeholder="1, 2, 3"
              />
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Splynx Router Names</label>
              <Input
                className="rounded-xl mt-1"
                value={form.splynxRouterNames?.join(', ') || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    splynxRouterNames: e.target.value
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Dominion, Space FM"
              />
            </div>

            <div className="col-span-2">
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Maintenance Notes</label>
              <Input
                className="rounded-xl mt-1"
                value={form.maintenanceNotes || ''}
                onChange={(e) => setForm({ ...form, maintenanceNotes: e.target.value })}
                placeholder="Outage history, maintenance schedule, issues..."
              />
            </div>

            <div className="col-span-2">
              <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Audit Period</label>
              <Input
                className="rounded-xl mt-1"
                value={form.auditPeriod || auditPeriod}
                onChange={(e) => setForm({ ...form, auditPeriod: e.target.value })}
                readOnly
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full font-mono text-[10px] uppercase font-bold"
              onClick={() => {
                setIsOpen(false);
                setForm(emptyForm());
                setEditRecord(null);
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
              {editRecord ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalesLayout>
  );
}
