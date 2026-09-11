import { prisma } from '@/lib/prisma';
import { btsStations, findBtsMatch, SITE_ALIASES } from './bts-data';
import { getRegionsFromBts } from './bts-data';
import { normalizeName } from './matching/normalize';
import type { BtsStation } from './sales-types';

// Customer -> BTS attribution resolver.
//
// Unified-first: the matching engine attributes each Customer row to a tower
// (matchState 'matched' auto / 'manual' override, btsName = the tower) at sync
// time. That mapping is the source of truth; it is exact, so it wins.
//
// Fallback 1: UISP endpoint sites (type=endpoint); each endpoint stores
// btsId/btsName — the nearest type=site ancestor (its tower) — computed at
// sync time by walking the parent chain. Walking to the tree root is wrong:
// roots are often endpoint-type customer locations (enterprise sites), and
// hierarchy depth is variable.
//
// Fallback 2: the legacy static btsStations list + fuzzy matching.

export interface BtsResolution {
  btsName: string;
  region: string;
  source: 'unified' | 'uisp' | 'static';
  /** UISP endpoint name when source=uisp, else the matched static station name. */
  matchedName: string;
}

/** Canonicalize a UISP site name for comparison against station names. */
export function normalizeSiteName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // strip [brackets] e.g. [Office Core]
    .replace(/\b(bts|core|office|fm|ib|a)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STATION_TO_REGION = new Map<string, string>();
for (const s of btsStations) STATION_TO_REGION.set(s.name.toLowerCase(), s.region);

export function regionForStationName(name: string): string | null {
  return STATION_TO_REGION.get(name.toLowerCase()) ?? null;
}

/**
 * Score how well a customer name matches a UISP endpoint site name.
 * Token-overlap ratio; 1.0 = identical tokens.
 */
export function endpointMatchScore(customerName: string, endpointName: string): number {
  const a = normalizeSiteName(customerName).split(' ').filter(Boolean);
  const b = normalizeSiteName(endpointName).split(' ').filter(Boolean);
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  let hits = 0;
  for (const token of b) if (set.has(token)) hits++;
  return hits / Math.max(a.length, b.length);
}

export interface UispEndpointRow {
  id: string;
  name: string;
  type: string;
  btsId: string | null;
  btsName: string | null;
}

/** Customer rows pre-attributed by the matching engine (matchState matched/manual). */
export interface UnifiedCustomerRow {
  customerName: string | null;
  btsName: string | null;
}

/**
 * Resolve a customer name to a BTS station.
 *
 * @param customerName    Splynx customer name (company/individual).
 * @param endpoints       UISP endpoint rows — injected for testability; defaults
 *                        to a DB query when omitted.
 * @param unifiedCustomers Customer rows already attributed by the matching
 *                        engine — injected for testability; defaults to a DB
 *                        query when omitted.
 * @returns BTS resolution, or null when no source matches.
 */
export async function resolveCustomerBts(
  customerName: string,
  endpoints?: UispEndpointRow[],
  unifiedCustomers?: UnifiedCustomerRow[],
): Promise<BtsResolution | null> {
  const name = (customerName || '').trim();
  if (!name) return null;

  // 1. Unified-first: the matching engine already attributed this customer to
  // a tower — that exact mapping beats any fuzzy scan.
  let unified = unifiedCustomers;
  if (!unified) {
    // Casts: the generated Prisma client predates Leaf A's schema additions
    // (Customer.matchState & co.); removable once `prisma generate` has run.
    unified = (await prisma.customer.findMany({
      where: {
        matchState: { in: ['matched', 'manual'] },
        btsName: { not: null },
        deleted: false,
      },
      select: { customerName: true, btsName: true },
    } as never)) as unknown as UnifiedCustomerRow[];
  }
  if (unified && unified.length > 0) {
    const normalized = normalizeName(name);
    // Multiple customers can share a name; the first attributed row wins.
    const hit = unified.find((c) => c.btsName && normalizeName(c.customerName ?? '') === normalized);
    if (hit) {
      const tower = canonicalTower(hit.btsName!);
      return { btsName: tower.name, region: tower.region, source: 'unified', matchedName: name };
    }
  }

  // 2. UISP scan: find the best-matching endpoint, then its tower (btsName).
  let uispEndpoints = endpoints;
  if (!uispEndpoints) {
    uispEndpoints = await prisma.uispSite.findMany({
      where: { type: 'endpoint' },
      select: { id: true, name: true, type: true, btsId: true, btsName: true },
    });
  }
  if (uispEndpoints && uispEndpoints.length > 0) {
    let best: { name: string; btsName: string | null; score: number } | null = null;
    for (const ep of uispEndpoints) {
      const score = endpointMatchScore(name, ep.name);
      if (score >= 0.6 && (!best || score > best.score)) {
        best = { name: ep.name, btsName: ep.btsName, score };
      }
    }
    // Only attribute via UISP when the matched endpoint actually has a tower;
    // otherwise (root customer location, sync not yet attributed) fall through
    // to the static list rather than guessing.
    if (best && best.btsName) {
      const tower = canonicalTower(best.btsName);
      return { btsName: tower.name, region: tower.region, source: 'uisp', matchedName: best.name };
    }
  }

  // 3. Static fallback: legacy fuzzy matching across all stations.
  const allRegions = getRegionsFromBts();
  for (const region of allRegions) {
    const regionStations = btsStations.filter((s) => s.region === region);
    const match = findBtsMatch(name, regionStations);
    if (match) {
      return { btsName: match.name, region: match.region, source: 'static', matchedName: match.name };
    }
  }
  return null;
}

/**
 * Canonicalize a tower name against the known station list: keep the name
 * when it maps to a known station's region, swap in the canonical station
 * name when it only fuzzy-matches, otherwise surface the raw name.
 */
function canonicalTower(btsName: string): { name: string; region: string } {
  const region = regionForStationName(btsName);
  if (region) return { name: btsName, region };
  const staticMatch = findStationForName(btsName);
  if (staticMatch) return { name: staticMatch.name, region: staticMatch.region };
  return { name: btsName, region: '' };
}

function findStationForName(name: string): BtsStation | null {
  const normalized = name.toLowerCase().trim();
  const aliasTarget = (SITE_ALIASES as Record<string, string>)[normalized];
  const direct = btsStations.find((s) => s.name.toLowerCase() === normalized);
  if (direct) return direct;
  if (aliasTarget) {
    const aliasStation = btsStations.find((s) => s.name === aliasTarget);
    if (aliasStation) return aliasStation;
  }
  // Partial: "JERICHO BTS" -> "Jericho", "Space FM " -> "Space"
  const cleaned = normalizeSiteName(name);
  return btsStations.find((s) => normalizeSiteName(s.name) === cleaned) ?? null;
}
