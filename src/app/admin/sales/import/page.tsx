'use client';

import React, { useState, useRef } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { importSalesRecords } from '@/hooks/use-sales-data';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, FileSpreadsheet, FileDown, CheckCircle2, AlertCircle, Check, AlertTriangle } from 'lucide-react';
import { getRegionForLocation, getSegmentForPlan, getQuarterFromMonth, parseNairaAmount, getBtsForLocation } from '@/lib/sales-staff';
import type { SaleQuarter } from '@/lib/sales-staff';

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const splitLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);
    return values.map((v) => v.trim());
  };
  const headers = splitLine(lines[0]);
  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    if (values.length !== headers.length) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }
  return records;
}

const VALID_STATUSES = ['Active', 'Inactive', 'Blocked', 'Refunded', 'Retrieved'] as const;
type AccountStatus = (typeof VALID_STATUSES)[number];

interface NormalizedStatus {
  accountStatus: AccountStatus;
  statusNotes: string;
}

function normalizeStatus(raw: string): NormalizedStatus {
  const s = raw.trim().toLowerCase();
  for (const vs of VALID_STATUSES) {
    if (s === vs.toLowerCase()) return { accountStatus: vs, statusNotes: '' };
  }
  for (const vs of VALID_STATUSES) {
    if (s.startsWith(vs.toLowerCase())) {
      const notes = raw.trim().slice(vs.length).trim();
      return { accountStatus: vs, statusNotes: notes };
    }
  }
  return { accountStatus: 'Active', statusNotes: raw.trim() };
}

function isSaleQuarter(value: string): value is SaleQuarter {
  return value === 'QUARTER 1' || value === 'QUARTER 2' || value === 'QUARTER 3' || value === 'QUARTER 4';
}

function isPackageType(value: string): value is 'Outright' | 'Lease' {
  return value === 'Outright' || value === 'Lease';
}

function mapCSVToSchema(row: Record<string, string>, index: number) {
  const name = row.Name || row.CustomerName || row.customerName || row.CUSTOMER_NAME || '';
  const location = row.Location || row.location || row.LOCATION || '';
  const planCode = row.Plan_Code || row.Plan || row.planCode || row.PLAN || row.PLAN_CODE || '';
  const mrcRaw = row.MRC || row.mrc || row.Monthly_Recurring || '';
  const nrcRaw = row.NRC || row.nrc || row.Installation_Fee || '';
  const agent = row.Business_Person || row.Sales_Agent || row.salesAgent || row.BUSINESS_PERSON || '';
  const meansOfSale = row.Means_of_Sales || row.Means_of_Sale || row.meansOfSale || row.MEANS_OF_SALES || '';
  const status = row.Account_Status || row.accountStatus || row.ACCOUNT_STATUS || '';
  const saleDate = row.Date || row.saleDate || row.Sale_Date || row.DATE || '';
  const rawQuarter = row.Quarter || row.quarter || row.QUARTER || '';
  const month = row.Month || row.month || row.MONTH || '';
  const packageType = row.Package_Type || row.packageType || row.PACKAGE_TYPE || '';
  const serialNumber = parseInt(String(row.S_N || row.Serial_Number || index)) || index;
  const rawStatusNotes = row.Last_Subscription || row.statusNotes || row.Status_Notes || '';
  const btsFromCsv = row.BTS || row.Bts || row.Base_Station || row.Tower || row.Site || '';

  const mrc = parseNairaAmount(mrcRaw);
  const nrc = parseNairaAmount(nrcRaw);
  const region = getRegionForLocation(location);
  const segment = getSegmentForPlan(planCode);
  const quarter = isSaleQuarter(rawQuarter) ? rawQuarter : getQuarterFromMonth(month);
  const { accountStatus, statusNotes: parsedNotes } = normalizeStatus(status);

  // Auto-assign BTS based on location
  const suggestedBts = getBtsForLocation(location);
  const assignedBts = btsFromCsv || suggestedBts[0]?.name || '';
  const btsOptions = suggestedBts.map((b) => b.name);

  return {
    serialNumber,
    customerName: name,
    location,
    region,
    segment,
    planCode,
    mrc,
    nrc,
    salesAgent: agent,
    meansOfSale,
    accountStatus,
    saleDate,
    quarter,
    month,
    packageType: isPackageType(packageType) ? packageType : 'Outright',
    statusNotes: parsedNotes || rawStatusNotes,
    bts: assignedBts,
    btsOptions,
  };
}

export default function SalesImport() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRecords, setParsedRecords] = useState<Array<ReturnType<typeof mapCSVToSchema> & { btsOptions: string[] }>>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ batchId: string; recordCount: number } | null>(null);
  const [fileName, setFileName] = useState('');

  const updateBts = (index: number, bts: string) => {
    setParsedRecords((prev) => prev.map((r, i) => (i === index ? { ...r, bts } : r)));
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const mapped = rows.map((r, i) => mapCSVToSchema(r, i + 1));
      setParsedRecords(mapped);
      toast({ title: 'File Parsed', description: `${mapped.length} records found.` });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Parse Error', description: err instanceof Error ? err.message : 'Failed to parse file' });
    }
  };

  // Column names MUST match the aliases the parser accepts (mapCSVToSchema).
  const TEMPLATE_HEADERS = [
    'Name',
    'Location',
    'Plan',
    'MRC',
    'NRC',
    'Date',
    'Sales_Agent',
    'Means_of_Sales',
    'Account_Status',
    'Quarter',
    'Month',
    'Package_Type',
    'S_N',
    'Last_Subscription',
    'BTS',
  ];

  const handleDownloadTemplate = () => {
    const sample = [
      'John Doe',
      'Ota',
      'H-Lite',
      '45000',
      '5000',
      '2026-08-01',
      'Stella Akinola',
      'Direct',
      'Active',
      'QUARTER 1',
      'June',
      'Outright',
      '1',
      '',
      '',
    ];
    const csv = [TEMPLATE_HEADERS.join(','), sample.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales-records-template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Template Downloaded', description: 'Fill it in and upload it here.' });
  };

  const handleImport = async () => {
    if (!user || parsedRecords.length === 0) return;
    setImporting(true);
    try {
      const payload = parsedRecords.map(({ region: _region, segment: _segment, btsOptions: _btsOptions, ...rest }) => ({
        ...rest,
        importBatchId: '',
      }));
      const result = await importSalesRecords(payload, 'csv_upload', fileName, user);
      setImportResult(result);
      toast({ title: 'Import Complete', description: `${result.recordCount} records imported.` });
      setParsedRecords([]);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Import Failed', description: e instanceof Error ? e.message : 'Failed to import' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <SalesLayout>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary uppercase tracking-tight">Import</h1>
          <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold mt-1">Upload CSV file</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
        <div className="lg:col-span-5">
          <div className="bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border">
            <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">1. Choose File</h3>
            <div className="space-y-6">
              <div
                className="border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-secondary transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <FileSpreadsheet className="w-10 h-10 text-on-surface-variant/40 mx-auto mb-4" />
                <p className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Select a CSV file</p>
                <p className="font-mono text-[8px] text-on-surface-variant/40 mt-2">
                  Use the template: Name, Location, Plan, MRC, NRC, Date, Sales_Agent, Means_of_Sales, Account_Status, Quarter, Month,
                  Package_Type, S_N, Last_Subscription, BTS
                </p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
              <Button
                variant="outline"
                className="w-full rounded-full font-mono text-[10px] uppercase font-bold"
                onClick={handleDownloadTemplate}
              >
                <FileDown className="w-3 h-3 mr-2" /> Download CSV Template
              </Button>
              {parsedRecords.length > 0 && (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-bold text-green-800 font-mono text-[11px]">{parsedRecords.length} records parsed</p>
                    <p className="font-mono text-[9px] text-green-600">{fileName}</p>
                  </div>
                </div>
              )}
              <Button
                className="w-full rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold py-6"
                onClick={handleImport}
                disabled={importing || parsedRecords.length === 0}
              >
                {importing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Upload className="w-3 h-3 mr-2" />}
                {importing ? `Importing ${parsedRecords.length}...` : `Import ${parsedRecords.length} Records`}
              </Button>
              {importResult && (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-bold text-green-800 font-mono text-[11px]">
                      {importResult.recordCount} records imported successfully
                    </p>
                    <p className="font-mono text-[9px] text-green-600">Batch: {importResult.batchId}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl whisper-shadow border border-border overflow-hidden">
            <div className="p-6 border-b border-border">
              <h3 className="font-display font-bold text-lg uppercase tracking-tight">2. Preview ({parsedRecords.length} records)</h3>
            </div>
            {parsedRecords.length > 0 ? (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Plan</th>
                      <th className="py-3 px-4 text-right">MRC</th>
                      <th className="py-3 px-4">Agent</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">BTS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-body text-sm">
                    {parsedRecords.slice(0, 50).map((r, i) => (
                      <tr key={i} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="py-2 px-4 font-bold text-primary whitespace-nowrap">{r.customerName}</td>
                        <td className="py-2 px-4 font-mono text-[11px]">{r.location}</td>
                        <td className="py-2 px-4 font-mono text-[11px]">{r.planCode}</td>
                        <td className="py-2 px-4 text-right font-mono font-bold">₦{(r.mrc || 0).toLocaleString()}</td>
                        <td className="py-2 px-4 font-mono text-[11px] whitespace-nowrap">{r.salesAgent}</td>
                        <td className="py-2 px-4">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono',
                              r.accountStatus === 'Active' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600',
                            )}
                          >
                            {r.accountStatus}
                          </span>
                        </td>
                        <td className="py-2 px-4">
                          <select
                            value={r.bts || ''}
                            onChange={(e) => updateBts(i, e.target.value)}
                            className="w-full max-w-xs px-2 py-1 text-sm border border-border rounded bg-white focus:outline-none focus:ring-2 focus:ring-secondary"
                          >
                            <option value="">— Select BTS —</option>
                            {r.btsOptions?.map((bts) => (
                              <option key={bts} value={bts}>
                                {bts}
                              </option>
                            ))}
                            {r.bts && !r.btsOptions?.includes(r.bts) && <option value={r.bts}>{r.bts} (manual)</option>}
                          </select>
                          {r.bts && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-mono text-green-600">
                              <Check className="w-3 h-3" /> Assigned
                            </span>
                          )}
                          {!r.bts && r.btsOptions?.length === 0 && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-mono text-red-600">
                              <AlertTriangle className="w-3 h-3" /> No BTS found
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center">
                <AlertCircle className="w-8 h-8 text-on-surface-variant/20 mx-auto mb-4" />
                <p className="font-mono text-sm text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">
                  Upload a CSV to preview
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </SalesLayout>
  );
}
