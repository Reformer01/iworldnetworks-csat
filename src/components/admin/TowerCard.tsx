'use client';

import React from 'react';
import { cn, toLocalDateString } from '@/lib/utils';
import { Wifi, WifiOff, AlertTriangle, Pause, Clock3, Radio, TrendingUp, ArrowUpRight } from 'lucide-react';

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
    customerDetails: Array<{
      customerId: string | null;
      customerName: string | null;
      lifecycle: string | null;
      accountType: string;
      servicePlan: string | null;
      potentialMrr: number;
      activeMrr: number;
    }>;
  };
  mrrTotal: number;
  activeMrr: number;
  mrrByAccountType: Record<string, number>;
  activeMrrByAccountType: Record<string, number>;
}

function fmtNaira(amount: number) {
  if (amount >= 1000000) return '₦' + (amount / 1000000).toFixed(1) + 'M';
  if (amount >= 1000) return '₦' + (amount / 1000).toFixed(0) + 'K';
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

function accountLabel(key: string): string {
  if (key === 'NEIGHBOURHOOD') return 'Residential';
  if (key === 'PARTNERS_HOSTS') return 'Partners';
  if (key === 'BUNDLED') return 'Bundled';
  if (key === 'OTHER') return 'Other';
  return key;
}

/** Display clock: the live customer roster first, UISP device clock as fallback. */
export function towerSyncClock(tower: Pick<TowerAuditRow, 'rosterSyncAt' | 'lastSyncAt'>): number | null {
  return tower.rosterSyncAt ?? tower.lastSyncAt;
}

export function towerDevicesStale(tower: Pick<TowerAuditRow, 'lastSyncAt'>, now = Date.now()): boolean {
  return !!tower.lastSyncAt && now - tower.lastSyncAt > 86400000;
}

function calculateHealthScore(tower: TowerAuditRow): number {
  const deviceUptime =
    tower.deviceCount && tower.deviceCount > 0 ? ((tower.deviceCount - (tower.deviceOutageCount ?? 0)) / tower.deviceCount) * 100 : 100;
  const mrrUtilization = tower.mrrTotal > 0 ? (tower.activeMrr / tower.mrrTotal) * 100 : 100;
  let syncScore = 100;
  const syncClock = towerSyncClock(tower);
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

function getAttentionReasons(tower: TowerAuditRow): Array<{ icon: React.ElementType; text: string; tone: 'red' | 'amber' }> {
  const reasons: Array<{ icon: React.ElementType; text: string; tone: 'red' | 'amber' }> = [];
  if (tower.deviceOutageCount != null && tower.deviceOutageCount > 0) {
    reasons.push({ icon: WifiOff, text: `${tower.deviceOutageCount} device${tower.deviceOutageCount > 1 ? 's' : ''} down`, tone: 'red' });
  }
  if (tower.status === 'disabled' || tower.status === 'down') {
    reasons.push({ icon: AlertTriangle, text: 'Tower down', tone: 'red' });
  }
  if (tower.suspended) {
    reasons.push({ icon: Pause, text: 'Suspended', tone: 'red' });
  }
  const rosterClock = towerSyncClock(tower);
  if (rosterClock) {
    const mins = Math.floor((Date.now() - rosterClock) / 60000);
    if (mins > 1440) {
      reasons.push({ icon: Clock3, text: 'Stale roster', tone: 'amber' });
    }
  }
  if (towerDevicesStale(tower)) {
    reasons.push({ icon: WifiOff, text: 'Devices stale', tone: 'amber' });
  }
  return reasons;
}

export function towerNeedsAttention(tower: TowerAuditRow): boolean {
  return getAttentionReasons(tower).length > 0;
}

interface TowerCardProps {
  tower: TowerAuditRow;
  onClick: (tower: TowerAuditRow) => void;
  showHealth?: boolean;
  isComparing?: boolean;
  onCompareToggle?: (tower: TowerAuditRow) => void;
}

export function TowerCard({ tower, onClick, showHealth = true, isComparing = false, onCompareToggle }: TowerCardProps) {
  const mrrPercentage = tower.mrrTotal > 0 ? Math.round((tower.activeMrr / tower.mrrTotal) * 100) : 0;
  const healthScore = calculateHealthScore(tower);
  const attentionReasons = getAttentionReasons(tower);
  const opportunity = tower.mrrTotal - tower.activeMrr;
  const hasAttention = attentionReasons.length > 0;

  // Top 3 account types by count
  const topAccounts = Object.entries(tower.customers.byAccountType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const totalCustomers = tower.customers.total || 1;

  return (
    <div className="relative">
      {/* Compare checkbox */}
      {onCompareToggle && (
        <div className="absolute top-3 left-3 z-10">
          <label className="flex items-center gap-1.5 cursor-pointer select-none" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isComparing}
              onChange={() => onCompareToggle(tower)}
              className="w-3.5 h-3.5 rounded accent-primary"
              aria-label={`Select ${tower.towerName} for comparison`}
            />
            <span className="font-mono text-[8px] uppercase tracking-wider font-semibold text-on-surface-variant/40">Compare</span>
          </label>
        </div>
      )}

      <button
        onClick={() => onClick(tower)}
        className={cn(
          'w-full text-left bg-white rounded-xl border border-border/60 p-5',
          'hover:shadow-md hover:border-primary/30 transition-all',
          'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2',
          isComparing && 'ring-2 ring-primary/40 ring-offset-2',
        )}
        aria-label={`${tower.towerName} tower in ${tower.region}. ${tower.customers.total} customers, ${fmtNaira(tower.mrrTotal)} MRR.`}
      >
        {/* ─── Header: Name + Region ─── */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Radio className="w-3.5 h-3.5 text-primary shrink-0" />
              <h3 className="font-display font-bold text-primary text-[13px] uppercase tracking-tight truncate">{tower.towerName}</h3>
            </div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant/50 ml-[22px]">{tower.region}</p>
          </div>
          {showHealth && (
            <div
              className={cn(
                'shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-mono text-[10px] font-bold',
                healthScore >= 80
                  ? 'bg-primary/10 text-primary'
                  : healthScore >= 50
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-red-50 text-red-700',
              )}
              title={`Health: ${healthScore}/100`}
            >
              {healthScore}
            </div>
          )}
        </div>

        {/* ─── Alert Badges ─── */}
        {hasAttention && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {attentionReasons.map((reason, i) => {
              const Icon = reason.icon;
              return (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-semibold',
                    reason.tone === 'red' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {reason.text}
                </span>
              );
            })}
          </div>
        )}

        {/* ─── Core Metrics ─── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest font-semibold text-on-surface-variant/50 mb-1">Customers</p>
            <p className="font-display text-xl font-bold text-primary leading-none mb-0.5">{tower.customers.total}</p>
            <div className="flex items-center gap-1">
              <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500" />
              <span className="font-mono text-[9px] text-emerald-600 font-semibold">{tower.customers.active} active</span>
            </div>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest font-semibold text-on-surface-variant/50 mb-1">MRR</p>
            <p className="font-display text-xl font-bold text-primary leading-none mb-0.5">{fmtNaira(tower.mrrTotal)}</p>
            <div className="flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-emerald-500" />
              <span className="font-mono text-[10px] text-emerald-600 font-bold">{fmtNaira(tower.activeMrr)} active</span>
            </div>
          </div>
        </div>

        {/* ─── Utilization Bar ─── */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest font-semibold text-on-surface-variant/50">Utilization</span>
            <span className="font-mono text-[10px] font-bold text-primary">{mrrPercentage}%</span>
          </div>
          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                mrrPercentage >= 80 ? 'bg-primary' : mrrPercentage >= 50 ? 'bg-amber-400' : 'bg-red-400',
              )}
              style={{ width: `${mrrPercentage}%` }}
            />
          </div>
        </div>

        {/* ─── Revenue Opportunity ─── */}
        {opportunity > 0 && (
          <div className="flex items-center justify-between mb-4 px-3 py-2 bg-primary/5 rounded-lg border border-primary/10">
            <span className="font-mono text-[9px] uppercase tracking-widest font-semibold text-primary/70">Revenue Gap</span>
            <span className="font-mono text-[10px] font-bold text-primary">{fmtNaira(opportunity)}</span>
          </div>
        )}

        {/* ─── Devices + Sync ─── */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Wifi className={cn('w-3.5 h-3.5', (tower.deviceOutageCount ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500')} />
            <div>
              <p className="font-mono text-[8px] uppercase tracking-widest text-on-surface-variant/40">Devices</p>
              <p className="font-mono text-[10px] font-semibold text-on-surface-variant/70">
                {tower.deviceCount ?? '—'}
                {tower.deviceOutageCount != null && tower.deviceOutageCount > 0 && (
                  <span className="text-red-500 ml-1">({tower.deviceOutageCount} down)</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock3
              className={cn(
                'w-3.5 h-3.5',
                (() => {
                  const c = towerSyncClock(tower);
                  return c && Date.now() - c > 86400000 ? 'text-amber-500' : 'text-emerald-500';
                })(),
              )}
            />
            <div>
              <p className="font-mono text-[8px] uppercase tracking-widest text-on-surface-variant/40">Last Sync</p>
              <p className="font-mono text-[10px] font-semibold text-on-surface-variant/70" title="Customer roster freshness (Splynx sync)">
                {relTime(towerSyncClock(tower))}
              </p>
              {towerDevicesStale(tower) && (
                <p className="font-mono text-[8px] text-amber-600/80" title="Device telemetry is frozen — UISP sync has no API token">
                  devices {relTime(tower.lastSyncAt)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─── Account Mix ─── */}
        {topAccounts.length > 0 && (
          <div className="border-t border-border/40 pt-3">
            <p className="font-mono text-[8px] uppercase tracking-widest font-semibold text-on-surface-variant/40 mb-2">Account Mix</p>
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden flex mb-2">
              {topAccounts.map(([key, count]) => {
                const pct = (count / totalCustomers) * 100;
                if (pct < 3) return null;
                return (
                  <div
                    key={key}
                    className={cn(
                      'h-full',
                      key === 'RESIDENTIAL' || key === 'NEIGHBOURHOOD'
                        ? 'bg-emerald-500'
                        : key === 'SME'
                          ? 'bg-sky-500'
                          : key === 'ENTERPRISE'
                            ? 'bg-amber-500'
                            : 'bg-zinc-300',
                    )}
                    style={{ width: `${pct}%` }}
                    title={`${accountLabel(key)}: ${count} (${Math.round(pct)}%)`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {topAccounts.map(([key, count]) => {
                const pct = Math.round((count / totalCustomers) * 100);
                if (pct < 3) return null;
                return (
                  <span
                    key={key}
                    className={cn(
                      'font-mono text-[8px] font-semibold',
                      key === 'RESIDENTIAL' || key === 'NEIGHBOURHOOD'
                        ? 'text-emerald-600'
                        : key === 'SME'
                          ? 'text-sky-600'
                          : key === 'ENTERPRISE'
                            ? 'text-amber-600'
                            : 'text-on-surface-variant/50',
                    )}
                  >
                    {accountLabel(key)} {pct}%
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </button>
    </div>
  );
}
