import { prisma } from '@/lib/prisma';
import { btsStations } from '@/lib/bts-data';
import { canonicalRegionForTowerName } from '@/lib/audit/computeTowerAudit';
import { customerRegionKey } from '@/lib/matching/score';

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
  const [customers, towers, syncLock, splynxMeta, churnResponses] = await Promise.all([
    prisma.customer.findMany({ where: { deleted: false } }),
    prisma.uispSite.findMany({ where: { type: 'site' } }),
    prisma.syncLock.findUnique({ where: { id: 'splynx-hourly-sync' } }),
    prisma.splynxMeta.findUnique({ where: { id: 'sync' } }),
    prisma.churnSurvey.count({ where: { used: true } }),
  ]);

  const total = customers.length;
  const active = customers.filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'active').length;
  const blocked = customers.filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'blocked').length;
  const inactive = customers.filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'inactive').length;
  const churned = customers.filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'churned').length;
  const online = customers.filter((c) => (c as unknown as { online: boolean }).online === true).length;
  const offline = total - online;
  const overdue = customers.filter((c) => (c.overdueInfo as { hasOverdueInvoice?: boolean } | null)?.hasOverdueInvoice === true).length;
  const totalMrr = customers.reduce((s, c) => s + ((c as unknown as { mrrTotal: number | null }).mrrTotal ?? 0), 0);
  const activeMrr = customers
    .filter((c) => (c as unknown as { lifecycle: string }).lifecycle === 'active')
    .reduce((s, c) => s + ((c as unknown as { mrrTotal: number | null }).mrrTotal ?? 0), 0);
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

  for (const c of customers as unknown as Array<{ btsName: string | null; lifecycle: string; mrrTotal: number | null }>) {
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
    prev.mrr += c.mrrTotal ?? 0;
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
    prev.mrr += c.mrrTotal ?? 0;
    byPlanMap.set(plan, prev);
  }
  const byPlan = [...byPlanMap.entries()]
    .map(([plan, v]) => ({ plan, count: v.count, mrr: v.mrr, percent: pct(v.count, total) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // By accountType
  const byAccountTypeMap = new Map<string, { count: number; mrr: number }>();
  for (const c of customers as unknown as Array<{ accountType: string | null; mrrTotal: number | null }>) {
    const t = c.accountType || 'OTHER';
    const prev = byAccountTypeMap.get(t) || { count: 0, mrr: 0 };
    prev.count++;
    prev.mrr += c.mrrTotal ?? 0;
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
  };
}
