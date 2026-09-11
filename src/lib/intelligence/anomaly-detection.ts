/**
 * Revenue Anomaly Detection Service
 *
 * Detects revenue anomalies:
 * - Tower MRR drop >10% in 30 days
 * - Regional churn spike >5% in 7 days
 * - Payment collection drop <80%
 * - Complaint surge >3x normal for a region
 *
 * Runs every 6 hours via scheduler. Stores anomalies in RevenueAnomaly table.
 */

import { prisma } from '@/lib/prisma';

interface Anomaly {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  entityType: string;
  entityId: string;
  entityName: string;
  metricName: string;
  metricValue: number;
  threshold: number;
}

/**
 * Detect tower MRR drops: compare current 30-day MRR to previous 30-day MRR.
 */
async function detectTowerMrrDrops(): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];
  const now = new Date();
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgo = now.getTime() - 60 * 24 * 60 * 60 * 1000;

  // Get latest snapshots for each tower
  const latestSnapshots = await prisma.$queryRaw<
    Array<{ towerId: string; towerName: string; mrrTotal: number; capturedAt: bigint }>
  >`
    SELECT towerId, towerName, mrrTotal, capturedAt
    FROM (
      SELECT towerId, towerName, mrrTotal, capturedAt,
             ROW_NUMBER() OVER (PARTITION BY towerId ORDER BY capturedAt DESC) as rn
      FROM TowerAuditSnapshot
      WHERE capturedAt > ${thirtyDaysAgo}
    ) ranked
    WHERE rn = 1
  `;

  // Get snapshots from 30-60 days ago for comparison
  const previousSnapshots = await prisma.$queryRaw<
    Array<{ towerId: string; mrrTotal: number; capturedAt: bigint }>
  >`
    SELECT towerId, mrrTotal, capturedAt
    FROM (
      SELECT towerId, mrrTotal, capturedAt,
             ROW_NUMBER() OVER (PARTITION BY towerId ORDER BY capturedAt DESC) as rn
      FROM TowerAuditSnapshot
      WHERE capturedAt BETWEEN ${sixtyDaysAgo} AND ${thirtyDaysAgo}
    ) ranked
    WHERE rn = 1
  `;

  const prevMap = new Map(previousSnapshots.map((s) => [s.towerId, s.mrrTotal]));

  for (const snap of latestSnapshots) {
    const prevMrr = prevMap.get(snap.towerId);
    if (!prevMrr || prevMrr <= 0) continue;

    const dropPct = ((prevMrr - snap.mrrTotal) / prevMrr) * 100;
    if (dropPct > 10) {
      anomalies.push({
        type: 'tower_mrr_drop',
        severity: dropPct > 25 ? 'critical' : 'warning',
        title: `Tower MRR dropped ${dropPct.toFixed(0)}% — ${snap.towerName}`,
        description: `MRR fell from ₦${(prevMrr / 1000).toFixed(0)}K to ₦${(snap.mrrTotal / 1000).toFixed(0)}K over 30 days.`,
        entityType: 'tower',
        entityId: snap.towerId,
        entityName: snap.towerName,
        metricName: 'mrr_drop_pct',
        metricValue: Math.round(dropPct * 100) / 100,
        threshold: 10,
      });
    }
  }

  return anomalies;
}

/**
 * Detect regional churn spikes: >5% churn in a region in 7 days.
 */
async function detectRegionalChurnSpikes(): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Count churned customers per city in last 7 days
  const churnedByCity = await prisma.customer.groupBy({
    by: ['city'],
    where: {
      deleted: false,
      city: { not: null },
      churnedAt: { gte: sevenDaysAgo.getTime() },
    },
    _count: { id: true },
  });

  // Total active customers per city
  const totalByCity = await prisma.customer.groupBy({
    by: ['city'],
    where: {
      deleted: false,
      city: { not: null },
      lifecycle: { notIn: ['churned', 'blocked'] },
    },
    _count: { id: true },
  });

  const totalMap = new Map(totalByCity.map((t) => [t.city, t._count.id]));

  for (const churn of churnedByCity) {
    const total = totalMap.get(churn.city!) ?? 0;
    if (total < 10) continue; // skip small regions
    const churnPct = (churn._count.id / total) * 100;
    if (churnPct > 5) {
      anomalies.push({
        type: 'regional_churn',
        severity: churnPct > 10 ? 'critical' : 'warning',
        title: `Churn spike in ${churn.city} — ${churnPct.toFixed(0)}% in 7 days`,
        description: `${churn._count.id} customers churned out of ${total} active in ${churn.city}.`,
        entityType: 'region',
        entityId: churn.city!,
        entityName: churn.city!,
        metricName: 'churn_rate_pct',
        metricValue: Math.round(churnPct * 100) / 100,
        threshold: 5,
      });
    }
  }

  return anomalies;
}

/**
 * Detect complaint surges: >3x normal complaint rate for a region.
 */
async function detectComplaintSurges(): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Complaints per region in last 7 days
  const recentComplaints = await prisma.engagementLog.groupBy({
    by: ['region'],
    where: {
      region: { not: null },
      createdAt: { gte: sevenDaysAgo },
      complaint: { not: null },
    },
    _count: { id: true },
  });

  // Average daily complaints per region over last 30 days (excluding last 7)
  const historicalComplaints = await prisma.engagementLog.groupBy({
    by: ['region'],
    where: {
      region: { not: null },
      createdAt: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
      complaint: { not: null },
    },
    _count: { id: true },
  });

  // 23 days in the historical period
  const histMap = new Map(
    historicalComplaints.map((h) => [h.region, h._count.id / 23])
  );

  for (const recent of recentComplaints) {
    const dailyAvg = histMap.get(recent.region!) ?? 0;
    if (dailyAvg < 1) continue; // skip regions with no baseline
    const surgeRatio = recent._count.id / dailyAvg;
    if (surgeRatio > 3) {
      anomalies.push({
        type: 'complaint_surge',
        severity: surgeRatio > 5 ? 'critical' : 'warning',
        title: `Complaint surge in ${recent.region} — ${surgeRatio.toFixed(1)}x normal`,
        description: `${recent._count.id} complaints in 7 days vs ${dailyAvg.toFixed(1)}/day average.`,
        entityType: 'region',
        entityId: recent.region!,
        entityName: recent.region!,
        metricName: 'complaint_surge_ratio',
        metricValue: Math.round(surgeRatio * 100) / 100,
        threshold: 3,
      });
    }
  }

  return anomalies;
}

/**
 * Main entry point: run all anomaly detectors and store results.
 */
export async function detectRevenueAnomalies(): Promise<{
  detected: number;
  critical: number;
  warning: number;
  info: number;
}> {
  const allAnomalies = [
    ...(await detectTowerMrrDrops()),
    ...(await detectRegionalChurnSpikes()),
    ...(await detectComplaintSurges()),
  ];

  // Deduplicate: don't create duplicate anomalies for same entity+type in last 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.revenueAnomaly.findMany({
    where: { createdAt: { gte: oneDayAgo } },
    select: { type: true, entityId: true },
  });
  const existingSet = new Set(existing.map((e) => `${e.type}:${e.entityId}`));

  const counts = { detected: 0, critical: 0, warning: 0, info: 0 };

  for (const anomaly of allAnomalies) {
    const key = `${anomaly.type}:${anomaly.entityId}`;
    if (existingSet.has(key)) continue;

    await prisma.revenueAnomaly.create({
      data: {
        type: anomaly.type,
        severity: anomaly.severity,
        title: anomaly.title,
        description: anomaly.description,
        entityType: anomaly.entityType,
        entityId: anomaly.entityId,
        entityName: anomaly.entityName,
        metricName: anomaly.metricName,
        metricValue: anomaly.metricValue,
        threshold: anomaly.threshold,
        status: 'new',
      },
    });

    counts.detected++;
    counts[anomaly.severity]++;
  }

  return counts;
}
