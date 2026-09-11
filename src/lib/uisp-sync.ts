import { prisma } from '@/lib/prisma';
import { logInfo, logWarn, logError } from '@/lib/logger';
import { getAllUispSites, getAllUispDevices, getUispEnv } from './uisp-api';
import type { UispSite, UispDevice } from './uisp-api';
import { runMatching } from '@/lib/matching/runMatching';
import { inferRegionFromBtsName } from './bts-data';
import { getExcludedUispSiteIds } from './uisp-exclusions';

// UISP (Ubiquiti) network mirror -> MariaDB.
//
// Pulls the full site + device inventory from the UISP NMS API every sync
// cycle and upserts it idempotently (natural key = UISP UUID). UISP is the
// authoritative network source: sites of type=site are the BTS/tower list
// (replacing the static btsStations array), and endpoints resolve to their
// nearest type=site ancestor (btsId/btsName) for customer -> BTS attribution.
//
// Hierarchy note: UISP parent/child chains are variable-depth (tower -> core
// -> sub-site -> endpoint). Walking to the tree root is WRONG — many roots are
// endpoint-type customer locations (e.g. enterprise sites). The tower is the
// nearest type=site ancestor, computed once per sync and stored on every row.
//
// The scheduler runs in the pm2 fork (single instance), so concurrency is
// guarded by a UispMeta lease rather than Firestore's lock.

const LEASE_MS = 25 * 60 * 1000;

export interface UispSyncStats {
  sitesUpserted: number;
  sitesStale: number;
  devicesUpserted: number;
  devicesStale: number;
  elapsedMs: number;
}

/**
 * Poll interval (default 10 min, env UISP_SYNC_INTERVAL_MIN). Garbage values
 * (NaN, 0, negative) fall back to the default.
 */
export function uispSyncIntervalMs(): number {
  const minutes = Number(process.env.UISP_SYNC_INTERVAL_MIN);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 10 * 60 * 1000;
}

function toNumber(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number.isFinite(v) ? v : null;
}

export interface UispSiteNode {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
}

export interface BtsMapping {
  btsId: string;
  btsName: string;
}

/**
 * Compute the BTS (tower) for every UISP site node.
 *
 * The tower is the nearest type=site ancestor: a site node maps to itself; an
 * endpoint walks its parent chain up to the first type=site node. Walking all
 * the way to the root is intentionally avoided — many roots are endpoint-type
 * customer locations (enterprise sites), and deep paths have no fixed depth.
 * Cycle-safe: a loop in the parent chain yields null instead of hanging.
 */
export function computeBtsMapping(sites: UispSiteNode[]): Map<string, BtsMapping | null> {
  const byId = new Map(sites.map((s) => [s.id, s]));
  const memo = new Map<string, BtsMapping | null>();

  const towerFor = (node: UispSiteNode, seen: Set<string>): BtsMapping | null => {
    if (memo.has(node.id)) return memo.get(node.id) ?? null;
    if (seen.has(node.id)) return null;
    seen.add(node.id);

    if (node.type === 'site') {
      const self: BtsMapping = { btsId: node.id, btsName: node.name };
      memo.set(node.id, self);
      return self;
    }

    let cur = node;
    while (cur.parentId) {
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      cur = parent;
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      if (cur.type === 'site') {
        const result: BtsMapping = { btsId: cur.id, btsName: cur.name };
        memo.set(node.id, result);
        return result;
      }
    }
    memo.set(node.id, null);
    return null;
  };

  const result = new Map<string, BtsMapping | null>();
  for (const s of sites) result.set(s.id, towerFor(s, new Set()));
  return result;
}

/** Site columns written by both the poll sync and the webhook receiver. */
export interface UispSiteRowData {
  name: string;
  type: string;
  status: string | null;
  suspended: boolean | null;
  parentId: string | null;
  parentName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  deviceCount: number | null;
  deviceOutageCount: number | null;
  ucrmId: string | null;
  region: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  note: string | null;
  sla: number | null;
}

/**
 * Pure mapping from a UISP site object to the UispSite row data (contact
 * fields, note and sla included). Shared by syncUisp and the webhook receiver.
 */
export function mapSiteRow(site: UispSite): UispSiteRowData {
  const parent = site.identification?.parent;
  const desc = site.description ?? {};
  const loc = desc.location ?? {};
  return {
    name: site.identification?.name ?? '',
    type: site.identification?.type ?? 'site',
    status: site.identification?.status ?? null,
    suspended: site.identification?.suspended ?? null,
    parentId: parent?.id ?? null,
    parentName: parent?.name ?? null,
    address: desc.address ?? null,
    latitude: toNumber(loc.latitude),
    longitude: toNumber(loc.longitude),
    deviceCount: desc.deviceCount ?? null,
    deviceOutageCount: desc.deviceOutageCount ?? null,
    ucrmId: desc.ucrmId ?? null,
    region: inferRegionFromBtsName(site.identification?.name) ?? 'Unknown',
    contactName: desc.contact?.name ?? null,
    contactPhone: desc.contact?.phone ?? null,
    contactEmail: desc.contact?.email ?? null,
    note: desc.note ?? null,
    sla: toNumber(desc.sla),
  };
}

async function persistBtsMapping(now: number): Promise<void> {
  const rows = await prisma.uispSite.findMany({ select: { id: true, name: true, type: true, parentId: true, btsName: true } });
  const mapping = computeBtsMapping(rows as UispSiteNode[]);
  for (const [id, tower] of mapping) {
    await prisma.uispSite.update({
      where: { id },
      data: { 
        btsId: tower?.btsId ?? null, 
        btsName: tower?.btsName ?? null,
        region: inferRegionFromBtsName(tower?.btsName ?? null) ?? inferRegionFromBtsName(rows.find((row) => row.id === id)?.name) ?? 'Unknown',
        lastSyncAt: BigInt(now) 
      },
    });
  }
}

/** Recompute btsId/btsName for every stored UispSite row from the DB alone. */
export async function recomputeBtsMap(): Promise<number> {
  const rows = await prisma.uispSite.findMany({ select: { id: true, name: true, type: true, parentId: true, btsName: true } });
  const mapping = computeBtsMapping(rows as UispSiteNode[]);
  let updated = 0;
  for (const [id, tower] of mapping) {
    await prisma.uispSite.update({
      where: { id },
      data: {
        btsId: tower?.btsId ?? null,
        btsName: tower?.btsName ?? null,
        region: inferRegionFromBtsName(tower?.btsName ?? null) ?? inferRegionFromBtsName(rows.find((row) => row.id === id)?.name) ?? 'Unknown',
      },
    });
    updated++;
  }
  return updated;
}

/**
 * Targeted recompute for the webhook path: update the node itself plus every
 * node hanging under it (a parent change cascades down the subtree). The node
 * may already be deleted (site/delete event) — then only the descendants are
 * re-attributed, and orphans fall back to null btsId/btsName.
 */
export async function recomputeBtsForNode(nodeId: string): Promise<number> {
  const rows = await prisma.uispSite.findMany({ select: { id: true, name: true, type: true, parentId: true } });
  const mapping = computeBtsMapping(rows as UispSiteNode[]);

  const childrenByParent = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parentId) {
      const kids = childrenByParent.get(r.parentId) ?? [];
      kids.push(r.id);
      childrenByParent.set(r.parentId, kids);
    }
  }

  const affected = new Set<string>();
  if (mapping.has(nodeId)) affected.add(nodeId);
  const stack = [nodeId];
  while (stack.length) {
    const parentId = stack.pop()!;
    for (const child of childrenByParent.get(parentId) ?? []) {
      if (affected.has(child)) continue;
      affected.add(child);
      stack.push(child);
    }
  }

  let updated = 0;
  for (const id of affected) {
    const tower = mapping.get(id) ?? null;
    await prisma.uispSite.update({
      where: { id },
      data: {
        btsId: tower?.btsId ?? null,
        btsName: tower?.btsName ?? null,
        region: inferRegionFromBtsName(tower?.btsName ?? null) ?? inferRegionFromBtsName(rows.find((row) => row.id === id)?.name) ?? 'Unknown',
      },
    });
    updated++;
  }
  return updated;
}

export async function syncUisp(now = Date.now()): Promise<UispSyncStats> {
  const started = Date.now();
  const env = getUispEnv();
  if (!env.token) {
    logWarn('[uisp-sync] skipped: UISP_API_TOKEN not configured');
    return { sitesUpserted: 0, sitesStale: 0, devicesUpserted: 0, devicesStale: 0, elapsedMs: 0 };
  }

  const meta = await prisma.uispMeta.findUnique({ where: { id: 'sync' } });
  if (meta?.lastStatus === 'running' && meta.lastSyncAt && Number(meta.lastSyncAt) > now - LEASE_MS) {
    logInfo('[uisp-sync] skipped: another run is in progress', { lastSyncAt: Number(meta.lastSyncAt) });
    return { sitesUpserted: 0, sitesStale: 0, devicesUpserted: 0, devicesStale: 0, elapsedMs: 0 };
  }

  await prisma.uispMeta.upsert({
    where: { id: 'sync' },
    update: { lastStatus: 'running', lastSyncAt: BigInt(now), lastError: null },
    create: { id: 'sync', lastStatus: 'running', lastSyncAt: BigInt(now), lastError: null },
  });

  try {
    const [allSites, allDevices] = await Promise.all([getAllUispSites(), getAllUispDevices()]);
    const excludedSiteIds = getExcludedUispSiteIds(allSites);
    const sites = allSites.filter((site) => {
      const id = site.identification?.id || site.id;
      return !excludedSiteIds.has(id);
    });
    const devices = allDevices.filter((device) => !excludedSiteIds.has(device.identification?.site?.id ?? ''));

    if (excludedSiteIds.size > 0) {
      logInfo('[uisp-sync] excluded BTS subtree', { sites: excludedSiteIds.size });
    }

    let sitesUpserted = 0;
    for (const site of sites) {
      const id = site.identification?.id || site.id;
      const data = mapSiteRow(site);
      await prisma.uispSite.upsert({
        where: { id },
        // SAFETY: the generated Prisma client predates the UispSite contact
        // columns; casts are removable once `prisma generate` has run with the
        // current schema.
        update: { ...data, lastSyncAt: BigInt(now) } as never,
        create: { id, ...data, lastSyncAt: BigInt(now) } as never,
      });
      sitesUpserted++;
    }

    // Attribute every node to its nearest type=site ancestor (BTS tower).
    await persistBtsMapping(now);

    let devicesUpserted = 0;
    for (const device of devices) {
      const id = device.identification?.id || device.id;
      const site = device.identification?.site;
      const ov = device.overview ?? {};
      await prisma.uispDevice.upsert({
        where: { id },
        update: {
          siteId: site?.id ?? null,
          siteName: site?.name ?? null,
          name: device.identification?.name ?? '',
          role: device.identification?.role ?? null,
          category: device.identification?.category ?? null,
          model: device.identification?.model ?? null,
          modelName: device.identification?.modelName ?? null,
          mac: device.identification?.mac ?? null,
          hostname: device.identification?.hostname ?? null,
          firmwareVersion: device.identification?.firmwareVersion ?? null,
          authorized: device.identification?.authorized ?? false,
          status: ov.status ?? null,
          ipAddress: device.ipAddress ?? null,
          cpu: toNumber(ov.cpu),
          downlinkCapacity: toNumber(ov.downlinkCapacity),
          uplinkCapacity: toNumber(ov.uplinkCapacity),
          downlinkUtilization: toNumber(ov.downlinkUtilization),
          uplinkUtilization: toNumber(ov.uplinkUtilization),
          lastSyncAt: BigInt(now),
        },
        create: {
          id,
          siteId: site?.id ?? null,
          siteName: site?.name ?? null,
          name: device.identification?.name ?? '',
          role: device.identification?.role ?? null,
          category: device.identification?.category ?? null,
          model: device.identification?.model ?? null,
          modelName: device.identification?.modelName ?? null,
          mac: device.identification?.mac ?? null,
          hostname: device.identification?.hostname ?? null,
          firmwareVersion: device.identification?.firmwareVersion ?? null,
          authorized: device.identification?.authorized ?? false,
          status: ov.status ?? null,
          ipAddress: device.ipAddress ?? null,
          cpu: toNumber(ov.cpu),
          downlinkCapacity: toNumber(ov.downlinkCapacity),
          uplinkCapacity: toNumber(ov.uplinkCapacity),
          downlinkUtilization: toNumber(ov.downlinkUtilization),
          uplinkUtilization: toNumber(ov.uplinkUtilization),
          lastSyncAt: BigInt(now),
        },
      });
      devicesUpserted++;
    }

    // Stale sweep: rows not refreshed in this cycle are gone from UISP.
    const sitesStale = await prisma.uispSite.deleteMany({ where: { lastSyncAt: { not: BigInt(now) } } }).then((r) => r.count);
    const devicesStale = await prisma.uispDevice.deleteMany({ where: { lastSyncAt: { not: BigInt(now) } } }).then((r) => r.count);

    const stats: UispSyncStats = {
      sitesUpserted,
      sitesStale,
      devicesUpserted,
      devicesStale,
      elapsedMs: Date.now() - started,
    };

    await prisma.uispMeta.update({
      where: { id: 'sync' },
      data: { lastStatus: 'ok', lastStats: { ...stats }, lastError: null, lastSyncAt: BigInt(now) },
    });

    logInfo('[uisp-sync] complete', { ...stats });

    // Rematch against the refreshed mirror. A matching failure must not fail
    // the sync — the next cycle retries it.
    try {
      const matching = await runMatching();
      logInfo('[uisp-sync] matching complete', { ...matching });
    } catch (err) {
      logError('[uisp-sync] matching failed (sync continues)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logInfo('[uisp-sync] failed', { error: message });
    // lastError is VARCHAR(191) — truncate or the lease-release update itself
    // fails (Data too long) and the sync stays locked forever.
    const shortMessage = message.slice(0, 190);
    await prisma.uispMeta.update({
      where: { id: 'sync' },
      data: { lastStatus: 'error', lastError: shortMessage },
    }).catch(() => undefined);
    throw err;
  }
}
