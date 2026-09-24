import type { TowerAuditRow } from '@/lib/audit/computeTowerAudit';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'outline';

export function accountLabel(key: string): string {
  if (key === 'NEIGHBOURHOOD') return 'Residential';
  if (key === 'PARTNERS_HOSTS') return 'Partners & hosts';
  if (key === 'BUNDLED') return 'Bundled';
  if (key === 'CUSTOM') return 'Custom';
  if (key === 'OTHER') return 'Other';
  return key
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatNaira(amount: number, compact = true): string {
  if (compact && Math.abs(amount) >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(amount) >= 1_000) return `₦${(amount / 1_000).toFixed(1)}K`;
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

export function formatExactNaira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

export function relativeTime(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return 'Never';
  const minutes = Math.max(0, Math.floor((now - ms) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function towerSyncClock(tower: Pick<TowerAuditRow, 'rosterSyncAt' | 'lastSyncAt'>): number | null {
  return tower.rosterSyncAt ?? tower.lastSyncAt;
}

export function towerDevicesStale(tower: Pick<TowerAuditRow, 'lastSyncAt'>, now = Date.now()): boolean {
  return !!tower.lastSyncAt && now - tower.lastSyncAt > 86_400_000;
}

/** Composite NOC score: device availability, realised MRR, roster freshness and site status. */
export function towerHealthScore(tower: TowerAuditRow, now = Date.now()): number {
  const deviceUptime =
    tower.deviceCount && tower.deviceCount > 0
      ? ((tower.deviceCount - (tower.deviceOutageCount ?? 0)) / tower.deviceCount) * 100
      : 100;
  const mrrUtilisation = tower.mrrTotal > 0 ? (tower.activeMrr / tower.mrrTotal) * 100 : 100;
  let syncScore = 100;
  const syncClock = towerSyncClock(tower);
  if (syncClock) {
    const minutes = Math.floor((now - syncClock) / 60_000);
    if (minutes >= 10_080) syncScore = 0;
    else if (minutes >= 1_440) syncScore = 25;
    else if (minutes >= 360) syncScore = 50;
    else if (minutes >= 60) syncScore = 75;
  }
  const statusScore = tower.status === 'active' ? 100 : tower.status == null ? 50 : 0;
  return Math.round(deviceUptime * 0.4 + mrrUtilisation * 0.3 + syncScore * 0.2 + statusScore * 0.1);
}

export function healthBand(score: number): 'Healthy' | 'Watch' | 'Critical' {
  if (score >= 80) return 'Healthy';
  if (score >= 50) return 'Watch';
  return 'Critical';
}

export function towerNeedsAttention(tower: TowerAuditRow, now = Date.now()): boolean {
  if ((tower.deviceOutageCount ?? 0) > 0 || tower.status === 'down' || tower.status === 'disabled' || tower.suspended) return true;
  const clock = towerSyncClock(tower);
  return !!clock && now - clock > 86_400_000;
}

export function healthTone(score: number): BadgeTone {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

export function statusTone(status: string | null, suspended?: boolean | null): BadgeTone {
  if (suspended || status === 'disabled' || status === 'down') return 'danger';
  if (status === 'active') return 'success';
  if (!status) return 'muted';
  return 'warning';
}

export function freshnessTone(ms: number | null | undefined, now = Date.now()): BadgeTone {
  if (!ms) return 'muted';
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 60) return 'success';
  if (minutes < 1_440) return 'warning';
  return 'danger';
}
