'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  MapPin,
  DollarSign,
  Users,
  Wifi,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseCSV } from '@/lib/csv';

const BTS_REGIONS = ['Ibadan', 'Abeokuta', 'Ijebu', 'Osogbo', 'Sagamu', 'Akure', 'Ota'] as const;

const BTS_STATIONS_BY_REGION: Record<string, string[]> = {
  Ibadan: ['Sijuwola House', 'Dominion', 'Space', 'Splash', 'NTA IBD', 'Honor', 'Oleyo', 'Ologuneru', 'Jericho', 'Impact', 'Moniya'],
  Abeokuta: [
    'Omida Office',
    'NTA Abeokuta',
    'Rockcity',
    'Elega',
    'Ikija',
    'Ewang',
    'IVD',
    'Paramount',
    'Laderin',
    'Osoba',
    'Oloke',
    'CUAB',
    'CFMC',
    'Obada Oko',
    'Obada Extension',
    'Miliki',
    'OGBC',
    'Oshoba Hill',
  ],
  Ijebu: ['Odogbolu', 'Ijebu GRA', 'NTA Ijebu', 'Ilamo', 'CKA'],
  Osogbo: ['OSBC', 'NTA Osogbo', 'Rave', 'Osogbo Office', 'Odeomu'],
  Sagamu: ['Sagamu GRA', 'CRC', 'Akarigbo', 'Sagamu Extension', 'Potoki', 'Pentagon', 'Magboro'],
  Akure: ['OSRC', 'Akure Office', 'Positive', 'Glow', 'Alagbaka Extension', 'Bolorunduro', 'Breeze'],
  Ota: ['Ota Estate', 'Syayis', 'AIT', 'Ota Office', 'Miliki BTS'],
};

function formatNaira(amount: number) {
  if (amount >= 1000000) return '₦' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '₦' + (amount / 1000).toFixed(1) + 'K';
  return '₦' + amount.toLocaleString();
}

function parseNaira(value: string): number {
  if (!value || value === '—' || value === '-') return 0;
  const cleaned = value.replace(/^[₦Nn\s,#]+/, '').trim();
  const num = parseFloat(cleaned.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
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
  region: string;
  customerCount: number;
  siteCount: number;
  matchedCount: number;
  unmatchedCount: number;
  unmatchedSites?: string[];
  sites: Array<{
    btsName: string;
    matchedBtsName: string | null;
    matchStatus: 'matched' | 'unmatched';
    region: string;
    totalCustomers: number;
    activeCustomers: number;
    totalMrr: number;
  }>;
  errors?: string[];
}

interface ImportBatch {
  batchId: string;
  region: string;
  createdAt: number;
  customerCount: number;
  siteCount: number;
  matchedCount: number;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
  variant,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  variant?: 'default' | 'warning';
}) {
  return (
    <div className={cn('bg-white p-5 rounded-2xl whisper-shadow border', variant === 'warning' ? 'border-yellow-200' : 'border-border')}>
      <Icon className={cn('w-5 h-5 mb-3', variant === 'warning' ? 'text-yellow-500' : 'text-secondary')} />
      <p className="font-mono text-[10px] uppercase text-on-surface-variant font-bold tracking-wider">{label}</p>
      <p className={cn('text-xl font-mono font-black mt-1', variant === 'warning' ? 'text-yellow-700' : 'text-primary')}>{value}</p>
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

  const [region, setRegion] = useState<string>('');
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingHistory(true);
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/bts/customers/import${region ? '?region=' + region : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data?.batchIds) {
        const sites = data.data.sites || [];
        const batchMap = new Map<string, ImportBatch>();
        for (const site of sites) {
          const bid = site.importBatchId as string;
          if (!batchMap.has(bid)) {
            batchMap.set(bid, {
              batchId: bid,
              region: site.region || region,
              createdAt: site.createdAt as number,
              customerCount: 0,
              siteCount: 0,
              matchedCount: 0,
            });
          }
          const b = batchMap.get(bid)!;
          b.customerCount += site.totalCustomers || 0;
          b.siteCount++;
          if (site.matchStatus === 'matched' || site.matchedBtsName) b.matchedCount++;
        }
        setHistory(
          Array.from(batchMap.values())
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 10),
        );
      }
    } catch (err) {
      console.error('Failed to fetch import history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [user, region]);

  useEffect(() => {
    if (user) fetchHistory();
  }, [fetchHistory, user]);

  const handleRegionSelect = (r: string) => {
    setRegion(r);
    setShowRegionDropdown(false);
    setResult(null);
    setError(null);
  };

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
      toast({ title: 'File Parsed', description: `${mapped.length} records loaded for ${region || 'selected region'}.` });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  };

  const handleImport = async () => {
    if (!user || parsed.length === 0 || !region) return;
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
        body: JSON.stringify({ csv: text, region }),
      });

      const data = await importResponse.json();

      if (!importResponse.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data.data as ImportResult);
      toast({
        title: 'Import Complete',
        description: `${data.data.customerCount} customers imported across ${data.data.siteCount} sites in ${region}.`,
      });
      fetchHistory();
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

  const neededColumns = ['S/N', 'Name of Subscriber', 'BTS / Sites', 'Status', 'Account Type', 'Monthly Subcription Plan (₦)', 'PLAN'];

  function findMatch(siteName: string): string | null {
    const norm = siteName.toLowerCase();
    const stations = BTS_STATIONS_BY_REGION[region] || [];
    for (const s of stations) {
      if (norm.includes(s.toLowerCase())) return s;
    }
    for (const s of stations) {
      const sWords = s.toLowerCase().split(/[\s-/]+/);
      const nWords = norm.split(/[\s-/]+/);
      const common = sWords.filter((w) => nWords.includes(w)).length;
      if (common >= Math.min(sWords.length, 3)) return s;
      if (common >= 2 && common === sWords.length) return s;
    }
    return null;
  }

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
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <KpiCard label="Region" value={result.region} icon={MapPin} sub="Selected region" />
              <KpiCard label="Customers" value={String(result.customerCount)} icon={Users} sub="Total imported" />
              <KpiCard label="Sites" value={String(result.siteCount)} icon={Wifi} sub="BTS sites" />
              <KpiCard label="Active" value={String(totalActive)} icon={CheckCircle2} sub="Active customers" />
              <KpiCard label="Total MRR" value={formatNaira(totalMrr)} icon={DollarSign} sub="Monthly recurring revenue" />
            </div>
            {result.unmatchedCount > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-6 py-4 rounded-2xl mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5" />
                  <p className="font-bold font-mono text-[10px] uppercase">
                    {result.unmatchedCount} site(s) could not be matched to a known BTS station
                  </p>
                </div>
                {result.unmatchedSites && (
                  <ul className="list-disc list-inside space-y-1">
                    {result.unmatchedSites.map((s, i) => (
                      <li key={i} className="font-mono text-[10px]">
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="font-mono text-[10px] mt-2 text-yellow-700">
                  These records were still imported. Check your CSV site names against the station list for this region.
                </p>
              </div>
            )}
          </>
        )}

        {result?.errors && result.errors.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-6 py-4 rounded-2xl mb-6">
            <p className="font-bold font-mono text-[10px] uppercase mb-2">Parse Warnings ({result.errors.length})</p>
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
          <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-2xl mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="font-mono text-[11px]">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
          <div className="lg:col-span-5 space-y-6">
            <SectionCard>
              <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">1. Select Region</h3>
              <div className="relative">
                <button
                  onClick={() => setShowRegionDropdown(!showRegionDropdown)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 rounded-xl border font-mono text-[11px] font-bold transition-all',
                    region ? 'border-secondary text-primary bg-secondary/5' : 'border-border text-on-surface-variant bg-white',
                  )}
                >
                  <span>{region || 'Choose BTS Region...'}</span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', showRegionDropdown && 'rotate-180')} />
                </button>
                {showRegionDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-20 overflow-hidden">
                    {BTS_REGIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => handleRegionSelect(r)}
                        className={cn(
                          'w-full text-left px-4 py-3 font-mono text-[11px] font-bold hover:bg-secondary/5 transition-colors',
                          region === r ? 'bg-secondary/10 text-secondary' : 'text-primary',
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {region && (
              <SectionCard>
                <h3 className="font-display font-bold text-sm uppercase tracking-tight mb-4 flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-secondary" />
                  {region} BTS Stations
                </h3>
                <p className="font-mono text-[9px] text-on-surface-variant/60 mb-3 uppercase font-bold">
                  CSV site names must match one of these:
                </p>
                <div className="flex flex-wrap gap-2">
                  {(BTS_STATIONS_BY_REGION[region] || []).map((s) => (
                    <span key={s} className="px-2.5 py-1 bg-surface-container-low rounded-full font-mono text-[9px] font-bold text-primary">
                      {s}
                    </span>
                  ))}
                </div>
              </SectionCard>
            )}

            <SectionCard>
              <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">2. Upload CSV</h3>
              <p className="font-mono text-[10px] text-on-surface-variant mb-4">
                Expected columns:{' '}
                {neededColumns.map((c) => (
                  <span
                    key={c}
                    className="inline-block bg-surface-container-low px-1.5 py-0.5 rounded font-mono text-[9px] font-bold text-primary mr-1 mb-1"
                  >
                    {c}
                  </span>
                ))}
              </p>
              <div
                className={cn(
                  'border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer',
                  region ? 'border-border hover:border-secondary' : 'border-border/40 cursor-not-allowed',
                )}
                onClick={() => region && fileRef.current?.click()}
              >
                <FileSpreadsheet
                  className={cn('w-10 h-10 mx-auto mb-4', region ? 'text-on-surface-variant/40' : 'text-on-surface-variant/20')}
                />
                <p
                  className={cn(
                    'font-mono text-[10px] uppercase font-bold',
                    region ? 'text-on-surface-variant' : 'text-on-surface-variant/30',
                  )}
                >
                  {region ? 'Select CSV file' : 'Select a region first'}
                </p>
                <p className="font-mono text-[8px] text-on-surface-variant/40 mt-2">BTS customer roster format</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} disabled={!region} />

              {parsed.length > 0 && (
                <div className="mt-4 p-4 bg-green-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <p className="font-bold text-green-800 font-mono text-[11px]">{parsed.length} records loaded</p>
                  </div>
                  <p className="font-mono text-[9px] text-green-600">{fileName}</p>
                  <p className="font-mono text-[9px] text-green-600 mt-1">Region: {region}</p>
                </div>
              )}

              <Button
                className="w-full rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold py-6 mt-6"
                onClick={handleImport}
                disabled={importing || parsed.length === 0 || !region}
              >
                {importing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Upload className="w-3 h-3 mr-2" />}
                {importing
                  ? `Importing ${parsed.length}...`
                  : region
                    ? `Import ${parsed.length} Records for ${region}`
                    : 'Select a Region First'}
              </Button>
            </SectionCard>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <SectionCard>
              <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">
                3. Preview {parsed.length > 0 && `(${parsed.length} rows)`}
              </h3>
              {parsed.length === 0 ? (
                <div className="h-48 flex items-center justify-center border-2 border-dashed border-border/60 rounded-xl">
                  <p className="font-mono text-[10px] text-on-surface-variant/40 uppercase font-bold">
                    {region ? 'Upload a CSV to preview' : 'Select a region, then upload a CSV'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                        <th className="pb-2 pr-3">#</th>
                        <th className="pb-2 pr-3">Customer</th>
                        <th className="pb-2 pr-3">BTS Site</th>
                        <th className="pb-2 pr-3">Match</th>
                        <th className="pb-2 pr-3">Status</th>
                        <th className="pb-2 pr-3">Type</th>
                        <th className="pb-2 text-right">MRC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-body text-sm">
                      {parsed.slice(0, 100).map((row, i) => {
                        const match = region ? findMatch(row.btsName) : null;
                        return (
                          <tr key={i} className={cn('hover:bg-surface-container-lowest', !match && 'bg-yellow-50/50')}>
                            <td className="py-2 pr-3 font-mono text-[10px] text-on-surface-variant">{row.serialNumber}</td>
                            <td className="py-2 pr-3 font-medium text-primary whitespace-nowrap max-w-[160px] truncate">
                              {row.customerName}
                            </td>
                            <td className="py-2 pr-3 font-mono text-[10px]">{row.btsName}</td>
                            <td className="py-2 pr-3">
                              {match ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full text-[9px] font-mono font-bold">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  {match}
                                </span>
                              ) : region ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded-full text-[9px] font-mono font-bold">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Unmatched
                                </span>
                              ) : (
                                <span className="text-on-surface-variant/40 font-mono text-[9px]">—</span>
                              )}
                            </td>
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
                        );
                      })}
                    </tbody>
                  </table>
                  {parsed.length > 100 && (
                    <p className="font-mono text-[10px] text-on-surface-variant/60 text-center py-3">
                      Showing 100 of {parsed.length} records
                    </p>
                  )}
                </div>
              )}
            </SectionCard>

            {result && siteSummaries.length > 0 && (
              <SectionCard>
                <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">
                  Site Summary ({siteSummaries.length}) — {result.region}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                        <th className="pb-3 pr-4">CSV Site Name</th>
                        <th className="pb-3 pr-4">Matched To</th>
                        <th className="pb-3 px-4 text-right">Total</th>
                        <th className="pb-3 px-4 text-right">Active</th>
                        <th className="pb-3 pl-4 text-right">MRR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {siteSummaries.map((site, i) => (
                        <tr
                          key={i}
                          className={cn('hover:bg-surface-container-lowest', site.matchStatus === 'unmatched' && 'bg-yellow-50/50')}
                        >
                          <td className="py-2.5 pr-4 font-bold text-primary">{site.btsName}</td>
                          <td className="py-2.5 pr-4">
                            {site.matchedBtsName ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded-full text-[9px] font-mono font-bold">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {site.matchedBtsName}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-full text-[9px] font-mono font-bold">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Unmatched
                              </span>
                            )}
                            {site.region && <span className="text-on-surface-variant ml-1 font-mono text-[9px]">({site.region})</span>}
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
        </div>

        <SectionCard className="mb-12">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-6">Import History</h3>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-on-surface-variant" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-mono text-[10px] text-on-surface-variant/40 uppercase font-bold">No imports yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/80 font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                    <th className="pb-3 pr-4">Date</th>
                    <th className="pb-3 pr-4">Region</th>
                    <th className="pb-3 px-4 text-right">Customers</th>
                    <th className="pb-3 px-4 text-right">Sites</th>
                    <th className="pb-3 px-4 text-right">Matched</th>
                    <th className="pb-3 pl-4">Batch ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {history.map((b, i) => (
                    <tr key={i} className="hover:bg-surface-container-lowest">
                      <td className="py-2.5 pr-4 font-mono text-[10px] text-on-surface-variant">
                        {new Date(b.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="px-2 py-0.5 bg-secondary/10 text-secondary rounded-full text-[9px] font-mono font-bold">
                          {b.region}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">{b.customerCount}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{b.siteCount}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-green-600">{b.matchedCount}</td>
                      <td className="py-2.5 pl-4 font-mono text-[9px] text-on-surface-variant/60 truncate max-w-[200px]">{b.batchId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </SalesLayout>
  );
}
