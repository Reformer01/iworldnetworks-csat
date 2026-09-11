// Computed per-tower audit. No stored manual records: every number is
// derived live from UispSite (type=site towers) + Customer (unified) rows.
// The pure functions take plain fixture-friendly inputs so the computation
// is unit-testable without a database; the prisma wrapper only reads.

import { prisma } from '@/lib/prisma';
import { withCache } from '@/lib/route-cache';
import { btsStations } from '@/lib/bts-data';
import { normalizeSiteName } from '@/lib/bts-resolver';
import { customerRegionKey, endpointRegionKey } from '@/lib/matching/score';
import { deriveBtsAccountType } from '@/lib/bts-account-type';
import { getPlanMrc } from '@/lib/sales-staff';

export interface TowerAuditRow {
  towerId: string;
  towerName: string;
  region: string;
  status: string | null;
  suspended: boolean | null;
  deviceCount: number | null;
  deviceOutageCount: number | null;
  /** UISP device-telemetry clock (frozen while the UISP sync has no API token). */
  lastSyncAt: number | null;
  /** Customer-roster clock: max Customer.lastSyncAt for the tower's customers.
   *  This is the freshness of everything the Splynx sync owns (counts, MRR). */
  rosterSyncAt: number | null;
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
}

export interface CustomerAuditDetail {
  customerId: string | null;
  customerName: string | null;
  lifecycle: string | null;
  accountType: string;
  servicePlan: string | null;
  potentialMrr: number;
  activeMrr: number;
}

export interface TowerSiteRow {
  id: string;
  name: string;
  status: string | null;
  suspended: boolean | null;
  deviceCount: number | null;
  deviceOutageCount: number | null;
  lastSyncAt: number;
}

export interface CustomerAuditRow {
  customerId?: string | null;
  customerName?: string | null;
  btsId: string | null;
  lifecycle: string | null;
  accountType: string | null;
  servicePlan: string | null;
  mrrTotal: number | null;
  city: string | null;
  lastSyncAt?: number | null;
}

/**
 * Canonical region for a tower name: exact station-name match first, then
 * normalized fuzzy match against the static station list, else null.
 */
export function canonicalRegionForTowerName(towerName: string | null | undefined): string | null {
  if (!towerName) return null;
  const cleaned = normalizeSiteName(towerName);
  // Static station truth must win over keyword inference. Otherwise the
  // generic `rockcity` keyword can incorrectly classify Rock City as Ibadan
  // before the canonical Rockcity station match is considered.
  const staticRegion = btsStations.find((s) => normalizeSiteName(s.name) === cleaned)?.region;
  if (staticRegion) return staticRegion;
  return endpointRegionKey(towerName);
}

/** Canonical region from the majority customer city (LOCATION_TO_BTS_REGION).
 *  NOTE: per Aug 27 decision, geoloc fallback is deprecated. This helper is kept
 *  for backward compat only; live audit now prefers UispSite.region directly.
 */
export function regionFromMajorityCity(customers: CustomerAuditRow[]): string | null {
  const counts = new Map<string, number>();
  for (const c of customers) {
    const region = customerRegionKey(c.city);
    if (region && region !== 'Lagos') counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  let best: { region: string; count: number } | null = null;
  for (const [region, count] of counts) {
    if (!best || count > best.count) best = { region, count };
  }
  return best?.region ?? null;
}

/**
 * Pure per-tower computation. Customers are attributed by btsId (unified).
 * Account type falls back to the service plan when Splynx sends `regular`.
 *
 * Potential MRC = billed MRR for every connected, non-deleted customer. It is
 * the revenue opportunity if all customers attached to the BTS were active.
 * Active MRC = billed MRR for active customers only.
 */
export function computeTowerAuditRows(towers: TowerSiteRow[], customers: CustomerAuditRow[]): TowerAuditRow[] {
  const byTower = new Map<string, CustomerAuditRow[]>();
  for (const c of customers) {
    if (!c.btsId) continue;
    const list = byTower.get(c.btsId);
    if (list) list.push(c);
    else byTower.set(c.btsId, [c]);
  }

  return towers.map((t) => {
    const towerCustomers = byTower.get(t.id) ?? [];
    const byAccountType: Record<string, number> = {};
    const byServicePlan: Record<string, number> = {};
    const potentialMrrByAccountType: Record<string, number> = {};
    const activeMrrByAccountType: Record<string, number> = {};
    const customerDetails: CustomerAuditDetail[] = [];
    let total = 0;
    let active = 0;
    let potentialMrr = 0;
    let activeMrr = 0;
    let rosterSyncAt: number | null = null;
    for (const c of towerCustomers) {
      total++;
      if (c.lastSyncAt != null && (rosterSyncAt == null || c.lastSyncAt > rosterSyncAt)) {
        rosterSyncAt = c.lastSyncAt;
      }
      const isActive = c.lifecycle === 'active' || c.lifecycle === 'Active';
      if (isActive) active++;
      const key = deriveBtsAccountType(c.accountType, c.servicePlan);
      byAccountType[key] = (byAccountType[key] ?? 0) + 1;
      const planKey = c.servicePlan || 'PLAN NOT PROVIDED';
      byServicePlan[planKey] = (byServicePlan[planKey] ?? 0) + 1;

      // Splynx's customer-level MRR includes bundle and relationship discounts.
      // Only fall back to the exact catalog price when the mirror has no MRR.
      const storedMrr = Number(c.mrrTotal ?? 0);
      const billedMrr = Number.isFinite(storedMrr) && storedMrr > 0 ? storedMrr : (getPlanMrc(c.servicePlan || '') ?? 0);
      // Every connected customer contributes to the opportunity estimate,
      // including blocked/churned rows that could be restored or reactivated.
      const potentialCustomerMrr = billedMrr;
      const activeCustomerMrr = isActive ? billedMrr : 0;

      customerDetails.push({
        customerId: c.customerId ?? null,
        customerName: c.customerName ?? null,
        lifecycle: c.lifecycle ?? null,
        accountType: key,
        servicePlan: c.servicePlan ?? null,
        potentialMrr: potentialCustomerMrr,
        activeMrr: activeCustomerMrr,
      });

      if (potentialCustomerMrr > 0) {
        potentialMrr += potentialCustomerMrr;
        potentialMrrByAccountType[key] = (potentialMrrByAccountType[key] ?? 0) + potentialCustomerMrr;
      }

      if (activeCustomerMrr > 0) {
        activeMrr += activeCustomerMrr;
        activeMrrByAccountType[key] = (activeMrrByAccountType[key] ?? 0) + activeCustomerMrr;
      }
    }
    // Region: prefer UISP site region (stored) via canonical map, else city fallback, never Lagos (→ Ota alias)
    const rawRegion = canonicalRegionForTowerName(t.name) ?? regionFromMajorityCity(towerCustomers) ?? 'Unknown';
    const region = rawRegion === 'Lagos' ? 'Ota' : rawRegion;
    const towerName = t.name === 'Lagos' ? 'Ota' : t.name;
    return {
      towerId: t.id,
      towerName,
      region,
      status: t.status ?? null,
      suspended: t.suspended ?? null,
      deviceCount: t.deviceCount ?? null,
      deviceOutageCount: t.deviceOutageCount ?? null,
      lastSyncAt: t.lastSyncAt,
      rosterSyncAt,
      customers: { total, active, byAccountType, byServicePlan, customerDetails },
      mrrTotal: potentialMrr, // Potential MRR (all connected customers)
      activeMrr, // Active MRR (only active)
      mrrByAccountType: potentialMrrByAccountType, // Potential MRR breakdown
      activeMrrByAccountType, // Active MRR breakdown
    };
  });
}

/** includeEmpty=false (default) hides towers with zero customers. */
export function filterAuditRows(rows: TowerAuditRow[], includeEmpty: boolean): TowerAuditRow[] {
  return includeEmpty ? rows : rows.filter((r) => r.customers.total > 0);
}

/**
 * Live tower audit. Reads via prisma, cached in-process for 60s. UISP-only
 * towers (no static station match) fall back to the majority customer city.
 */
export async function computeTowerAudit(opts?: { includeEmpty?: boolean }): Promise<TowerAuditRow[]> {
  const includeEmpty = opts?.includeEmpty ?? false;
  const rows = await withCache('tower-audit', 60_000, async () => {
    const [towers, customers] = await Promise.all([
      prisma.uispSite.findMany({ where: { type: 'site' } }),
      prisma.customer.findMany({ where: { deleted: false } }),
    ]);
    // NOTE: generated Prisma client predates Leaf A/B schema fields; the
    // runtime rows carry them (see runMatching.ts cast pattern).
    // BigInt timestamps cross the boundary as Numbers (same as lastSyncAt).
    return computeTowerAuditRows(
      (towers as unknown as TowerSiteRow[]).map((t) => ({ ...t, lastSyncAt: Number(t.lastSyncAt) })),
      (customers as unknown as Array<Record<string, unknown>>).map((c) => ({
        ...c,
        lastSyncAt: c.lastSyncAt == null ? null : Number(c.lastSyncAt),
      })) as unknown as CustomerAuditRow[],
    );
  });
  return filterAuditRows(rows, includeEmpty);
}
