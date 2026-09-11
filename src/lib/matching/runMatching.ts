// Matching job: scores every non-deleted customer against every UISP
// endpoint (type=endpoint, btsName not null) and applies the policy:
//
//   score ≥ 0.85 (AUTO_MATCH_THRESHOLD) → auto-match
//   0.5 ≤ score < 0.85                      → candidate list, stays pending
//   < 0.5                                   → pending, review queue
//
// Manual mappings (matchState='manual') are NEVER overwritten; they are
// only reverted to pending if the mapped endpoint disappears from UISP.
// Auto-matched customers are revalidated each run: if their endpoint no
// longer exists or its score drops below 0.5, they revert to pending.
//
// Export contract (Leaf B): the UISP sync completion path and the webhook
// path call `runMatching()` after upserting endpoints. ~2,648 endpoints ×
// ~2,800 customers scores in a few seconds; name normalization is memoized
// in normalize.ts.
//
// NOTE: the generated Prisma client predates Leaf A's schema additions
// (Customer.matchState & co.). The casts on Customer queries/writes are
// removable once `prisma generate` has run with the current schema.

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logWarn } from '@/lib/logger';
import { matchScore, hasStrongSignal, AUTO_MATCH_THRESHOLD, CANDIDATE_THRESHOLD } from './score';

export interface MatchingStats {
  matched: number;
  reverted: number;
  pending: number;
  manualKept: number;
  elapsedMs: number;
}

export type MatchDecision = 'match' | 'keep' | 'revert' | 'keepPending' | 'keepManual';

/**
 * Pure policy decision. `bestScore` is the score against the customer's
 * (only) relevant endpoint: null when no endpoint exists or the customer
 * has no name. Manual mappings are never overwritten by the engine.
 */
export function decideMatch(bestScore: number | null, currentState: string | null): MatchDecision {
  if (currentState === 'manual') return 'keepManual';
  if (bestScore === null) return currentState === 'matched' ? 'revert' : 'keepPending';
  if (currentState === 'matched') {
    return bestScore >= CANDIDATE_THRESHOLD ? 'keep' : 'revert';
  }
  return bestScore >= AUTO_MATCH_THRESHOLD ? 'match' : 'keepPending';
}

interface EndpointRow {
  id: string;
  name: string;
  btsName: string | null;
  btsId: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: string | null;
  deviceOutageCount: number | null;
}

interface CustomerRow {
  id: string;
  customerName: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  matchState: string | null;
  matchMethod: string | null;
  matchedAt: bigint | null;
  uispEndpointId: string | null;
  uispDeviceStatus: string | null;
  uispOutageCount: number | null;
  matchScore: number | null;
  btsId: string | null;
  btsName: string | null;
}

const ENDPOINT_SELECT = {
  id: true,
  name: true,
  btsName: true,
  btsId: true,
  contactPhone: true,
  contactEmail: true,
  status: true,
  deviceOutageCount: true,
} as const;

const UPDATE_CHUNK = 25;

/**
 * Run the full matching pass. `now` is injectable for tests.
 */
export async function runMatching(now?: number): Promise<MatchingStats> {
  const ts = now ?? Date.now();
  const startedAt = Date.now();

  const endpoints = (await prisma.uispSite.findMany({
    where: { type: 'endpoint', btsName: { not: null } },
    select: ENDPOINT_SELECT,
  })) as unknown as EndpointRow[];

  const customers = (await prisma.customer.findMany({
    where: { deleted: false },
    select: {
      id: true,
      customerName: true,
      city: true,
      phone: true,
      email: true,
      matchState: true,
      matchMethod: true,
      matchedAt: true,
      uispEndpointId: true,
      uispDeviceStatus: true,
      uispOutageCount: true,
      matchScore: true,
      btsId: true,
      btsName: true,
    },
  })) as unknown as CustomerRow[];

  const endpointById = new Map(endpoints.map((e) => [e.id, e]));
  const stats: MatchingStats = { matched: 0, reverted: 0, pending: 0, manualKept: 0, elapsedMs: 0 };

  interface Update {
    id: string;
    data: Record<string, unknown>;
  }
  const updates: Update[] = [];

  for (const customer of customers) {
    if (customer.matchState === 'manual') {
      // Manual is sacred: only the mapped endpoint disappearing clears it.
      if (customer.uispEndpointId && !endpointById.has(customer.uispEndpointId)) {
        updates.push({ id: customer.id, data: revertData(ts) });
        stats.reverted++;
      } else {
        stats.manualKept++;
      }
      continue;
    }

    if (customer.matchState === 'matched') {
      // Device-resolved matches (deviceResolve.ts: address / device-mac /
      // device-ip / device-name / manual-csv) are NOT re-scored here — this
      // scorer only understands endpoint name/contact signals and would
      // wrongly revert them every cycle. They leave via manual action or
      // explicit revertData, same as manual.
      const method = customer.matchMethod ?? '';
      if (method !== 'auto' && method !== '') {
        stats.manualKept++;
        continue;
      }
      // Revalidation: score only against the mapped endpoint. A better
      // endpoint elsewhere does NOT remap an auto match (avoid churn).
      const current = customer.uispEndpointId ? endpointById.get(customer.uispEndpointId) : null;
      const score = current ? scoreAgainst(customer, current) : null;
      const decision = decideMatch(score, 'matched');
      // Weak auto-matches (single-token endpoint, no phone/email agreement)
      // are ambiguous — revert them to the review queue so a human confirms.
      const weak = current ? !hasStrongSignal(customerAsMatch(customer), current) : false;
      if (decision === 'revert' || weak) {
        updates.push({ id: customer.id, data: revertData(ts) });
        stats.reverted++;
      } else if (
        customer.uispDeviceStatus !== current!.status ||
        customer.uispOutageCount !== current!.deviceOutageCount ||
        (customer.matchScore ?? -1) !== score ||
        customer.btsId !== current!.btsId ||
        customer.btsName !== current!.btsName
      ) {
        // keep: refresh live fields + tower attribution when they drifted (tower
        // renames in UISP must not fossilize stale btsName on matched rows)
        updates.push({
          id: customer.id,
          data: {
            uispDeviceStatus: current!.status,
            uispOutageCount: current!.deviceOutageCount,
            matchScore: score,
            btsId: current!.btsId,
            btsName: current!.btsName,
            matchUpdatedAt: BigInt(ts),
          },
        });
      }
      continue;
    }

    // Pending: score against all endpoints, keep the best.
    let best: { endpoint: EndpointRow; score: number } | null = null;
    if (customer.customerName) {
      // If customer has a BTS label from Splynx, prioritize endpoints with that BTS
      if (customer.btsName) {
        const labelBtsName = customer.btsName.trim().toLowerCase();
        const labelEndpoints = endpoints.filter((e) => e.btsName?.toLowerCase() === labelBtsName);
        if (labelEndpoints.length > 0) {
          // Score only against endpoints with the matching BTS
          for (const endpoint of labelEndpoints) {
            const score = scoreAgainst(customer, endpoint);
            if (!best || score > best.score) best = { endpoint, score };
          }
          // If we found a good match with the labeled BTS, use it
          if (best && best.score >= 0.5) {
            const decision = decideMatch(best.score, customer.matchState);
            if (decision === 'match' && hasStrongSignal(customerAsMatch(customer), best.endpoint)) {
              updates.push({
                id: customer.id,
                data: {
                  matchState: 'matched',
                  matchMethod: 'auto',
                  btsId: best!.endpoint.btsId,
                  btsName: best!.endpoint.btsName,
                  uispEndpointId: best!.endpoint.id,
                  uispEndpointName: best!.endpoint.name,
                  uispDeviceStatus: best!.endpoint.status,
                  uispOutageCount: best!.endpoint.deviceOutageCount,
                  matchScore: best!.score,
                  matchedAt: customer.matchedAt ?? BigInt(ts),
                  matchUpdatedAt: BigInt(ts),
                },
              });
              stats.matched++;
              continue;
            }
          }
        }
      }
      // Fallback: score against all endpoints
      for (const endpoint of endpoints) {
        const score = scoreAgainst(customer, endpoint);
        if (!best || score > best.score) best = { endpoint, score };
      }
    }
    const decision = decideMatch(best?.score ?? null, customer.matchState);
    if (decision === 'match' && best && hasStrongSignal(customerAsMatch(customer), best.endpoint)) {
      updates.push({
        id: customer.id,
        data: {
          matchState: 'matched',
          matchMethod: 'auto',
          btsId: best!.endpoint.btsId,
          btsName: best!.endpoint.btsName,
          uispEndpointId: best!.endpoint.id,
          uispEndpointName: best!.endpoint.name,
          uispDeviceStatus: best!.endpoint.status,
          uispOutageCount: best!.endpoint.deviceOutageCount,
          matchScore: best!.score,
          matchedAt: customer.matchedAt ?? BigInt(ts),
          matchUpdatedAt: BigInt(ts),
        },
      });
      stats.matched++;
    } else {
      stats.pending++;
    }
  }

  // Write in modest chunks; a failed row must not abort the rest of the run.
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK);
    await Promise.allSettled(
      chunk.map((u) =>
        prisma.customer.update({ where: { id: u.id }, data: u.data as never }).catch((err: unknown) => {
          logWarn('[matching] customer update failed', {
            id: u.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      ),
    );
  }

  stats.elapsedMs = Date.now() - startedAt;
  return stats;
}

function scoreAgainst(
  customer: {
    customerName: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
  },
  endpoint: { name: string; btsName: string | null; contactPhone?: string | null; contactEmail?: string | null },
): number {
  return matchScore(customerAsMatch(customer), {
    name: endpoint.name,
    btsName: endpoint.btsName,
    phone: endpoint.contactPhone,
    email: endpoint.contactEmail,
  });
}

function customerAsMatch(customer: { customerName: string | null; city: string | null; phone: string | null; email: string | null }) {
  return { name: customer.customerName ?? '', city: customer.city, phone: customer.phone, email: customer.email };
}

function revertData(ts: number): Record<string, unknown> {
  return {
    matchState: 'pending',
    matchMethod: null,
    matchScore: null,
    matchedAt: null,
    matchUpdatedAt: BigInt(ts),
    btsId: null,
    btsName: null,
    uispEndpointId: null,
    uispEndpointName: null,
    uispDeviceStatus: null,
    uispOutageCount: null,
  };
}
