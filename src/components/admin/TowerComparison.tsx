'use client';

import React from 'react';
import { cn, toLocalDateString } from '@/lib/utils';
import { X, ArrowUp, ArrowDown, Minus, Wifi, WifiOff, Clock3, Shield } from 'lucide-react';

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
  };
  mrrTotal: number;
  activeMrr: number;
  mrrByAccountType: Record<string, number>;
  activeMrrByAccountType: Record<string, number>;
}

function fmtNaira(amount: number) {
  if (amount >= 1000000) return '₦' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '₦' + (amount / 1000).toFixed(1) + 'K';
  return '₦' + amount.toLocaleString();
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

function syncFreshness(ms: number | null): string {
  if (!ms) return 'Unknown';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 60) return 'Fresh';
  if (mins < 1440) return 'Aging';
  return 'Stale';
}

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

function accountLabel(key: string): string {
  if (key === 'NEIGHBOURHOOD') return 'Residential';
  if (key === 'PARTNERS_HOSTS') return 'Partners';
  if (key === 'BUNDLED') return 'Bundled';
  if (key === 'OTHER') return 'Other';
  return key;
}

type DeltaDirection = 'up' | 'down' | 'same';

function DeltaIndicator({ a, b, higherIsBetter = true }: { a: number; b: number; higherIsBetter?: boolean }) {
  if (a === b) return <Minus className="w-3 h-3 text-on-surface-variant/40" />;
  const isBetter = higherIsBetter ? a > b : a < b;
  return isBetter ? <ArrowUp className="w-3 h-3 text-emerald-500" /> : <ArrowDown className="w-3 h-3 text-red-500" />;
}

function ComparisonRow({
  label,
  a,
  b,
  format,
  higherIsBetter = true,
}: {
  label: string;
  a: number;
  b: number;
  format?: (v: number) => string;
  higherIsBetter?: boolean;
}) {
  const fmt = format || ((v: number) => v.toLocaleString());
  return (
    <tr className="border-b border-border/50">
      <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/60">{label}</td>
      <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{fmt(a)}</td>
      <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{fmt(b)}</td>
      <td className="px-4 py-3 text-center">
        <DeltaIndicator a={a} b={b} higherIsBetter={higherIsBetter} />
      </td>
    </tr>
  );
}

interface TowerComparisonProps {
  towers: TowerAuditRow[];
  onClose: () => void;
}

export function TowerComparison({ towers, onClose }: TowerComparisonProps) {
  if (towers.length < 2) return null;
  const [a, b] = towers;
  const healthA = calculateHealthScore(a);
  const healthB = calculateHealthScore(b);
  const oppA = a.mrrTotal - a.activeMrr;
  const oppB = b.mrrTotal - b.activeMrr;
  const freshnessA = syncFreshness(a.rosterSyncAt ?? a.lastSyncAt);
  const freshnessB = syncFreshness(b.rosterSyncAt ?? b.lastSyncAt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tower comparison"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-border/60 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-display font-bold text-lg uppercase">Tower Comparison</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/60">{towers.length} towers selected</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors"
            aria-label="Close comparison"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/80">
                <th className="px-4 py-3 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant w-1/4"></th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest font-bold text-primary">
                  {a.towerName}
                  <p className="text-[9px] text-on-surface-variant/60 mt-0.5">{a.region}</p>
                </th>
                <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest font-bold text-primary">
                  {b.towerName}
                  <p className="text-[9px] text-on-surface-variant/60 mt-0.5">{b.region}</p>
                </th>
                <th className="px-4 py-3 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant text-center w-16">
                  Better
                </th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow label="Customers" a={a.customers.total} b={b.customers.total} />
              <ComparisonRow label="Active" a={a.customers.active} b={b.customers.active} />
              <ComparisonRow label="MRR" a={a.mrrTotal} b={b.mrrTotal} format={fmtNaira} />
              <ComparisonRow label="Active MRR" a={a.activeMrr} b={b.activeMrr} format={fmtNaira} />
              <ComparisonRow label="Opportunity" a={oppA} b={oppB} format={fmtNaira} higherIsBetter={false} />
              <ComparisonRow label="Health" a={healthA} b={healthB} />
              <ComparisonRow label="Devices" a={a.deviceCount ?? 0} b={b.deviceCount ?? 0} />
              <ComparisonRow label="Outages" a={a.deviceOutageCount ?? 0} b={b.deviceOutageCount ?? 0} higherIsBetter={false} />

              {/* Sync freshness row */}
              <tr className="border-b border-border/50">
                <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/60">
                  Last Sync
                </td>
                <td className="px-4 py-3 font-mono text-xs font-bold text-primary">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        freshnessA === 'Fresh' ? 'bg-emerald-500' : freshnessA === 'Aging' ? 'bg-amber-500' : 'bg-red-500',
                      )}
                    />
                    {relTime(a.rosterSyncAt ?? a.lastSyncAt)}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs font-bold text-primary">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        freshnessB === 'Fresh' ? 'bg-emerald-500' : freshnessB === 'Aging' ? 'bg-amber-500' : 'bg-red-500',
                      )}
                    />
                    {relTime(b.rosterSyncAt ?? b.lastSyncAt)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {freshnessA === freshnessB ? (
                    <Minus className="w-3 h-3 text-on-surface-variant/40" />
                  ) : freshnessA === 'Fresh' ? (
                    <ArrowUp className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                </td>
              </tr>

              {/* Status row */}
              <tr className="border-b border-border/50">
                <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/60">Status</td>
                <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{a.status || 'unknown'}</td>
                <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{b.status || 'unknown'}</td>
                <td className="px-4 py-3 text-center">
                  {a.status === b.status ? (
                    <Minus className="w-3 h-3 text-on-surface-variant/40" />
                  ) : a.status === 'active' ? (
                    <ArrowUp className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <ArrowDown className="w-3 h-3 text-red-500" />
                  )}
                </td>
              </tr>

              {/* Account type rows */}
              {(() => {
                const allTypes = new Set([...Object.keys(a.customers.byAccountType), ...Object.keys(b.customers.byAccountType)]);
                return Array.from(allTypes).map((type) => (
                  <tr key={type} className="border-b border-border/50">
                    <td className="px-4 py-3 font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/60">
                      {accountLabel(type)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">
                      {a.customers.byAccountType[type] ?? 0} · {fmtNaira(a.mrrByAccountType[type] ?? 0)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">
                      {b.customers.byAccountType[type] ?? 0} · {fmtNaira(b.mrrByAccountType[type] ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <DeltaIndicator a={a.customers.byAccountType[type] ?? 0} b={b.customers.byAccountType[type] ?? 0} />
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-border/60 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-container-low border border-border/40 font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
