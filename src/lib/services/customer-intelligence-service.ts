import { prisma } from '@/lib/prisma';
import { btsStations } from '@/lib/bts-data';
import { canonicalRegionForTowerName } from '@/lib/audit/computeTowerAudit';
import { customerRegionKey } from '@/lib/matching/score';
import { getEffectiveMrr, getActiveEffectiveMrr } from '@/lib/customer-mrr';

export interface IntelligenceOverview {
  totals: {
    total: number;
    active: number;
    blocked: number;
    inactive: number;
    churned: number;
    online: number; // in-use
    offline: number;
    overdue: number;
    overdueRate: number;
    totalMrr: number;
    activeMrr: number;
    avgMrr: number;
  };
  lifecycle: Array<{ name: string; count: number; percent: number; color: string }>;
  matchState: Array<{ name: string; count: number; percent: number }>;
  payment: { overdue: number; current: number; overduePercent: number };
  engagement: { reminders15: number; reminders30: number; churnSent: number; churnResponses: number; responseRate: number };
  byRegion: Array<{ region: string; customers: number; active: number; mrr: number; towers: number; percent: number }>;
  byBts: Array<{ btsName: string; region: string; customers: number; active: number; mrr: number; percent: number; status: string | null }>;
  byPlan: Array<{ plan: string; count: number; mrr: number; percent: number }>;
  byAccountType: Array<{ type: string; count: number; mrr: number; percent: number }>;
  topTowers: Array<{ towerName: string; region: string; customers: number; mrr: number }>;
  syncMeta: { lastSyncAt: number | null; lastStatus: string; lastError: string; invoicesApiDenied: boolean };

  // Health score distribution (merged from deprecated revenue-overview)
  healthDistribution: {
    healthy: number;
    'at-risk': number;
    churning: number;
    critical: number;
    lost: number;
    avgScore: number;
  };
  // Top at-risk customers
  atRiskCustomers: Array<{
    customerId: string;
    customerName: string | null;
    score: number;
    tier: string;
    trend: string | null;
    complaintRisk: number;
    paymentRisk: number;
    deviceRisk: number;
    networkRisk: number;
    engagementRisk: number;
    lifecycleRisk: number;
    city: string | null;
    servicePlan: string | null;
    mrrTotal: number | null;
  }>;
  // Upsell opportunities
  upsellOpportunities: Array<{
    id: string;
    customerId: string;
    customerName: string | null;
    type: string;
    currentPlan: string | null;
    suggestedPlan: string | null;
    revenuePotential: number;
    score: number;
    status: string;
    assignedTo: string | null;
  }>;
  // Revenue anomalies
  anomalies: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string;
    entityType: string | null;
    entityId: string | null;
    entityName: string | null;
    metricName: string;
    metricValue: number;
    threshold: number;
    status: string;
    acknowledgedBy: string | null;
    resolvedAt: Date | null;
    createdAt: Date;
  }>;
  anomalySummary: Array<{ severity: string; status: string; count: number }>;
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 10; // one decimal, sums correctly
}

/**
 * Single source of truth for all customer + BTS intelligence.
 * One DB read for customers, one for towers — no duplicated filters.
 * Every percentage is derived from the same `total` denominator.
 */
export async function getIntelligenceOverview(): Promise<IntelligenceOverview> {
  const [customers, towers, syncLock, splynxMeta, churnResponses, healthScores, upsellOps, anomalies] = await Promise.all([
    prisma.customer.findMany({ where: { deleted: false } }),
    prisma.uispSite.findMany({ where: { type: 'site' } }),
    prisma.syncLock.findUnique({ where: { id: 'splynx-hourly-sync' } }),
    prisma.splynxMeta.findUnique({ where: { id: 'sync' } }),
    prisma.churnSurvey.count({ where: { used: true } }),
    // Health score distribution (latest per customer)
    prisma.$queryRaw<
      Array<{ tier: string; count: bigint; avgScore: number }>
    >`
      SELECT tier, COUNT(*) as count, AVG(score) as avgScore
      FROM (
        SELECT customerId, score, tier,
               ROW_NUMBER() OVER (PARTITION BY customerId ORDER BY calculatedAt DESC) as rn
        FROM CustomerHealthScore
      ) latest
      WHERE rn = 1
      GROUP BY tier
    `,
    // Upsell opportunities
    prisma.upsellOpportunity.findMany({
      where: { status: 'new' },
      orderBy: { score: 'desc' },
      take: 30,
    }),
    // Revenue anomalies
    prisma.revenueAnomaly.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  // Health score distribution (latest per customer)
  const healthDistribution = {
    healthy: 0,
    'at-risk': 0,
    churning: 0,
    critical: 0,
    lost: 0,
    avgScore: 0,
  };
  let totalCustomers = 0;
  let totalScore = 0;
  for (const row of healthScores) {
    const count = Number(row.count);
    healthDistribution[row.tier as keyof typeof healthDistribution] = count;
    totalCustomers += count;
    totalScore += row.avgScore * count;
  }
  healthDistribution.avgScore = totalCustomers > 0 ? Math.round(totalScore / totalCustomers) : 0;

  // Top at-risk customers (latest per customer, tier at-risk/churning/critical/lost)
  const atRiskCustomers = await prisma.$queryRaw<
    Array<{
      customerId: string;
      customerName: string | null;
      score: number;
      tier: string;
      trend: string | null;
      complaintRisk: number;
      paymentRisk: number;
      deviceRisk: number;
      networkRisk: number;
      engagementRisk: number;
      lifecycleRisk: number;
      city: string | null;
      servicePlan: string | null;
      mrrTotal: number | null;
    }>
  >`
    SELECT chs.customerId, c.customerName, chs.score, chs.tier, chs.trend,
           chs.complaintRisk, chs.paymentRisk, chs.deviceRisk, chs.networkRisk,
           chs.engagementRisk, chs.lifecycleRisk, c.city, c.servicePlan, c.mrrTotal
    FROM (
      SELECT customerId, score, tier, trend, complaintRisk, paymentRisk,
             deviceRisk, networkRisk, engagementRisk, lifecycleRisk,
             ROW_NUMBER() OVER (PARTITION BY customerId ORDER BY calculatedAt DESC) as rn
      FROM CustomerHealthScore
    ) chs
    JOIN Customer c ON c.id = chs.customerId
    WHERE chs.rn = 1 AND chs.tier IN ('at-risk', 'churning', 'critical', 'lost')
    ORDER BY chs.score ASC
    LIMIT 50
  `;

  // Anomaly summary
  const anomalySummary = await prisma.revenueAnomaly.groupBy({
    by: ['severity', 'status'],
    _count: { id: true },
  });

  const total = customers.length;
  const active = customers.filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'active').length;
  const blocked = customers.filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'blocked').length;
  const inactive = customers.filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'inactive').length;
  const churned = customers.filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'churned').length;
  const online = customers.filter((c) => (c as unknown as { online: boolean }).online === true).length;
  const offline = total - online;
  const overdue = customers.filter((c) => (c.overdueInfo as { hasOverdueInvoice?: boolean } | null)?.hasOverdueInvoice === true).length;
  const totalMrr = customers.reduce((s, c) => s + getEffectiveMrr(c as unknown as { mrrTotal: number | null; servicePlan: string | null }), 0);
  const activeMrr = customers
    .filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'active')
    .reduce((s, c) => s + getEffectiveMrr(c as unknown as { mrrTotal: number | null; servicePlan: string | null }), 0);
  const avgMrr = total > 0 ? Math.round(totalMrr / total) : 0;

  const lifecycle = [
    { name: 'Active', count: active, percent: pct(active, total), color: '#10b981' },
    { name: 'Inactive', count: inactive, percent: pct(inactive, total), color: '#f97316' },
    { name: 'Blocked', count: blocked, percent: pct(blocked, total), color: '#eab308' },
    { name: 'Churned', count: churned, percent: pct(churned, total), color: '#71717a' },
  ];

  const matched = customers.filter((c) => (c as unknown as { matchState: string }).matchState === 'matched').length;
  const manual = customers.filter((c) => (c as unknown as { matchState: string }).matchState === 'manual').length;
  const pending = customers.filter((c) => {
    const s = (c as unknown as { matchState: string }).matchState;
    return s === 'pending' || !s;
  }).length;
  const matchState = [
    { name: 'Matched', count: matched, percent: pct(matched, total) },
    { name: 'Manual', count: manual, percent: pct(manual, total) },
    { name: 'Pending', count: pending, percent: pct(pending, total) },
  ];

  const payment = { overdue, current: total - overdue, overduePercent: pct(overdue, total) };

  const reminders15 = customers.filter((c) => (c as unknown as { reminder15SentAt: bigint | null }).reminder15SentAt != null).length;
  const reminders30 = customers.filter((c) => (c as unknown as { reminder30SentAt: bigint | null }).reminder30SentAt != null).length;
  const churnSent = customers.filter((c) => (c as unknown as { churnSurveySentAt: bigint | null }).churnSurveySentAt != null).length;
  const responseRate = churnSent > 0 ? Math.round((churnResponses / churnSent) * 1000) / 10 : 0;
  const engagement = { reminders15, reminders30, churnSent, churnResponses, responseRate };

  // By BTS — every customer must have a btsName (unified), unassigned goes to "Unassigned"
  const byBtsMap = new Map<string, { customers: number; active: number; mrr: number; region: string; status: string | null }>();
  const towerStatusMap = new Map<string, string | null>();
  for (const t of towers as unknown as Array<{ id: string; name: string; status: string | null }>) towerStatusMap.set(t.name, t.status);

  for (const c of customers as unknown as Array<{ btsName: string | null; lifecycle: string; mrrTotal: number | null; servicePlan: string | null }>) {
    const btsName = c.btsName || 'Unassigned';
    const prev = byBtsMap.get(btsName) || {
      customers: 0,
      active: 0,
      mrr: 0,
      region: canonicalRegionForTowerName(btsName) || customerRegionKey((c as unknown as { city: string | null }).city) || 'Unknown',
      status: towerStatusMap.get(btsName) ?? null,
    };
    prev.customers++;
    if (c.lifecycle === 'active') prev.active++;
    prev.mrr += getEffectiveMrr(c);
    byBtsMap.set(btsName, prev);
  }
  const byBts = [...byBtsMap.entries()]
    .map(([btsName, v]) => ({
      btsName,
      region: v.region,
      customers: v.customers,
      active: v.active,
      mrr: v.mrr,
      percent: pct(v.customers, total),
      status: v.status,
    }))
    .sort((a, b) => b.customers - a.customers);

  // By region — roll up BTS
  const byRegionMap = new Map<string, { customers: number; active: number; mrr: number; towers: Set<string> }>();
  for (const row of byBts) {
    const r = row.region;
    const prev = byRegionMap.get(r) || { customers: 0, active: 0, mrr: 0, towers: new Set<string>() };
    prev.customers += row.customers;
    prev.active += row.active;
    prev.mrr += row.mrr;
    if (row.btsName !== 'Unassigned') prev.towers.add(row.btsName);
    byRegionMap.set(r, prev);
  }
  // Ensure all BTS-regions exist even if empty
  for (const s of btsStations) {
    if (!byRegionMap.has(s.region)) byRegionMap.set(s.region, { customers: 0, active: 0, mrr: 0, towers: new Set() });
  }
  const byRegion = [...byRegionMap.entries()]
    .map(([region, v]) => ({
      region,
      customers: v.customers,
      active: v.active,
      mrr: v.mrr,
      towers: v.towers.size,
      percent: pct(v.customers, total),
    }))
    .sort((a, b) => b.customers - a.customers);

  // By plan (servicePlan)
  const byPlanMap = new Map<string, { count: number; mrr: number }>();
  for (const c of customers as unknown as Array<{ servicePlan: string | null; mrrTotal: number | null }>) {
    const plan = c.servicePlan || 'Unknown';
    const prev = byPlanMap.get(plan) || { count: 0, mrr: 0 };
    prev.count++;
    prev.mrr += getEffectiveMrr(c);
    byPlanMap.set(plan, prev);
  }
  const byPlan = [...byPlanMap.entries()]
    .map(([plan, v]) => ({ plan, count: v.count, mrr: v.mrr, percent: pct(v.count, total) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // By accountType
  const byAccountTypeMap = new Map<string, { count: number; mrr: number }>();
  for (const c of customers as unknown as Array<{ accountType: string | null; mrrTotal: number | null; servicePlan: string | null }>) {
    const t = c.accountType || 'OTHER';
    const prev = byAccountTypeMap.get(t) || { count: 0, mrr: 0 };
    prev.count++;
    prev.mrr += getEffectiveMrr(c);
    byAccountTypeMap.set(t, prev);
  }
  const byAccountType = [...byAccountTypeMap.entries()]
    .map(([type, v]) => ({ type, count: v.count, mrr: v.mrr, percent: pct(v.count, total) }))
    .sort((a, b) => b.count - a.count);

  const topTowers = byBts
    .filter((r) => r.btsName !== 'Unassigned')
    .slice(0, 8)
    .map((r) => ({ towerName: r.btsName, region: r.region, customers: r.customers, mrr: r.mrr }));

  return {
    totals: {
      total,
      active,
      blocked,
      inactive,
      churned,
      online,
      offline,
      overdue,
      overdueRate: pct(overdue, total),
      totalMrr,
      activeMrr,
      avgMrr,
    },
    lifecycle,
    matchState,
    payment,
    engagement,
    byRegion,
    byBts,
    byPlan,
    byAccountType,
    topTowers,
    syncMeta: {
      lastSyncAt: syncLock?.lastRunAt ? Number(syncLock.lastRunAt) : null,
      lastStatus: syncLock?.lastStatus || 'idle',
      lastError: syncLock?.lastError || '',
      invoicesApiDenied: splynxMeta?.invoicesApiDenied === true,
    },
    // Health score distribution (merged from deprecated revenue-overview)
    healthDistribution,
    // Top at-risk customers
    atRiskCustomers,
    // Upsell opportunities
    upsellOpportunities: upsellOps.map((u) => ({
      id: u.id,
      customerId: u.customerId,
      customerName: u.customerName,
      type: u.type,
      currentPlan: u.currentPlan,
      suggestedPlan: u.suggestedPlan,
      revenuePotential: u.revenuePotential,
      score: u.score,
      status: u.status,
      assignedTo: u.assignedTo,
    })),
    // Revenue anomalies
    anomalies: anomalies.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      description: a.description,
      entityType: a.entityType,
      entityId: a.entityId,
      entityName: a.entityName,
      metricName: a.metricName,
      metricValue: a.metricValue,
      threshold: a.threshold,
      status: a.status,
      acknowledgedBy: a.acknowledgedBy,
      resolvedAt: a.resolvedAt,
      createdAt: a.createdAt,
    })),
    anomalySummary: anomalySummary.map((a) => ({
      severity: a.severity,
      status: a.status,
      count: a._count.id,
    })),
  };
}
