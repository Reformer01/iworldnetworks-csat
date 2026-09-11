// Reconciliation job (Leaf D): sales records (SalesRecordEntry) are diffed
// against the unified customer truth (Customer rows matched/manual with a
// btsName). Every action — fill, auto-fix, flag — writes a ReconciliationLog
// row (kind='record'); 'none' writes nothing. Only bts/mrc/segment are ever
// touched; period/dates/agent fields are off-limits (PLAN.md policy).
//
// Runs after every Splynx and UISP sync (schedulers) — the 15-min cadence
// subsumes the plan's daily full sweep. Env-gated via RECONCILE_ENABLED
// (default true). Sales history is never modified.

import { prisma } from '@/lib/prisma';
import { logInfo, logWarn } from '@/lib/logger';
import { normalizeName } from '@/lib/matching/normalize';
import { decideRecordBts, decideMrr, decideSegment, segmentForCategory } from './decide';
import type { ReconcileStats } from './types';

// The generated Prisma client predates Leaf A's schema additions
// (ReconciliationLog, Customer.matchState/btsName) — access them through a
// cast, removable once `prisma generate` has run with the current schema.
const reconciliationLog = (prisma as unknown as {
  reconciliationLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
}).reconciliationLog;

interface CustomerTruth {
  id: string;
  customerName: string | null;
  btsName: string | null;
  mrrTotal: number | null;
  category: string | null;
  accountType: string | null;
}

interface RecordRow {
  id: string;
  customerName: string;
  bts: string;
  mrc: number;
  segment: string;
}

// Fields the engine is allowed to write on a sales record. Anything else
// (period, dates, agent, ...) is out of scope for this leaf.
const RECORD_FIELDS = ['bts', 'mrc', 'segment'] as const;

export async function runReconciliation(now?: number): Promise<ReconcileStats> {
  const ts = now ?? Date.now();
  const startedAt = Date.now();

  if (process.env.RECONCILE_ENABLED === 'false') {
    logInfo('[reconcile] disabled via RECONCILE_ENABLED=false');
    return { recordsScanned: 0, autoFixed: 0, flagged: 0, filled: 0, unchanged: 0, elapsedMs: 0 };
  }

  const records = (await prisma.salesRecordEntry.findMany({
    where: { deletedAt: null },
    select: { id: true, customerName: true, bts: true, mrc: true, segment: true },
  })) as unknown as RecordRow[];

  const customers = (await prisma.customer.findMany({
    where: { deleted: false, matchState: { in: ['matched', 'manual'] }, btsName: { not: null } } as never,
    select: { id: true, customerName: true, btsName: true, mrrTotal: true, category: true, accountType: true } as never,
  })) as unknown as CustomerTruth[];

  const customerByName = new Map<string, CustomerTruth>();
  for (const customer of customers) {
    if (customer.customerName) {
      // Collisions (two customers normalizing to one name): first wins.
      // Exact-name join; switch to a scored join if dup names ever matter.
      const key = normalizeName(customer.customerName);
      if (key && !customerByName.has(key)) customerByName.set(key, customer);
    }
  }

  const stats: ReconcileStats = { recordsScanned: records.length, autoFixed: 0, flagged: 0, filled: 0, unchanged: 0, elapsedMs: 0 };

  for (const record of records) {
    try {
      const customer = customerByName.get(normalizeName(record.customerName));
      if (!customer) {
        stats.unchanged++;
        continue;
      }

      interface Action {
        field: (typeof RECORD_FIELDS)[number];
        beforeValue: { value: unknown };
        afterValue: { value: unknown };
        action: 'auto' | 'flag';
        reason: string;
      }
      const actions: Action[] = [];

      // bts: fill when missing, flag when it drifted.
      const btsDecision = decideRecordBts(record.bts, customer.btsName);
      if (btsDecision.action === 'fill') {
        actions.push({ field: 'bts', beforeValue: { value: record.bts }, afterValue: { value: customer.btsName }, action: 'auto', reason: 'filled from unified truth' });
        stats.filled++;
      } else if (btsDecision.action === 'flag') {
        actions.push({ field: 'bts', beforeValue: { value: record.bts }, afterValue: { value: customer.btsName }, action: 'flag', reason: btsDecision.reason });
        stats.flagged++;
      }

      // mrc: auto-fix within ±20%, flag beyond. No truth (null mrrTotal) → skip.
      if (customer.mrrTotal !== null) {
        const mrcDecision = decideMrr(record.mrc, customer.mrrTotal);
        if (mrcDecision.action === 'auto') {
          actions.push({ field: 'mrc', beforeValue: { value: record.mrc }, afterValue: { value: customer.mrrTotal }, action: 'auto', reason: mrcDecision.reason });
          stats.autoFixed++;
        } else if (mrcDecision.action === 'flag') {
          actions.push({ field: 'mrc', beforeValue: { value: record.mrc }, afterValue: { value: customer.mrrTotal }, action: 'flag', reason: mrcDecision.reason });
          stats.flagged++;
        }
      }

      // segment: deterministic from the Splynx category/accountType.
      const category = customer.category ?? customer.accountType;
      const expectedSegment = segmentForCategory(category);
      if (expectedSegment) {
        const segmentDecision = decideSegment(record.segment, category);
        if (segmentDecision.action === 'auto') {
          actions.push({ field: 'segment', beforeValue: { value: record.segment }, afterValue: { value: expectedSegment }, action: 'auto', reason: segmentDecision.reason });
          stats.autoFixed++;
        }
      }

      if (actions.length === 0) {
        stats.unchanged++;
        continue;
      }

      // Apply auto-fixes in one write (flags never touch the record), then
      // audit every action (flags included).
      const autoActions = actions.filter((action) => action.action === 'auto');
      if (autoActions.length > 0) {
        const data: Record<string, unknown> = { updatedAt: BigInt(ts) };
        for (const action of autoActions) data[action.field] = action.afterValue.value;
        await prisma.salesRecordEntry.update({ where: { id: record.id }, data: data as never });
      }

      for (const action of actions) {
        await reconciliationLog.create({
          data: {
            kind: 'record',
            recordId: record.id,
            field: action.field,
            beforeValue: action.beforeValue,
            afterValue: action.afterValue,
            action: action.action,
            reason: action.reason,
            createdAt: BigInt(ts),
          },
        });
      }
    } catch (err) {
      // One bad record must not abort the sweep; it is skipped and counted as
      // unchanged (a later run will retry it).
      logWarn('[reconcile] record failed', {
        id: record.id,
        error: err instanceof Error ? err.message : String(err),
      });
      stats.unchanged++;
    }
  }

  stats.elapsedMs = Date.now() - startedAt;
  logInfo('[reconcile] run finished', { ...stats });
  return stats;
}
