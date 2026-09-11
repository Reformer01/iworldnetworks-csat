// Captures periodic tower audit snapshots for incident history and trend analysis.
// Runs hourly via the instrumentation scheduler.

import { prisma } from '@/lib/prisma';
import { computeTowerAudit } from '@/lib/audit/computeTowerAudit';

export interface TowerSnapshot {
  id: string;
  towerId: string;
  towerName: string;
  region: string;
  capturedAt: Date;
  status: string | null;
  suspended: boolean | null;
  deviceCount: number | null;
  deviceOutageCount: number | null;
  customerCount: number | null;
  activeCustomers: number | null;
  mrrTotal: number | null;
  activeMrr: number | null;
  healthScore: number | null;
  accountTypes: Record<string, number> | null;
  servicePlans: Record<string, number> | null;
}

function calculateHealthScore(tower: {
  deviceCount: number | null;
  deviceOutageCount: number | null;
  mrrTotal: number;
  activeMrr: number;
  lastSyncAt: number | null;
  status: string | null;
}): number {
  const deviceUptime = tower.deviceCount && tower.deviceCount > 0
    ? ((tower.deviceCount - (tower.deviceOutageCount ?? 0)) / tower.deviceCount) * 100
    : 100;
  const mrrUtilization = tower.mrrTotal > 0 ? (tower.activeMrr / tower.mrrTotal) * 100 : 100;
  let syncScore = 100;
  if (tower.lastSyncAt) {
    const mins = Math.floor((Date.now() - tower.lastSyncAt) / 60000);
    if (mins < 60) syncScore = 100;
    else if (mins < 360) syncScore = 75;
    else if (mins < 1440) syncScore = 50;
    else if (mins < 10080) syncScore = 25;
    else syncScore = 0;
  }
  const statusScore = tower.status === 'active' ? 100 : tower.status === null ? 50 : 0;
  return Math.round(deviceUptime * 0.40 + mrrUtilization * 0.30 + syncScore * 0.20 + statusScore * 0.10);
}

/**
 * Capture a snapshot of all tower audit data.
 * Called hourly by the scheduler.
 */
export async function captureTowerSnapshots(): Promise<{ captured: number; errors: number }> {
  let captured = 0;
  let errors = 0;

  try {
    const towers = await computeTowerAudit({ includeEmpty: true });

    // Batch insert for efficiency
    const snapshotData = towers.map((t) => ({
      towerId: t.towerId,
      towerName: t.towerName,
      region: t.region,
      status: t.status,
      suspended: t.suspended,
      deviceCount: t.deviceCount,
      deviceOutageCount: t.deviceOutageCount,
      customerCount: t.customers.total,
      activeCustomers: t.customers.active,
      mrrTotal: t.mrrTotal,
      activeMrr: t.activeMrr,
      healthScore: calculateHealthScore({
        deviceCount: t.deviceCount,
        deviceOutageCount: t.deviceOutageCount,
        mrrTotal: t.mrrTotal,
        activeMrr: t.activeMrr,
        lastSyncAt: t.lastSyncAt,
        status: t.status,
      }),
      accountTypes: t.customers.byAccountType,
      servicePlans: t.customers.byServicePlan,
    }));

    await prisma.towerAuditSnapshot.createMany({ data: snapshotData });
    captured = snapshotData.length;

    // Retention: trends only look back 90d — prune older snapshots so the
    // hourly capture (64 rows/run) doesn't grow the table unbounded.
    try {
      await prisma.towerAuditSnapshot.deleteMany({
        where: { capturedAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      });
    } catch (pruneErr) {
      console.error('[tower-snapshot] Prune failed (best-effort):', pruneErr instanceof Error ? pruneErr.message : pruneErr);
    }
  } catch (err) {
    errors++;
    console.error('[tower-snapshot] Capture failed:', err instanceof Error ? err.message : err);
  }

  return { captured, errors };
}

/**
 * Get snapshots for a specific tower, ordered by time.
 */
export async function getTowerSnapshots(
  towerId: string,
  limit: number = 168 // 7 days of hourly snapshots
): Promise<TowerSnapshot[]> {
  const rows = await prisma.towerAuditSnapshot.findMany({
    where: { towerId },
    orderBy: { capturedAt: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    towerId: r.towerId,
    towerName: r.towerName,
    region: r.region,
    capturedAt: r.capturedAt,
    status: r.status,
    suspended: r.suspended,
    deviceCount: r.deviceCount,
    deviceOutageCount: r.deviceOutageCount,
    customerCount: r.customerCount,
    activeCustomers: r.activeCustomers,
    mrrTotal: r.mrrTotal,
    activeMrr: r.activeMrr,
    healthScore: r.healthScore,
    accountTypes: (r.accountTypes as Record<string, number>) ?? null,
    servicePlans: (r.servicePlans as Record<string, number>) ?? null,
  }));
}

/**
 * Get incidents for a tower (status changes, device outages, sync failures).
 */
export async function getTowerIncidents(
  towerId: string,
  limit: number = 50
): Promise<Array<{
  timestamp: Date;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}>> {
  const snapshots = await prisma.towerAuditSnapshot.findMany({
    where: { towerId },
    orderBy: { capturedAt: 'desc' },
    take: 200, // Get enough to detect changes
  });

  const incidents: Array<{
    timestamp: Date;
    type: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
  }> = [];

  for (let i = 0; i < snapshots.length; i++) {
    const curr = snapshots[i];
    const prev = snapshots[i + 1];

    if (!prev) continue;

    // Status change
    if (curr.status !== prev.status) {
      incidents.push({
        timestamp: curr.capturedAt,
        type: 'status_change',
        severity: curr.status === 'active' ? 'info' : 'critical',
        message: `Status changed from ${prev.status || 'unknown'} to ${curr.status || 'unknown'}`,
      });
    }

    // Device outage
    const prevOutages = prev.deviceOutageCount ?? 0;
    const currOutages = curr.deviceOutageCount ?? 0;
    if (currOutages > prevOutages) {
      incidents.push({
        timestamp: curr.capturedAt,
        type: 'device_outage',
        severity: currOutages > 3 ? 'critical' : 'warning',
        message: `Device outage increased: ${currOutages} devices down`,
      });
    } else if (currOutages < prevOutages && prevOutages > 0) {
      incidents.push({
        timestamp: curr.capturedAt,
        type: 'device_recovery',
        severity: 'info',
        message: `Device recovered: ${currOutages} devices still down`,
      });
    }

    // Note: sync regression detection requires lastSyncAt in the snapshot schema.
    // Currently tracked via device outage changes instead.

    // Suspension
    if (curr.suspended && !prev.suspended) {
      incidents.push({
        timestamp: curr.capturedAt,
        type: 'suspension',
        severity: 'critical',
        message: 'Tower suspended',
      });
    } else if (!curr.suspended && prev.suspended) {
      incidents.push({
        timestamp: curr.capturedAt,
        type: 'unsuspension',
        severity: 'info',
        message: 'Tower unsuspended',
      });
    }

    // Customer churn (>5% customer loss)
    if (prev.customerCount && curr.customerCount && prev.customerCount > 10) {
      const churnRate = (prev.customerCount - curr.customerCount) / prev.customerCount;
      if (churnRate > 0.05) {
        incidents.push({
          timestamp: curr.capturedAt,
          type: 'customer_churn',
          severity: 'warning',
          message: `Customer churn detected: ${prev.customerCount} → ${curr.customerCount} (${Math.round(churnRate * 100)}% loss)`,
        });
      }
    }

    // MRR drop (>10% revenue loss)
    if (prev.mrrTotal && curr.mrrTotal && prev.mrrTotal > 10000) {
      const mrrDrop = (prev.mrrTotal - curr.mrrTotal) / prev.mrrTotal;
      if (mrrDrop > 0.10) {
        incidents.push({
          timestamp: curr.capturedAt,
          type: 'mrr_drop',
          severity: 'warning',
          message: `MRR dropped: ₦${Math.round(prev.mrrTotal).toLocaleString()} → ₦${Math.round(curr.mrrTotal).toLocaleString()} (${Math.round(mrrDrop * 100)}% loss)`,
        });
      }
    }
  }

  // Deduplicate: only keep one incident per type per 6-hour window
  const deduped: typeof incidents = [];
  const seen = new Map<string, number>();

  for (const inc of incidents) {
    const key = inc.type;
    const lastSeen = seen.get(key) ?? 0;
    const hourDiff = (inc.timestamp.getTime() - lastSeen) / (6 * 60 * 60 * 1000);
    if (hourDiff >= 1 || lastSeen === 0) {
      deduped.push(inc);
      seen.set(key, inc.timestamp.getTime());
    }
  }

  return deduped.slice(0, limit);
}

/**
 * Get customer count trend for sparkline (last 30 data points).
 */
export async function getCustomerTrend(
  towerId: string,
  limit: number = 30
): Promise<Array<{ date: Date; total: number; active: number }>> {
  const rows = await prisma.towerAuditSnapshot.findMany({
    where: { towerId },
    orderBy: { capturedAt: 'desc' },
    take: limit,
    select: { capturedAt: true, customerCount: true, activeCustomers: true },
  });

  return rows.reverse().map((r) => ({
    date: r.capturedAt,
    total: r.customerCount ?? 0,
    active: r.activeCustomers ?? 0,
  }));
}

/**
 * Get MRR trend for sparkline (last 30 data points).
 */
export async function getMrrTrend(
  towerId: string,
  limit: number = 30
): Promise<Array<{ date: Date; potential: number; active: number }>> {
  const rows = await prisma.towerAuditSnapshot.findMany({
    where: { towerId },
    orderBy: { capturedAt: 'desc' },
    take: limit,
    select: { capturedAt: true, mrrTotal: true, activeMrr: true },
  });

  return rows.reverse().map((r) => ({
    date: r.capturedAt,
    potential: r.mrrTotal ?? 0,
    active: r.activeMrr ?? 0,
  }));
}

/**
 * Get health score trend for sparkline (last 30 data points).
 */
export async function getHealthTrend(
  towerId: string,
  limit: number = 30
): Promise<Array<{ date: Date; score: number }>> {
  const rows = await prisma.towerAuditSnapshot.findMany({
    where: { towerId },
    orderBy: { capturedAt: 'desc' },
    take: limit,
    select: { capturedAt: true, healthScore: true },
  });

  return rows.reverse().map((r) => ({
    date: r.capturedAt,
    score: r.healthScore ?? 0,
  }));
}
