/**
 * Firestore free-tier read-budget governor.
 *
 * Spark (free) tier: 50k reads/day. The 6h Splynx sync alone costs ~30k
 * reads, so the remaining headroom for admin dashboards is tight. This module
 * tracks an ESTIMATED daily read count (in-memory accumulator, flushed to a
 * meta doc on a debounce) and lets the sync orchestrator decide what to run:
 *
 *   - below CRITICAL_CAP:      run everything (mirror + reminders + churn)
 *   - CRITICAL_CAP .. ABSOLUTE: run only the core mirror, skip email jobs
 *   - above ABSOLUTE_CAP:      skip the entire sync run (catch up next time)
 *
 * The counter is an estimate, not an exact meter — it exists to stop a
 * quota-blowout, not to bill precisely. Records are accumulated in memory and
 * flushed at most once per FLUSH_INTERVAL_MS (bounded writes).
 */

import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { logInfo, logWarn } from '@/lib/logger';

export const SPARK_DAILY_READS = 50_000;
/** Above this, skip non-critical email jobs during sync. */
export const CRITICAL_CAP = 42_000;
/** Above this, skip the whole sync run. */
export const ABSOLUTE_CAP = 46_000;

const BUDGET_COLLECTION = 'splynx_meta';
const BUDGET_DOC = 'readBudget';
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

let pendingReads = 0;
let lastFlushAt = 0;

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Current estimated usage for today. Lazily resets the counter doc when the
 * day rolls over (one extra write per day).
 */
export async function getBudgetState(
  db: Firestore,
  now = new Date(),
): Promise<{ date: string; used: number; cap: number; remaining: number }> {
  const ref = db.collection(BUDGET_COLLECTION).doc(BUDGET_DOC);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() as { date?: string; reads?: number }) : {};
  const today = todayKey(now);

  if (data.date !== today) {
    // New day: reset (best-effort; don't fail the caller on write errors).
    try {
      await ref.set({ date: today, reads: pendingReads }, { merge: true });
    } catch {
      // Ignore — counter will self-heal on the next flush.
    }
    return { date: today, used: pendingReads, cap: SPARK_DAILY_READS, remaining: SPARK_DAILY_READS - pendingReads };
  }

  const used = Number(data.reads || 0) + pendingReads;
  return { date: today, used, cap: SPARK_DAILY_READS, remaining: SPARK_DAILY_READS - used };
}

/** Accumulate estimated reads (in memory; flushed on a debounce). */
export function recordReads(count: number): void {
  if (!Number.isFinite(count) || count <= 0) return;
  pendingReads += Math.round(count);
}

/**
 * Flush accumulated reads to the counter doc. Debounced to at most one write
 * per FLUSH_INTERVAL_MS. Fire-and-forget: failures re-accumulate for the next
 * flush rather than throwing.
 */
export async function flushReads(db: Firestore, now = Date.now()): Promise<void> {
  if (pendingReads === 0) return;
  if (now - lastFlushAt < FLUSH_INTERVAL_MS) return;
  lastFlushAt = now;

  const count = pendingReads;
  pendingReads = 0;
  try {
    await db
      .collection(BUDGET_COLLECTION)
      .doc(BUDGET_DOC)
      .set({ reads: FieldValue.increment(count), date: todayKey() }, { merge: true });
  } catch (err) {
    // Put it back; the next flush will retry.
    pendingReads += count;
    logWarn('[read-budget] flush failed, reads retained in memory', { error: String(err) });
  }
}

/** Sync-run decision helper: what is the budget willing to run right now? */
export function syncBudgetDecision(used: number): { runSync: boolean; runEmailJobs: boolean } {
  const runSync = used < ABSOLUTE_CAP;
  const runEmailJobs = used < CRITICAL_CAP;
  return { runSync, runEmailJobs };
}

export function logBudgetStatus(budget: { date: string; used: number; remaining: number }): void {
  logInfo('[read-budget] status', {
    date: budget.date,
    used: budget.used,
    remaining: budget.remaining,
    pctUsed: Math.round((budget.used / SPARK_DAILY_READS) * 100),
  });
}
