'use client';

import React, { useState, useRef } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, MapPin, DollarSign, Users, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const ch of lines[i]) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    values.push(current.trim());

    if (values.length !== headers.length) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }

  return records;
}

function formatNaira(amount: number) {
  if (amount >= 1000000) return '₦' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '₦' + (amount / 1000).toFixed(1) + 'K';
  return '₦' + amount.toLocaleString();
}

interface ParsedRow {
  serialNumber: number;
  customerName: string;
  btsName: string;
  status: string;
  accountType: string;
  mrc: number;
  planCode: string;
}

interface ImportResult {
  batchId: string;
  customerCount: number;
  siteCount: number;
  sites: Array<{
    btsName: string;
    matchedBtsName: string | null;
    region: string;
    totalCustomers: number;
    activeCustomers: number;
    totalMrr: number;
  }>;
  errors?: string[];
}

function KpiCard({ label, value, icon: Icon, sub }: { label: string; value: string; icon: React.ElementType; sub?: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl whisper-shadow border border-border">
      <Icon className="w-5 h-5 text-secondary mb-3" />
      <p className="font-mono text-[10px] uppercase text-on-surface-variant font-bold tracking-wider">{label}</p>
      <p className="text-xl font-mono font-black text-primary mt-1">{value}</p>
      {sub && <p className="font-mono text-[9px] text-on-surface-variant/60 mt-1 uppercase">{sub}</p>}
    </div>
  );
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border', className)}>{children}</div>;
}

export default function BtsDataImportPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      if (rows.length === 0) {
        setError(
          'No valid rows found. Expected columns: S/N, Name of Subscriber, BTS / Sites, Status, Account Type, Monthly Subcription Plan (₦), PLAN',
        );
        return;
      }

      const mapped: ParsedRow[] = rows
        .map((r, i) => {
          const mrcRaw = r['Monthly Subcription Plan (₦)'] || '';
          const mrc = parseNaira(mrcRaw);
          return {
            serialNumber: parseInt(r['S/N'] || String(i + 1)) || i + 1,
            customerName: r['Name of Subscriber']?.trim() || '',
            btsName: r['BTS / Sites']?.trim() || '',
            status: r['Status']?.trim() || 'Active',
            accountType: r['Account Type']?.trim() || '',
            mrc,
            planCode: r['PLAN']?.trim() || '',
          };
        })
        .filter((r) => r.customerName);

      setParsed(mapped);
      toast({ title: 'File Parsed', description: `${mapped.length} records loaded.` });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  };

  function parseNaira(value: string): number {
    if (!value || value === '—' || value === '-') return 0;
    const cleaned = value.replace(/^[₦Nn\s,#]+/, '').trim();
    const num = parseFloat(cleaned.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  }

  const handleImport = async () => {
    if (!user || parsed.length === 0) return;
    setImporting(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('File not found');
      const text = await file.text();

      const importResponse = await fetch('/api/admin/bts/customers/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ csv: text }),
      });

      const data = await importResponse.json();

      if (!importResponse.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data.data as ImportResult);
      toast({
        title: 'Import Complete',
        description: `${data.data.customerCount} customers imported across ${data.data.siteCount} sites.`,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import');
      toast({ variant: 'destructive', title: 'Import Failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setImporting(false);
    }
  };

  const siteSummaries = result?.sites || [];
  const totalMrr = siteSummaries.reduce((sum, s) => sum + s.totalMrr, 0);
  const totalActive = siteSummaries.reduce((sum, s) => sum + s.activeCustomers, 0);

  return (
    <SalesLayout>
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 md:mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">BTS Customer Data</h1>
            <p className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest font-bold mt-1">
              Import customer roster per BTS site from CSV
            </p>
          </div>
        </header>

        {result && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard label="Customers" value={String(result.customerCount)} icon={Users} sub="Total imported" />
            <KpiCard label="Sites" value={String(result.siteCount)} icon={Wifi} sub="BTS sites" />
            <KpiCard label="Active" value={String(totalActive)} icon={CheckCircle2} sub="Active customers" />
            <KpiCard label="Total MRR" value={formatNaira(totalMrr)} icon={DollarSign} sub="Monthly recurring revenue" />
          </div>
        )}

        {result?.errors && result.errors.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-6 py-4 rounded-2xl mb-8">
            <p className="font-bold font-mono text-[10px] uppercase mb-2">Import Warnings ({result.errors.length})</p>
            <ul className="list-disc list-inside space-y-1">
              {result.errors.slice(0, 10).map((err, i) => (
                <li key={i} className="font-mono text-[10px]">
                  {err}
                </li>
              ))}
              {result.errors.length > 10 && (
                <li className="font-mono text-[10px] text-yellow-600">...and {result.errors.length - 10} more</li>
              )}
            </ul>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-2xl mb-8 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="font-mono text-[11px]">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
          <div className="lg:col-span-5">
            <SectionCard>
              <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">1. Upload CSV</h3>
              <p className="font-mono text-[10px] text-on-surface-variant mb-4">
                Expected columns:{' '}
                <strong>S/N, Name of Subscriber, BTS / Sites, Status, Account Type, Monthly Subcription Plan (₦), PLAN</strong>
              </p>
              <div
                className="border-2 border-dashed border-border rounded-2xl p-10 text-center hover:border-secondary transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <FileSpreadsheet className="w-10 h-10 text-on-surface-variant/40 mx-auto mb-4" />
                <p className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Select CSV file</p>
                <p className="font-mono text-[8px] text-on-surface-variant/40 mt-2">BTS customer roster format</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />

              {parsed.length > 0 && (
                <div className="mt-4 p-4 bg-green-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <p className="font-bold text-green-800 font-mono text-[11px]">{parsed.length} records</p>
                  </div>
                  <p className="font-mono text-[9px] text-green-600">{fileName}</p>
                </div>
              )}

              <Button
                className="w-full rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold py-6 mt-6"
                onClick={handleImport}
                disabled={importing || parsed.length === 0}
              >
                {importing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Upload className="w-3 h-3 mr-2" />}
                {importing ? `Importing ${parsed.length}...` : `Import ${parsed.length} Records`}
              </Button>
            </SectionCard>
          </div>

          <div className="lg:col-span-7">
            <SectionCard>
              <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">2. Preview</h3>
              {parsed.length === 0 ? (
                <div className="h-48 flex items-center justify-center border-2 border-dashed border-border/60 rounded-xl">
                  <p className="font-mono text-[10px] text-on-surface-variant/40 uppercase font-bold">Upload a CSV to preview</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                        <th className="pb-2 pr-3">#</th>
                        <th className="pb-2 pr-3">Customer</th>
                        <th className="pb-2 pr-3">BTS Site</th>
                        <th className="pb-2 pr-3">Status</th>
                        <th className="pb-2 pr-3">Type</th>
                        <th className="pb-2 text-right">MRC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-body text-sm">
                      {parsed.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-surface-container-lowest">
                          <td className="py-2 pr-3 font-mono text-[10px] text-on-surface-variant">{row.serialNumber}</td>
                          <td className="py-2 pr-3 font-medium text-primary whitespace-nowrap max-w-[200px] truncate">
                            {row.customerName}
                          </td>
                          <td className="py-2 pr-3 font-mono text-[10px]">{row.btsName}</td>
                          <td className="py-2 pr-3">
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold',
                                row.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600',
                              )}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="py-2 pr-3 font-mono text-[10px]">{row.accountType}</td>
                          <td className="py-2 text-right font-mono font-bold">{formatNaira(row.mrc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.length > 50 && (
                    <p className="font-mono text-[10px] text-on-surface-variant/60 text-center py-3">
                      Showing 50 of {parsed.length} records
                    </p>
                  )}
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {result && siteSummaries.length > 0 && (
          <SectionCard className="mb-12">
            <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">Site Summary ({siteSummaries.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                    <th className="pb-3 pr-4">BTS Site</th>
                    <th className="pb-3 pr-4">Matched</th>
                    <th className="pb-3 px-4 text-right">Total</th>
                    <th className="pb-3 px-4 text-right">Active</th>
                    <th className="pb-3 pl-4 text-right">MRR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {siteSummaries.map((site, i) => (
                    <tr key={i} className="hover:bg-surface-container-lowest">
                      <td className="py-2.5 pr-4 font-bold text-primary">{site.btsName}</td>
                      <td className="py-2.5 pr-4 font-mono text-[10px]">
                        {site.matchedBtsName ? (
                          <span className="text-green-600">{site.matchedBtsName}</span>
                        ) : (
                          <span className="text-yellow-600">Unmatched</span>
                        )}
                        {site.region && <span className="text-on-surface-variant ml-1">({site.region})</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">{site.totalCustomers}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-green-600">{site.activeCustomers}</td>
                      <td className="py-2.5 pl-4 text-right font-mono font-bold">{formatNaira(site.totalMrr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}
      </div>
    </SalesLayout>
  );
}
