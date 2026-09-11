// Pure reconciliation policy (Leaf D). No imports beyond local types so the
// rules are unit-testable in isolation; the job (runReconciliation.ts) applies
// the outputs and the flags API lets admins accept/ignore the 'flag' rows.
//
// Policy (PLAN.md): bts empty → auto-fill; bts differs → flag (tower change is
// a big change). mrc within ±20% of truth → auto-fix; beyond → flag. Segment
// derives deterministically from the Splynx category/accountType → auto-fix.

export type DecideAction = 'fill' | 'flag' | 'none' | 'auto';

export interface DecideResult {
  action: DecideAction;
  reason: string;
}

/**
 * Sales-record bts vs unified truth (Customer.btsName).
 * Empty record value + known truth → 'fill'; both set and different → 'flag'
 * (case-insensitive compare — tower names arrive from different sources);
 * equal, or no truth to compare against → 'none'.
 */
export function decideRecordBts(recordBts: string | null | undefined, truthBts: string | null | undefined): DecideResult {
  const rec = (recordBts ?? '').trim().toLowerCase();
  const truth = (truthBts ?? '').trim().toLowerCase();
  if (!rec && truth) return { action: 'fill', reason: 'bts missing on record, filled from unified truth' };
  if (rec && truth && rec !== truth) return { action: 'flag', reason: 'record bts differs from unified truth' };
  return { action: 'none', reason: 'in sync' };
}

/**
 * Sales-record mrc vs unified truth (Customer.mrrTotal). Tolerance ±20% of
 * truth (floor of 1 so tiny truths don't amplify). truth=0 with current>0 is
 * always a flag (a real billable plan should never have zero truth).
 */
export function decideMrr(current: number, truth: number): DecideResult {
  if (current === truth) return { action: 'none', reason: 'in sync' };
  if (truth === 0) return { action: 'flag', reason: 'record mrc is non-zero but unified truth is 0' };
  const divergence = Math.abs(current - truth) / Math.max(truth, 1);
  if (divergence <= 0.2) return { action: 'auto', reason: `mrc within ±20% of unified truth (${Math.round(divergence * 100)}% off)` };
  return { action: 'flag', reason: `mrc diverges from unified truth by ${Math.round(divergence * 100)}% (>20%)` };
}

// Splynx category/accountType → canonical sales segment. Splynx's own
// taxonomy already uses the same names as the sales dashboard segments.
export const SEGMENT_FOR_CATEGORY: Record<string, string> = {
  ENTERPRISE: 'ENTERPRISE',
  SME: 'SME',
  RESIDENTIAL: 'RESIDENTIAL',
  RETAIL: 'RETAIL',
  PARTNERS_HOSTS: 'PARTNERS_HOSTS',
  NEIGHBOURHOOD: 'NEIGHBOURHOOD',
};

/** Expected segment for a Splynx category, or null when unmapped. */
export function segmentForCategory(category: string | null | undefined): string | null {
  const key = (category ?? '').trim().toUpperCase();
  return key ? (SEGMENT_FOR_CATEGORY[key] ?? null) : null;
}

/**
 * Sales-record segment vs expected segment derived from the customer's
 * Splynx category/accountType. Mismatch (case-insensitive) → 'auto' so the
 * job fixes it; no mapping for the category → 'none'.
 */
export function decideSegment(current: string | null | undefined, category: string | null | undefined): DecideResult {
  const expected = segmentForCategory(category);
  if (!expected) return { action: 'none', reason: 'no segment mapping for category' };
  if ((current ?? '').trim().toUpperCase() === expected) return { action: 'none', reason: 'in sync' };
  return { action: 'auto', reason: `segment remapped to ${expected} from category` };
}
