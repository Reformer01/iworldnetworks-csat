/**
 * Customer Health Score Computation Service
 *
 * Computes a 0-100 health score for each customer from 6 weighted risk signals:
 * - Complaint frequency (25%)
 * - Payment pattern (20%)
 * - Device status (15%)
 * - Network quality (15%)
 * - Engagement recency (15%)
 * - Lifecycle trajectory (10%)
 *
 * Score tiers:
 *   80-100: healthy
 *   60-79:  at-risk
 *   40-59:  churning
 *   20-39:  critical
 *   0-19:   lost
 */

import { prisma } from '@/lib/prisma';

const WEIGHTS = {
  complaint: 0.25,
  payment: 0.2,
  device: 0.15,
  network: 0.15,
  engagement: 0.15,
  lifecycle: 0.1,
} as const;

function scoreToTier(score: number): string {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'at-risk';
  if (score >= 40) return 'churning';
  if (score >= 20) return 'critical';
  return 'lost';
}

function computeComplaintRisk(customerId: string, now: Date): number {
  // Risk = how many complaints in last 30 days, scaled to 0-100
  // We'll compute this in batch via SQL for performance
  // Placeholder — actual computation done in batch
  return 0;
}

function computePaymentRisk(overdueInfo: Record<string, unknown> | string | null): number {
  if (!overdueInfo) return 0;
  if (typeof overdueInfo === 'string') return 0; // can't parse string
  const overdueDays = (overdueInfo as { overdueDays?: number }).overdueDays ?? 0;
  if (overdueDays <= 0) return 0;
  if (overdueDays <= 7) return 20;
  if (overdueDays <= 14) return 40;
  if (overdueDays <= 30) return 60;
  if (overdueDays <= 60) return 80;
  return 100;
}

function computeDeviceRisk(deviceStatus: string | null, outageCount: number | null, lastSyncAt: bigint | number | null): number {
  let risk = 0;
  if (deviceStatus === 'offline' || deviceStatus === 'disabled') risk += 40;
  if (outageCount != null && outageCount > 0) risk += Math.min(outageCount * 20, 40);
  if (lastSyncAt) {
    const hoursSinceSync = (Date.now() - Number(lastSyncAt)) / (1000 * 60 * 60);
    if (hoursSinceSync > 48) risk += 20;
    if (hoursSinceSync > 168) risk += 20; // 7 days
  }
  return Math.min(risk, 100);
}

function computeNetworkRisk(towerHealthScore: number | null): number {
  if (towerHealthScore == null) return 30; // unknown = moderate risk
  // towerHealthScore is 0-100 where 100 is best
  // Invert: low tower health = high customer risk
  return Math.max(0, 100 - towerHealthScore);
}

function computeEngagementRisk(lastContactAt: Date | null): number {
  if (!lastContactAt) return 80; // never contacted = high risk
  const daysSinceContact = (Date.now() - lastContactAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceContact <= 7) return 0;
  if (daysSinceContact <= 14) return 15;
  if (daysSinceContact <= 30) return 30;
  if (daysSinceContact <= 60) return 50;
  if (daysSinceContact <= 90) return 70;
  return 90;
}

function computeLifecycleRisk(lifecycle: string | null, churnedAt: bigint | number | null, inactiveSince: bigint | number | null): number {
  if (lifecycle === 'churned' || churnedAt) return 100;
  if (lifecycle === 'blocked') return 90;
  if (lifecycle === 'inactive') {
    if (inactiveSince) {
      const daysInactive = (Date.now() - Number(inactiveSince)) / (1000 * 60 * 60 * 24);
      if (daysInactive > 30) return 70;
      if (daysInactive > 14) return 50;
      return 30;
    }
    return 40;
  }
  if (lifecycle === 'suspended') return 60;
  if (lifecycle === 'active') return 0;
  return 20; // unknown lifecycle
}

interface CustomerInput {
  id: string;
  lifecycle: string | null;
  churnedAt: bigint | number | null;
  inactiveSince: bigint | number | null;
  overdueInfo: Record<string, unknown> | string | null;
  uispDeviceStatus: string | null;
  uispOutageCount: number | null;
  lastSyncAt: bigint | number | null;
  btsId: string | null;
  lastContactAt: Date | null;
}

export interface HealthScoreResult {
  customerId: string;
  score: number;
  tier: string;
  complaintRisk: number;
  paymentRisk: number;
  deviceRisk: number;
  networkRisk: number;
  engagementRisk: number;
  lifecycleRisk: number;
}

/**
 * Compute health score for a single customer.
 * Note: complaint risk and network risk require batch queries —
 * pass pre-computed values or use computeAllHealthScores.
 */
export function computeHealthScore(customer: CustomerInput, complaintRisk: number, towerHealthScore: number | null): HealthScoreResult {
  const paymentRisk = computePaymentRisk(customer.overdueInfo);
  const deviceRisk = computeDeviceRisk(customer.uispDeviceStatus, customer.uispOutageCount, customer.lastSyncAt);
  const networkRisk = computeNetworkRisk(towerHealthScore);
  const engagementRisk = computeEngagementRisk(customer.lastContactAt);
  const lifecycleRisk = computeLifecycleRisk(customer.lifecycle, customer.churnedAt, customer.inactiveSince);

  const raw =
    complaintRisk * WEIGHTS.complaint +
    paymentRisk * WEIGHTS.payment +
    deviceRisk * WEIGHTS.device +
    networkRisk * WEIGHTS.network +
    engagementRisk * WEIGHTS.engagement +
    lifecycleRisk * WEIGHTS.lifecycle;

  const score = Math.round(Math.max(0, Math.min(100, 100 - raw)));
  const tier = scoreToTier(score);

  return {
    customerId: customer.id,
    score,
    tier,
    complaintRisk: Math.round(complaintRisk),
    paymentRisk: Math.round(paymentRisk),
    deviceRisk: Math.round(deviceRisk),
    networkRisk: Math.round(networkRisk),
    engagementRisk: Math.round(engagementRisk),
    lifecycleRisk: Math.round(lifecycleRisk),
  };
}

/**
 * Batch compute health scores for all active customers.
 * This is the main entry point called by the daily scheduler.
 */
export async function computeAllHealthScores(): Promise<{
  computed: number;
  healthy: number;
  atRisk: number;
  churning: number;
  critical: number;
  lost: number;
}> {
  const now = new Date();

  // 1. Fetch all active customers
  const customers = await prisma.customer.findMany({
    where: { deleted: false },
    select: {
      id: true,
      lifecycle: true,
      churnedAt: true,
      inactiveSince: true,
      overdueInfo: true,
      uispDeviceStatus: true,
      uispOutageCount: true,
      lastSyncAt: true,
      btsId: true,
    },
  });

  // 2. Fetch tower health scores (from latest TowerAuditSnapshot per tower)
  const towerSnapshots = await prisma.$queryRaw<Array<{ towerId: string; healthScore: number }>>`
    SELECT towerId, healthScore
    FROM (
      SELECT towerId, healthScore,
             ROW_NUMBER() OVER (PARTITION BY towerId ORDER BY capturedAt DESC) as rn
      FROM TowerAuditSnapshot
    ) ranked
    WHERE rn = 1
  `;
  const towerHealthMap = new Map(towerSnapshots.map((s) => [s.towerId, s.healthScore]));

  // 3. Fetch complaint counts per customer (last 30 days)
  // Uses EngagementLog as complaint source since ComplaintMessage table doesn't exist yet
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const complaintCounts = await prisma.engagementLog.groupBy({
    by: ['customerId'],
    where: {
      customerId: { not: null },
      createdAt: { gte: thirtyDaysAgo },
      complaint: { not: null },
    },
    _count: { id: true },
  });
  const complaintMap = new Map(complaintCounts.map((c) => [c.customerId, c._count.id]));

  // 4. Fetch last contact per customer
  const lastContacts = await prisma.engagementLog.groupBy({
    by: ['customerId'],
    where: { customerId: { not: null } },
    _max: { lastContactAt: true },
  });
  const lastContactMap = new Map(lastContacts.map((l) => [l.customerId, l._max.lastContactAt]));

  // 5. Compute scores
  const results: HealthScoreResult[] = [];
  for (const customer of customers) {
    // Complaint risk: 0 complaints = 0 risk, 10+ = 100 risk
    const complaintCount = complaintMap.get(customer.id) ?? 0;
    const complaintRisk = Math.min(complaintCount * 10, 100);

    const towerHealth = customer.btsId ? (towerHealthMap.get(customer.btsId) ?? null) : null;
    const lastContact = lastContactMap.get(customer.id) ?? null;

    const result = computeHealthScore(
      {
        id: customer.id,
        lifecycle: customer.lifecycle,
        churnedAt: customer.churnedAt,
        inactiveSince: customer.inactiveSince,
        overdueInfo: customer.overdueInfo as Record<string, unknown> | null,
        uispDeviceStatus: customer.uispDeviceStatus,
        uispOutageCount: customer.uispOutageCount,
        lastSyncAt: customer.lastSyncAt,
        btsId: customer.btsId,
        lastContactAt: lastContact,
      },
      complaintRisk,
      towerHealth,
    );
    results.push(result);
  }

  // 6. Batch upsert results
  const tierCounts = { healthy: 0, atRisk: 0, churning: 0, critical: 0, lost: 0 };

  for (const result of results) {
    // Get previous score for trend detection
    const previous = await prisma.customerHealthScore.findFirst({
      where: { customerId: result.customerId },
      orderBy: { calculatedAt: 'desc' },
    });

    let trend: string | null = null;
    if (previous) {
      const diff = result.score - previous.score;
      if (diff > 5) trend = 'improving';
      else if (diff < -5) trend = 'declining';
      else trend = 'stable';
    }

    await prisma.customerHealthScore.create({
      data: {
        customerId: result.customerId,
        score: result.score,
        tier: result.tier,
        complaintRisk: result.complaintRisk,
        paymentRisk: result.paymentRisk,
        deviceRisk: result.deviceRisk,
        networkRisk: result.networkRisk,
        engagementRisk: result.engagementRisk,
        lifecycleRisk: result.lifecycleRisk,
        trend,
        calculatedAt: now,
      },
    });

    // Count tiers
    if (result.tier === 'healthy') tierCounts.healthy++;
    else if (result.tier === 'at-risk') tierCounts.atRisk++;
    else if (result.tier === 'churning') tierCounts.churning++;
    else if (result.tier === 'critical') tierCounts.critical++;
    else tierCounts.lost++;
  }

  // Retention: only the latest score per customer feeds trends — prune rows
  // older than 90d so the daily compute doesn't grow the table unbounded.
  try {
    await prisma.customerHealthScore.deleteMany({
      where: { calculatedAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    });
  } catch (pruneErr) {
    console.error('[health-score] Prune failed (best-effort):', pruneErr instanceof Error ? pruneErr.message : pruneErr);
  }

  return {
    computed: results.length,
    ...tierCounts,
  };
}
