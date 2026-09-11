'use client';

import React, { useState, useEffect } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useSalesRecords, createSalesRecord, updateSalesRecord, deleteSalesRecord, type SalesRecordDoc } from '@/hooks/use-sales-data';
import { useToast } from '@/hooks/use-toast';
import { cn, toLocalDateString } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Search, Trash2, Edit3, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { salesAgents, planCodes, locations, getPlanMrc, getAgentByEmail, getSegmentForPlan, getQuarterFromMonth } from '@/lib/sales-staff';
import { getBtsForLocation } from '@/lib/bts-data';
import { isSuperAdmin, canManageSalesRecord, salesAgentForEmail } from '@/lib/admin-config';
import type { SaleQuarter, PackageType, AccountStatus, CustomerType, MeansOfSale } from '@/lib/sales-types';
import { MEANS_OF_SALES } from '@/lib/sales-types';

const accountStatuses = ['Active', 'Inactive', 'Blocked', 'Refunded', 'Retrieved'];
const packageTypes = ['Outright', 'Lease'];
const regions = ['Ogun', 'Oyo', 'Osun', 'Ondo'];

interface SalesRecordFormState {
  serialNumber: number;
  customerName: string;
  location: string;
  nrc: number;
  mrc: number;
  totalPaid: number;
  planCode: string;
  saleDate: string;
  quarter: SaleQuarter;
  month: string;
  packageType: PackageType;
  salesAgent: string;
  meansOfSale: string;
  accountStatus: AccountStatus;
  statusNotes: string;
  importBatchId: string;
  customerType: CustomerType;
  revivedByAgent: string;
  bts: string;
  region: string;
}

function emptyRecord(): SalesRecordFormState {
  return {
    serialNumber: 0,
    customerName: '',
    location: '',
    nrc: 0,
    mrc: 0,
    totalPaid: 0,
    planCode: 'H-Lite',
    saleDate: '',
    quarter: 'QUARTER 1',
    month: 'June',
    packageType: 'Outright',
    salesAgent: '',
    meansOfSale: '',
    accountStatus: 'Active',
    statusNotes: '',
    importBatchId: '',
    customerType: 'new',
    revivedByAgent: '',
    bts: '',
    region: 'Ogun',
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
  const [bitrate, setBitrate] = useState('');
  const [serviceDesc, setServiceDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('');
  const [logoBase64, setLogoBase64] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const userEmail = user?.email || '';

  const renderRoleBadge = () => {
    if (!user) return null;
    if (isSuperAdmin(userEmail)) return <span className="ml-2 text-secondary font-bold">(Super Admin)</span>;
    const agent = getAgentByEmail(userEmail);
    if (agent) return <span className="ml-2 text-muted-foreground">({agent.name})</span>;
    return null;
  };

  const resetForm = () => {
    setForm({ ...emptyRecord(), salesAgent: salesAgentForEmail(userEmail) || '' });
    setBitrate('');
    setServiceDesc('');
    setEditId(null);
  };
  const paginatedRecords = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
    return () => {
      /* cleanup */
    };
  }, [search, filterRegion, filterStatus]);

  useEffect(() => {
    fetch('/logo.png')
      .then((r) => r.blob())
      .then((blob) => {
        const reader = new FileReader();
        // SAFETY: readAsDataURL resolves reader.result to a base64 data URL string once onload fires.
        reader.onload = () => setLogoBase64(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => {
        /* logo is optional */
      });
    return () => {
      /* cleanup */
    };
  }, []);

  useEffect(() => {
    const isEnterprise = getSegmentForPlan(form.planCode) === 'ENTERPRISE';
    if (isEnterprise) return;
    const planMrc = getPlanMrc(form.planCode);
    if (planMrc !== null) {
      setForm((prev) => {
        const nrc = Math.max(0, form.totalPaid - planMrc);
        return { ...prev, mrc: planMrc, nrc };
      });
    }
    return () => {
      /* cleanup */
    };
  }, [form.planCode, form.totalPaid]);

  useEffect(() => {
    if (form.month) {
      const q = getQuarterFromMonth(form.month);
      if (q !== form.quarter) {
        setForm((prev) => ({ ...prev, quarter: q }));
      }
    }
    return () => {
      /* cleanup */
    };
  }, [form.month]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const finalPlanCode =
        form.planCode === 'CUSTOM' && serviceDesc.trim()
          ? `CUSTOM-${serviceDesc.trim()}`
          : getSegmentForPlan(form.planCode) === 'ENTERPRISE' && bitrate.trim()
            ? bitrate.trim()
            : form.planCode;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { totalPaid: _ignored, region: _regionIgnored, ...payload } = { ...form, planCode: finalPlanCode };
      if (editId) {
        await updateSalesRecord(editId, payload, user);
        toast({ title: 'Updated', description: 'Sales record updated.' });
      } else {
        await createSalesRecord(payload, user);
        toast({ title: 'Created', description: 'New sales record added.' });
      }
      setIsOpen(false);
      resetForm();
      mutate();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : 'Failed to save';
      // Try to surface specific field errors if the API returned them
      let detailed = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.errors) {
          const fields = Object.keys(parsed.errors).join(', ');
          detailed = `Fix these fields: ${fields}`;
        }
      } catch {
        /* raw message is not JSON, show as-is */
      }
      toast({ variant: 'destructive', title: 'Error', description: detailed });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm('Delete this record?')) return;
    try {
      await deleteSalesRecord(id, user);
      toast({ title: 'Deleted', description: 'Record removed.' });
      mutate();
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete' });
    }
  };

  const handleExportCsv = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/sales/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sales-records-export.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Exported', description: 'CSV file downloaded.' });
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Export Error', description: e instanceof Error ? e.message : 'Failed to export' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const jsPDF = (await import('jspdf')).default;
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();

      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 14, 8, 28, 9);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('I-World Networks', pageW / 2, 13, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      const dateStr = new Date().toLocaleDateString('en-GB');
      doc.text(dateStr, pageW - 14, 13, { align: 'right' });

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(68, 133, 21);
      doc.text('Sales Records Export', pageW / 2, 21, { align: 'center' });

      const columns = [
        'S/N',
        'Customer',
        'Type',
        'Location',
        'BTS',
        'Plan',
        'MRC',
        'NRC',
        'Region',
        'Qtr',
        'Month',
        'Pkg',
        'Agent',
        'Channel',
        'Status',
        'Notes',
        'Cust Type',
        'Revived By',
        'Segment',
      ];

      const rows = records.map((r) => [
        r.serialNumber || '',
        r.customerName || '',
        r.customerType === 'revived' ? 'Revived' : 'New',
        r.location || '',
        r.bts || '',
        r.planCode || '',
        (r.mrc || 0).toLocaleString(),
        (r.nrc || 0).toLocaleString(),
        r.region || '',
        r.quarter || '',
        r.month || '',
        r.packageType || '',
        r.salesAgent || '',
        r.meansOfSale || '',
        r.accountStatus || '',
        r.statusNotes || '',
        r.customerType || 'new',
        r.revivedByAgent || '',
        r.segment || '',
      ]);

      autoTable(doc, {
        head: [columns],
        body: rows,
        startY: 27,
        styles: {
          fontSize: 6,
          font: 'helvetica',
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [68, 133, 21],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 6.5,
          halign: 'center',
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        margin: { top: 27, bottom: 20 },
        pageBreak: 'auto',
        didDrawPage: (data) => {
          // SAFETY: jspdf-autotable attaches getNumberOfPages to the doc instance after rendering.
          const pageCount = (doc as typeof doc & { getNumberOfPages?: () => number }).getNumberOfPages?.() ?? 1;
          const pageNum = data.pageNumber;
          doc.setFontSize(7);
          doc.setTextColor(150, 150, 150);
          doc.text(`Page ${pageNum} of ${pageCount}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
          doc.text('I-World Networks - Confidential', 14, doc.internal.pageSize.getHeight() - 8);
        },
      });

      const fdate = toLocalDateString(new Date());
      doc.save(`sales-records-${fdate}.pdf`);
      toast({ title: 'Exported', description: 'PDF file downloaded.' });
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Export Error', description: e instanceof Error ? e.message : 'Failed to export PDF' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportSelect = (value: string) => {
    setExportFormat(value);
    if (value === 'csv') handleExportCsv();
    else if (value === 'pdf') handleExportPdf();
  };

  const openEdit = (r: SalesRecordDoc) => {
    setEditId(r.id);
    const nrcVal = r.nrc || 0;
    const mrcVal = r.mrc || 0;
    const loc = locations.find((l) => l.name === r.location);
    const isCustomPlan = r.planCode?.startsWith('CUSTOM-');
    const isEnterprisePlan = !isCustomPlan && r.planCode && getSegmentForPlan(r.planCode) === 'ENTERPRISE';
    const knownPlan = planCodes.find((p) => p.code === r.planCode);
    setBitrate(isEnterprisePlan && !knownPlan ? r.planCode : '');
    setServiceDesc(isCustomPlan ? r.planCode!.replace('CUSTOM-', '') : '');
    setForm({
      serialNumber: r.serialNumber || 0,
      customerName: r.customerName || '',
      location: r.location || '',
      region: loc?.region || 'Ogun',
      nrc: nrcVal,
      mrc: mrcVal,
      totalPaid: nrcVal + mrcVal,
      planCode: isCustomPlan ? 'CUSTOM' : isEnterprisePlan && !knownPlan ? 'ENT' : r.planCode || '',
      saleDate: r.saleDate || '',
      quarter: r.quarter || 'QUARTER 1',
      month: r.month || '',
      packageType: r.packageType || 'Outright',
      salesAgent: r.salesAgent || '',
      meansOfSale: r.meansOfSale || '',
      accountStatus: r.accountStatus || 'Active',
      statusNotes: r.statusNotes || '',
      importBatchId: r.importBatchId || '',
      customerType: r.customerType || 'new',
      revivedByAgent: r.revivedByAgent || '',
      bts: r.bts || '',
    });
    setIsOpen(true);
  };

  return (
    <SalesLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary uppercase tracking-tight">Sales Records</h1>
          <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold mt-1">
            {records.length} records · page {page + 1} of {totalPages}
            {renderRoleBadge()}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={exportFormat} onValueChange={handleExportSelect}>
            <SelectTrigger
              className="w-[160px] rounded-xl font-mono text-[10px] uppercase font-bold"
              disabled={exporting || records.length === 0}
            >
              {exporting ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <FileDown className="w-3.5 h-3.5 mr-2" />}
              <SelectValue placeholder="Export" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">Export CSV</SelectItem>
              <SelectItem value="pdf">Export PDF</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
              <DialogTitle className="font-display uppercase tracking-tight">{editId ? 'Edit' : 'Add'} Record</DialogTitle>
              <DialogDescription className="sr-only">
                {editId ? 'Edit an existing sales record.' : 'Add a new customer sales record.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
              <div className="col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Customer Name</label>
                <Input
                  className="rounded-xl mt-1"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                />
              </div>

              <div className="col-span-2 flex gap-4">
                <div className="flex-1">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Customer Type</label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      className={`flex-1 rounded-xl py-2 text-xs font-bold font-mono uppercase transition-all ${form.customerType === 'new' ? 'bg-secondary text-white' : 'bg-surface-container-low text-on-surface-variant'}`}
                      onClick={() => setForm({ ...form, customerType: 'new', revivedByAgent: '' })}
                    >
                      New
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-xl py-2 text-xs font-bold font-mono uppercase transition-all ${form.customerType === 'revived' ? 'bg-secondary text-white' : 'bg-surface-container-low text-on-surface-variant'}`}
                      onClick={() => setForm({ ...form, customerType: 'revived' })}
                    >
                      Revived
                    </button>
                  </div>
                </div>
                {form.customerType === 'revived' && (
                  <div className="flex-1">
                    <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Revived By Agent</label>
                    <Select value={form.revivedByAgent} onValueChange={(v) => setForm({ ...form, revivedByAgent: v })}>
                      <SelectTrigger className="rounded-xl mt-1">
                        <SelectValue placeholder="Select agent" />
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
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Location</label>
                <Select
                  value={form.location}
                  onValueChange={(v) => {
                    const loc = locations.find((l) => l.name === v);
                    setForm({ ...form, location: v, region: loc?.region || 'Ogun' });
                  }}
                >
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.name} value={l.name}>
                        {l.name} <span className="text-on-surface-variant ml-1">({l.region})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Region</label>
                <Input className="rounded-xl mt-1" value={form.region} disabled />
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">BTS</label>
                <Select value={form.bts || ''} onValueChange={(v) => setForm({ ...form, bts: v === '_none' ? '' : v })}>
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue placeholder="Select BTS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {getBtsForLocation(form.location).map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Plan Code</label>
                <Select
                  value={form.planCode}
                  onValueChange={(v) => {
                    setForm({ ...form, planCode: v });
                    if (getSegmentForPlan(v) !== 'ENTERPRISE') setBitrate('');
                    if (v !== 'CUSTOM') setServiceDesc('');
                  }}
                >
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {planCodes.map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {p.label} <span className="text-on-surface-variant ml-1">({p.segment})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">MRC (₦)</label>
                <Input
                  className="rounded-xl mt-1"
                  type="number"
                  value={form.mrc || ''}
                  disabled={getPlanMrc(form.planCode) !== null && getSegmentForPlan(form.planCode) !== 'ENTERPRISE'}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setForm({ ...form, mrc: e.target.value === '' ? 0 : Number(e.target.value) })}
                />
              </div>
              {getSegmentForPlan(form.planCode) === 'ENTERPRISE' && form.planCode !== 'CUSTOM' && (
                <div>
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Bitrate</label>
                  <Input
                    className="rounded-xl mt-1"
                    placeholder="e.g. 15Mbps"
                    value={bitrate}
                    onChange={(e) => setBitrate(e.target.value)}
                  />
                </div>
              )}
              {form.planCode === 'CUSTOM' && (
                <div className="col-span-2">
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Service Description</label>
                  <Input
                    className="rounded-xl mt-1"
                    placeholder="Describe the custom service"
                    value={serviceDesc}
                    onChange={(e) => setServiceDesc(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Total Paid (₦)</label>
                <Input
                  className="rounded-xl mt-1"
                  type="number"
                  value={form.totalPaid || ''}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setForm({ ...form, totalPaid: e.target.value === '' ? 0 : Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">NRC (₦)</label>
                <Input
                  className="rounded-xl mt-1"
                  type="number"
                  value={form.nrc || ''}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setForm({ ...form, nrc: e.target.value === '' ? 0 : Number(e.target.value) })}
                />
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
                <Select
                  value={form.quarter}
                  onValueChange={(v: string) => {
                    // SAFETY: Select options are exactly the four SaleQuarter values.
                    setForm({ ...form, quarter: v as SaleQuarter });
                  }}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['QUARTER 1', 'QUARTER 2', 'QUARTER 3', 'QUARTER 4'].map((q) => (
                      <SelectItem key={q} value={q}>
                        {q}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Package Type</label>
                <Select
                  value={form.packageType}
                  onValueChange={(v: string) => {
                    // SAFETY: Select options are exactly the two PackageType values.
                    setForm({ ...form, packageType: v as PackageType });
                  }}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {packageTypes.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Sales Agent</label>
                <Select
                  value={form.salesAgent}
                  onValueChange={(v) => setForm({ ...form, salesAgent: v })}
                  disabled={!isSuperAdmin(userEmail) && !!salesAgentForEmail(userEmail)}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select agent" />
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
              <div>
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Means of Sale</label>
                <Select value={form.meansOfSale} onValueChange={(v) => setForm({ ...form, meansOfSale: v })}>
                  <SelectTrigger className="rounded-xl mt-1">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEANS_OF_SALES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editId && (
                <div>
                  <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Account Status</label>
                  <Select
                    value={form.accountStatus}
                    onValueChange={(v: string) => {
                      // SAFETY: Select options are exactly the AccountStatus values.
                      setForm({ ...form, accountStatus: v as AccountStatus });
                    }}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountStatuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="col-span-2">
                <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Status Notes</label>
                <Input
                  className="rounded-xl mt-1"
                  value={form.statusNotes}
                  onChange={(e) => setForm({ ...form, statusNotes: e.target.value })}
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
      </header>

      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <Input
            className="rounded-xl pl-10"
            placeholder="Search name, location, plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterRegion} onValueChange={setFilterRegion}>
          <SelectTrigger className="w-[140px] rounded-xl font-mono text-[10px] uppercase font-bold">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Regions</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] rounded-xl font-mono text-[10px] uppercase font-bold">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Statuses</SelectItem>
            {accountStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
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
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest bg-surface-container-low">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">BTS</th>
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
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap',
                          r.customerType === 'revived' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600',
                        )}
                      >
                        {r.customerType === 'revived' ? 'Revived' : 'New'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.location}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.bts || '-'}</td>
                    <td className="py-3 px-4 font-mono text-[11px]">{r.planCode}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">₦{(r.mrc || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono">₦{(r.nrc || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">{r.salesAgent}</td>
                    <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">{r.saleDate}</td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap',
                          r.accountStatus === 'Active'
                            ? 'bg-green-100 text-green-600'
                            : r.accountStatus === 'Inactive'
                              ? 'bg-red-100 text-red-600'
                              : r.accountStatus === 'Blocked'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-yellow-100 text-yellow-600',
                        )}
                      >
                        {r.accountStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user && canManageSalesRecord(userEmail, r.salesAgent) && (
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
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-xl hover:bg-surface-container-lowest transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-[10px] text-on-surface-variant font-bold px-2">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
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
