'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { cn, toLocalDateString } from '@/lib/utils';
import { iconToneClass } from '@/lib/icon-tone';
import { Input } from '@/components/ui/input';
import { MobileToolbar } from '@/components/admin/MobileToolbar';
import { TowerCard, towerNeedsAttention } from '@/components/admin/TowerCard';
import { TowerComparison } from '@/components/admin/TowerComparison';
import { TowerDetailPanel } from '@/components/admin/TowerDetailPanel';
import {
  Loader2,
  Search,
  Wifi,
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  RadioTower,
  RefreshCw,
  TrendingUp,
  ArrowUpDown,
  ChevronDown,
  Zap,
  GitCompareArrows,
  FileText,
  X,
  ArrowUp,
  ArrowDown,
  ChevronRight,
} from 'lucide-react';

interface TowerAuditRow {
  towerId: string;
  towerName: string;
  region: string;
  status: string | null;
  suspended: boolean | null;
  deviceCount: number | null;
  deviceOutageCount: number | null;
  lastSyncAt: number | null;
  rosterSyncAt?: number | null;
  customers: {
    total: number;
    active: number;
    byAccountType: Record<string, number>;
    byServicePlan: Record<string, number>;
    customerDetails: CustomerAuditDetail[];
  };
  mrrTotal: number;
  activeMrr: number;
  mrrByAccountType: Record<string, number>;
  activeMrrByAccountType: Record<string, number>;
}

interface CustomerAuditDetail {
  customerId: string | null;
  customerName: string | null;
  lifecycle: string | null;
  accountType: string;
  servicePlan: string | null;
  potentialMrr: number;
  activeMrr: number;
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border', className)}>{children}</div>;
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <SectionCard className="flex items-center gap-4 p-5">
      <Icon className={cn('size-5 shrink-0', iconToneClass(color))} aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-headline text-lg font-semibold tabular-nums break-words xl:text-xl" title={value}>
          {value}
        </p>
      </div>
    </SectionCard>
  );
}

function fmtNaira(amount: number) {
  if (amount >= 1000000) return '₦' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '₦' + (amount / 1000).toFixed(1) + 'K';
  return '₦' + amount.toLocaleString();
}

function fmtExactNaira(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

function accountLabel(key: string): string {
  if (key === 'NEIGHBOURHOOD') return 'Residential';
  if (key === 'PARTNERS_HOSTS') return 'Partners';
  if (key === 'BUNDLED') return 'Bundled';
  if (key === 'OTHER') return 'Other';
  return key;
}

function relTime(ms: number | null): string {
  if (!ms) return '—';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type SortField = 'name' | 'customers' | 'mrr' | 'activeMrr' | 'lastSync' | 'outages' | 'health';
type SortDir = 'asc' | 'desc';

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'lastSync', label: 'Last Sync' },
  { value: 'name', label: 'Name' },
  { value: 'customers', label: 'Customers' },
  { value: 'mrr', label: 'MRR' },
  { value: 'activeMrr', label: 'Active MRR' },
  { value: 'outages', label: 'Device Outages' },
  { value: 'health', label: 'Health Score' },
];

// Calculate health score (same as TowerCard). Sync health tracks the live
// customer roster, not the frozen UISP device clock (see devices banner).
function calculateHealthScore(tower: TowerAuditRow): number {
  const deviceUptime =
    tower.deviceCount && tower.deviceCount > 0 ? ((tower.deviceCount - (tower.deviceOutageCount ?? 0)) / tower.deviceCount) * 100 : 100;
  const mrrUtilization = tower.mrrTotal > 0 ? (tower.activeMrr / tower.mrrTotal) * 100 : 100;
  let syncScore = 100;
  const syncClock = tower.rosterSyncAt ?? tower.lastSyncAt;
  if (syncClock) {
    const mins = Math.floor((Date.now() - syncClock) / 60000);
    if (mins < 60) syncScore = 100;
    else if (mins < 360) syncScore = 75;
    else if (mins < 1440) syncScore = 50;
    else if (mins < 10080) syncScore = 25;
    else syncScore = 0;
  }
  const statusScore = tower.status === 'active' ? 100 : tower.status === null ? 50 : 0;
  return Math.round(deviceUptime * 0.4 + mrrUtilization * 0.3 + syncScore * 0.2 + statusScore * 0.1);
}

export default function BtsAuditPage() {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [towers, setTowers] = useState<TowerAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>('lastSync');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [devicesMeta, setDevicesMeta] = useState<{ devicesSyncAt: number | null; devicesStale: boolean; uispConfigured: boolean } | null>(
    null,
  );
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  const fetchAudit = useCallback(async () => {
    if (authLoading) return;
    if (!user || !user.emailVerified) return;
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/bts/audit?includeEmpty=${includeEmpty}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Failed: ${res.statusText}`);
      setTowers((result.data?.towers as TowerAuditRow[]) || []);
      setDevicesMeta((result.data?.meta as { devicesSyncAt: number | null; devicesStale: boolean; uispConfigured: boolean }) || null);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching tower audit');
    } finally {
      setLoading(false);
    }
  }, [user, authLoading, includeEmpty]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const [selected, setSelected] = useState<TowerAuditRow | null>(null);

  // Focus trap for modal
  useEffect(() => {
    if (selected && modalRef.current) {
      modalRef.current.focus();
    }
  }, [selected]);

  // Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected) {
        setSelected(null);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [selected]);

  // Close sort menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search + Attention filter
  const searched = useMemo(() => {
    let result = towers;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((t) => t.towerName.toLowerCase().includes(s) || t.region.toLowerCase().includes(s));
    }
    if (attentionOnly) {
      result = result.filter(towerNeedsAttention);
    }
    return result;
  }, [towers, search, attentionOnly]);

  // Sort
  const filtered = useMemo(() => {
    const sorted = [...searched];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.towerName.localeCompare(b.towerName);
          break;
        case 'customers':
          cmp = (a.customers.total ?? 0) - (b.customers.total ?? 0);
          break;
        case 'mrr':
          cmp = (a.mrrTotal ?? 0) - (b.mrrTotal ?? 0);
          break;
        case 'activeMrr':
          cmp = (a.activeMrr ?? 0) - (b.activeMrr ?? 0);
          break;
        case 'lastSync':
          cmp = (a.rosterSyncAt ?? a.lastSyncAt ?? 0) - (b.rosterSyncAt ?? b.lastSyncAt ?? 0);
          break;
        case 'outages':
          cmp = (a.deviceOutageCount ?? 0) - (b.deviceOutageCount ?? 0);
          break;
        case 'health':
          cmp = calculateHealthScore(a) - calculateHealthScore(b);
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [searched, sortField, sortDir]);

  // KPIs
  const kpis = useMemo(() => {
    const src = filtered;
    const totalCustomers = src.reduce((acc, t) => acc + t.customers.total, 0);
    const activeCustomers = src.reduce((acc, t) => acc + t.customers.active, 0);
    const potentialMrr = src.reduce((acc, t) => acc + t.mrrTotal, 0);
    const activeMrr = src.reduce((acc, t) => acc + t.activeMrr, 0);
    const opportunity = potentialMrr - activeMrr;
    const attentionCount = src.filter(towerNeedsAttention).length;
    return { totalCustomers, activeCustomers, totalMrr: potentialMrr, activeMrr, opportunity, attentionCount, towers: src.length };
  }, [filtered]);

  // Alert level
  const alertLevel = useMemo(() => {
    const criticalCount = towers.filter(
      (t) => t.status === 'disabled' || t.status === 'down' || (t.deviceOutageCount != null && t.deviceOutageCount > 5),
    ).length;
    // Device-telemetry staleness is reported by the devices banner, not as a
    // per-tower warning — the roster clock is the warning signal here.
    const warningCount = towers.filter((t) => {
      const rosterClock = t.rosterSyncAt ?? t.lastSyncAt;
      return (rosterClock && Date.now() - rosterClock > 86400000) || t.suspended;
    }).length;
    if (criticalCount > 0)
      return {
        level: 'critical' as const,
        count: criticalCount,
        message: `${criticalCount} tower${criticalCount > 1 ? 's' : ''} with critical issues`,
      };
    if (warningCount > 0)
      return {
        level: 'warning' as const,
        count: warningCount,
        message: `${warningCount} tower${warningCount > 1 ? 's' : ''} with warnings`,
      };
    return { level: 'healthy' as const, count: 0, message: 'All towers healthy' };
  }, [towers]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const toggleCompare = useCallback(
    (tower: TowerAuditRow) => {
      setCompareIds((prev) => {
        const next = new Set(prev);
        if (next.has(tower.towerId)) {
          next.delete(tower.towerId);
        } else if (next.size < 3) {
          next.add(tower.towerId);
        } else {
          showToast('Maximum 3 towers for comparison', 'error');
        }
        return next;
      });
    },
    [showToast],
  );

  const compareTowers = useMemo(() => {
    return towers.filter((t) => compareIds.has(t.towerId));
  }, [towers, compareIds]);

  const exportCsv = () => {
    try {
      const rows = [
        [
          'Tower',
          'Region',
          'Total Customers',
          'Active',
          'Potential MRC',
          'Active MRC',
          'Opportunity',
          'By AccountType (Potential)',
          'By AccountType (Active)',
          'By ServicePlan',
          'Customer MRR',
        ],
      ];
      filtered.forEach((t) =>
        rows.push([
          t.towerName,
          t.region,
          String(t.customers.total),
          String(t.customers.active),
          String(t.mrrTotal),
          String(t.activeMrr),
          String(t.mrrTotal - t.activeMrr),
          JSON.stringify(t.mrrByAccountType),
          JSON.stringify(t.activeMrrByAccountType),
          JSON.stringify((t.customers as unknown as { byServicePlan: Record<string, number> }).byServicePlan || {}),
          JSON.stringify(
            t.customers.customerDetails.map((customer) => ({
              customerId: customer.customerId,
              customerName: customer.customerName,
              lifecycle: customer.lifecycle,
              accountType: customer.accountType,
              servicePlan: customer.servicePlan,
              potentialMrr: customer.potentialMrr,
              activeMrr: customer.activeMrr,
            })),
          ),
        ]),
      );
      const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bts-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${filtered.length} towers to CSV`);
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  const exportReport = () => {
    try {
      const sortedByMrr = [...filtered].sort((a, b) => b.mrrTotal - a.mrrTotal);
      const top10 = sortedByMrr.slice(0, 10);
      const bottom10 = sortedByMrr.slice(-10).reverse();
      const attentionTowers = filtered.filter(towerNeedsAttention);
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const lines: string[] = [];
      lines.push('BTS AUDIT REPORT');
      lines.push(`Generated: ${dateStr}`);
      lines.push(`Filter: ${search || 'All'}, Attention only: ${attentionOnly}`);
      lines.push('');
      lines.push('=== SUMMARY ===');
      lines.push(`Towers: ${kpis.towers}`);
      lines.push(`Total Customers: ${kpis.totalCustomers}`);
      lines.push(`Active Customers: ${kpis.activeCustomers}`);
      lines.push(`Potential MRC: ${fmtNaira(kpis.totalMrr)}`);
      lines.push(`Active MRC: ${fmtNaira(kpis.activeMrr)}`);
      lines.push(`Revenue Opportunity: ${fmtNaira(kpis.opportunity)}`);
      lines.push(`Needs Attention: ${kpis.attentionCount}`);
      lines.push(
        `Avg Health: ${filtered.length > 0 ? Math.round(filtered.reduce((acc, t) => acc + calculateHealthScore(t), 0) / filtered.length) : 0}`,
      );
      lines.push('');
      lines.push('=== TOP 10 TOWERS BY MRR ===');
      lines.push('Tower,Region,Customers,Active,MRR,Active MRR,Health');
      top10.forEach((t) => {
        lines.push(
          `${t.towerName},${t.region},${t.customers.total},${t.customers.active},${t.mrrTotal},${t.activeMrr},${calculateHealthScore(t)}`,
        );
      });
      lines.push('');
      lines.push('=== BOTTOM 10 TOWERS BY MRR ===');
      lines.push('Tower,Region,Customers,Active,MRR,Active MRR,Health');
      bottom10.forEach((t) => {
        lines.push(
          `${t.towerName},${t.region},${t.customers.total},${t.customers.active},${t.mrrTotal},${t.activeMrr},${calculateHealthScore(t)}`,
        );
      });
      if (attentionTowers.length > 0) {
        lines.push('');
        lines.push(`=== TOWERS NEEDING ATTENTION (${attentionTowers.length}) ===`);
        lines.push('Tower,Region,Status,Devices,Outages,Roster Sync,Devices Sync');
        attentionTowers.forEach((t) => {
          const roster = t.rosterSyncAt ?? t.lastSyncAt;
          lines.push(
            `${t.towerName},${t.region},${t.status || 'unknown'},${t.deviceCount ?? 0},${t.deviceOutageCount ?? 0},${roster ? relTime(roster) : '—'},${t.lastSyncAt ? relTime(t.lastSyncAt) : '—'}`,
          );
        });
      }
      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bts-audit-report-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report exported successfully');
    } catch {
      showToast('Failed to export report', 'error');
    }
  };

  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">BTS Audit</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 text-on-surface-variant/60">
              Live per-tower audit &mdash; computed from UISP sites and the unified customer roster
            </p>
          </div>
          <MobileToolbar
            primary={
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tower or region..."
                  className="w-64 pl-9 rounded-xl font-mono text-xs"
                  aria-label="Search towers by name or region"
                />
              </div>
            }
            secondary={
              <div className="flex items-center gap-3">
                {/* Sort Dropdown */}
                <div className="relative" ref={sortMenuRef}>
                  <button
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-low border border-border/40 font-mono text-[10px] uppercase font-bold text-on-surface-variant/70 hover:bg-surface-container transition-colors"
                    aria-label={`Sort by ${SORT_OPTIONS.find((o) => o.value === sortField)?.label}`}
                    aria-expanded={showSortMenu}
                    aria-haspopup="listbox"
                  >
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                    {SORT_OPTIONS.find((o) => o.value === sortField)?.label}
                    <ChevronDown className={cn('w-3 h-3 transition-transform', showSortMenu && 'rotate-180')} aria-hidden="true" />
                  </button>
                  {showSortMenu && (
                    <div
                      className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-border shadow-lg z-50 py-1"
                      role="listbox"
                      aria-label="Sort options"
                    >
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            if (sortField === option.value) {
                              setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
                            } else {
                              setSortField(option.value);
                              setSortDir(option.value === 'name' ? 'asc' : 'desc');
                            }
                            setShowSortMenu(false);
                          }}
                          className={cn(
                            'w-full px-3 py-2 text-left font-mono text-xs hover:bg-surface-container-low transition-colors flex items-center justify-between',
                            sortField === option.value && 'bg-surface-container-low font-bold text-primary',
                          )}
                          role="option"
                          aria-selected={sortField === option.value}
                        >
                          <span>{option.label}</span>
                          {sortField === option.value && (
                            <span className="text-[9px] text-on-surface-variant/50">
                              {sortDir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Attention Filter */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={attentionOnly}
                    onChange={(e) => setAttentionOnly(e.target.checked)}
                    className="w-4 h-4 rounded accent-secondary"
                    aria-label="Show only towers needing attention"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/70">Attention</span>
                </label>

                {/* Show Empty */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeEmpty}
                    onChange={(e) => setIncludeEmpty(e.target.checked)}
                    className="w-4 h-4 rounded accent-secondary"
                    aria-label="Show empty towers"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/70">Empty</span>
                </label>

                {/* Refresh */}
                <button
                  onClick={fetchAudit}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-low border border-border/40 font-mono text-[10px] uppercase font-bold text-on-surface-variant/70 hover:bg-surface-container transition-colors disabled:opacity-50"
                  aria-label="Refresh tower data"
                >
                  <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} aria-hidden="true" />
                  Refresh
                </button>
              </div>
            }
            label="Options"
          />
        </header>

        {/* Alert Banner */}
        {alertLevel.level !== 'healthy' && !loading && (
          <div
            className={cn(
              'mb-6 px-4 py-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors',
              alertLevel.level === 'critical'
                ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
            )}
            onClick={() => {
              setAttentionOnly(true);
              // The grid sits far below the banner — scroll it into view so the
              // filter visibly takes effect instead of appearing dead.
              requestAnimationFrame(() => {
                document.getElementById('tower-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              });
            }}
            role="alert"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              <span className="font-mono text-xs font-bold">{alertLevel.message}</span>
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase font-bold opacity-70">
              Show affected <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        )}
        {alertLevel.level === 'healthy' && !loading && (
          <div className="mb-6 px-4 py-3 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-700 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
            <span className="font-mono text-xs font-bold">{alertLevel.message}</span>
          </div>
        )}

        {/* Device-telemetry banner: UISP device data is frozen while the UISP
            sync has no API token. Customer roster/MRR cards stay live via the
            Splynx sync — this banner says so instead of flagging all towers. */}
        {devicesMeta?.devicesStale &&
          !loading &&
          (() => {
            const rosterSyncAt = towers.reduce<number | null>((max, t) => {
              const c = t.rosterSyncAt ?? t.lastSyncAt;
              return c != null && (max == null || c > max) ? c : max;
            }, null);
            return (
              <div className="mb-6 px-4 py-3 rounded-xl border bg-sky-50 border-sky-200 text-sky-800 flex items-center gap-3">
                <Wifi className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="font-mono text-xs font-bold">
                  Device telemetry frozen since {relTime(devicesMeta.devicesSyncAt)}
                  {devicesMeta.uispConfigured ? ' — UISP sync is delayed.' : ' — UISP API token not configured.'} Customer roster is live
                  {rosterSyncAt ? ` (updated ${relTime(rosterSyncAt)})` : ''}.
                </span>
              </div>
            );
          })()}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <KpiCard label="Towers" value={kpis.towers.toLocaleString()} icon={RadioTower} color="bg-secondary" />
          <KpiCard label="Total Customers" value={kpis.totalCustomers.toLocaleString()} icon={Users} color="bg-sky-500" />
          <KpiCard label="Active" value={kpis.activeCustomers.toLocaleString()} icon={CheckCircle2} color="bg-emerald-500" />
          <KpiCard
            label="Needs Attention"
            value={kpis.attentionCount.toLocaleString()}
            icon={Zap}
            color={kpis.attentionCount > 0 ? 'bg-red-500' : 'bg-emerald-500'}
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <KpiCard label="Potential MRC" value={fmtNaira(kpis.totalMrr)} icon={DollarSign} color="bg-slate-700" />
          <KpiCard label="Active MRC" value={fmtNaira(kpis.activeMrr)} icon={DollarSign} color="bg-emerald-600" />
          <KpiCard label="Revenue Opportunity" value={fmtNaira(kpis.opportunity)} icon={TrendingUp} color="bg-orange-500" />
          <KpiCard
            label="Avg Health"
            value={
              filtered.length > 0 ? `${Math.round(filtered.reduce((acc, t) => acc + calculateHealthScore(t), 0) / filtered.length)}` : '—'
            }
            icon={CheckCircle2}
            color="bg-indigo-500"
          />
        </div>

        {/* Export + Compare */}
        <div className="flex items-center justify-between mb-4">
          <div>
            {compareIds.size > 0 && (
              <button
                onClick={() => setShowComparison(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold hover:bg-secondary/90 transition-colors"
              >
                <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
                Compare ({compareIds.size})
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportReport}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-container-low border border-border/40 font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              Export Report
            </button>
            <button
              onClick={exportCsv}
              className="px-4 py-2 rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold hover:bg-secondary/90 transition-colors"
              aria-label={`Export ${filtered.length} towers to CSV`}
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <SectionCard className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" aria-hidden="true" />
            <span className="sr-only">Loading tower data...</span>
          </SectionCard>
        ) : error ? (
          <SectionCard className="flex flex-col items-center justify-center h-64 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mb-3" aria-hidden="true" />
            <p className="font-mono text-[11px] text-on-surface-variant uppercase font-bold tracking-widest">{error}</p>
            <button
              onClick={fetchAudit}
              className="mt-4 px-4 py-2 rounded-xl bg-surface-container-low border border-border/40 font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Try Again
            </button>
          </SectionCard>
        ) : filtered.length === 0 ? (
          <SectionCard className="flex flex-col items-center justify-center h-64 text-center">
            <Wifi className="w-10 h-10 text-on-surface-variant/20 mb-3" aria-hidden="true" />
            <p className="font-mono text-[11px] text-on-surface-variant/60 uppercase font-bold tracking-widest">
              {attentionOnly ? 'No towers need attention' : 'No towers match the current search'}
            </p>
          </SectionCard>
        ) : (
          <div
            id="tower-grid"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5 scroll-mt-4"
            role="list"
            aria-label="Tower list"
          >
            {filtered.map((t) => (
              <div key={t.towerId} role="listitem">
                <TowerCard tower={t} onClick={setSelected} isComparing={compareIds.has(t.towerId)} onCompareToggle={toggleCompare} />
              </div>
            ))}
          </div>
        )}

        {/* Detail Panel (redesigned with tabs, sparklines, timeline) */}
        {selected && <TowerDetailPanel tower={selected} onClose={() => setSelected(null)} />}

        {/* Comparison Modal */}
        {showComparison && compareTowers.length >= 2 && <TowerComparison towers={compareTowers} onClose={() => setShowComparison(false)} />}

        {/* Toast Notification */}
        {toast && (
          <div
            className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-mono text-sm font-bold text-white transition-all"
            style={{ backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444' }}
            role="alert"
            aria-live="polite"
          >
            {toast.message}
          </div>
        )}
      </div>
    </SalesLayout>
  );
}
