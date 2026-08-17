// Write-ahead mutation journal (MariaDB-first).
//
// Purpose: before ANY multi-step mutation (CSV import, sync run, mirror
// upsert), record an intent row in the `Journal` table. If the process
// crashes between steps (or a commit fails halfway), a `pending` entry is
// left behind — the recovery sweep (`sweepStaleJournals`) surfaces it so an
// operator can see exactly which mutations started but never completed.
//
// Entries are self-cleaning: marked completed/failed after the mutation, and
// stale pending entries are swept lazily by the sweep call which import/sync
// paths run on start.
//
// The Firestore `mutations_journal` collection is retired: the DB table is
// the journal. Prisma is imported dynamically so modules that import this
// (e.g. the rollback Firestore sync) never construct the client at load time
// in tests.

import { logWarn, logInfo } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

export type JournalStatus = 'pending' | 'completed' | 'failed';

// Known journal payload types — extend when adding new journal types.
export interface BtsCsvImportPayload {
  region: string;
  batchId: string;
  rowCount: number;
}

// JSON-serializable value type (matches Prisma.InputJsonValue structure).
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JournalPayload = BtsCsvImportPayload | JsonValue;
export type JournalResult = JsonValue;

export interface JournalEntry {
  id: string;
  type: string;
  status: JournalStatus;
  payload: JournalPayload;
  result?: JournalResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
  /** Pending entries older than this are considered stale (crashed). */
  expiresAt: number;
}

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

export interface BeginOptions {
  type: string;
  payload?: JournalPayload;
}

/**
 * Record the intent to perform a mutation. Returns the journal id.
 * Call `journalComplete` on success or `journalFail` on error.
 */
export async function journalBegin({ type, payload = {} }: BeginOptions): Promise<string> {
  const { prisma } = await import('@/lib/prisma');
  // SAFETY: JournalPayload is a subset of Prisma.InputJsonValue (JSON-serializable).
  const row = await prisma.journal.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      status: 'pending',
    },
  });
  return row.id;
}

/** Mark a journal entry completed after a successful mutation. */
export async function journalComplete(journalId: string, result?: JournalResult): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  // SAFETY: JournalResult is a subset of Prisma.InputJsonValue (JSON-serializable).
  await prisma.journal.update({
    where: { id: journalId },
    data: {
      status: 'completed',
      result: (result ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/** Mark a journal entry failed after a caught error. */
export async function journalFail(journalId: string, error: string): Promise<void> {
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.journal.update({
      where: { id: journalId },
      data: {
        status: 'failed',
        error: error.slice(0, 2000),
      },
    });
  } catch {
    // The journal must never take down the actual mutation path.
  }
}

/**
 * Find pending journal entries that are older than the staleness window.
 * These represent mutations that started but never completed (crash, deploy,
 * timeout). Returns them so callers can alert / reconcile.
 */
export async function sweepStaleJournals(opts: { type?: string; limit?: number } = {}): Promise<JournalEntry[]> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);

    const rows = await prisma.journal.findMany({
      where: {
        status: 'pending',
        createdAt: { lt: staleBefore },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const stale = rows
      .filter((entry) => !opts.type || entry.type === opts.type)
      .slice(0, opts.limit ?? 20)
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        // SAFETY: Journal status is always one of the valid enum values in DB.
        status: entry.status as JournalStatus,
        // SAFETY: Journal payload stored as JSON matches JournalPayload union.
        payload: (entry.payload ?? {}) as JournalPayload,
        // SAFETY: Journal result stored as JSON matches JournalResult.
        result: (entry.result ?? undefined) as JournalResult | undefined,
        error: entry.error ?? undefined,
        createdAt: entry.createdAt.getTime(),
        updatedAt: entry.updatedAt.getTime(),
        expiresAt: entry.createdAt.getTime() + STALE_AFTER_MS,
      }));

    if (stale.length > 0) {
      logWarn('[journal] Found stale pending mutations (started but never completed)', {
        count: stale.length,
        types: stale.map((s) => s.type),
      });
    }
    return stale;
  } catch (err) {
    // Sweep is best-effort; an outage must not block imports.
    logWarn('[journal] Sweep failed (non-fatal)', { error: String(err) });
    return [];
  }
}

/**
 * Convenience wrapper: sweep stale journals and log them. Called at the start
 * of import/sync paths so operators see crashed mutations early.
 */
export async function sweepAndReportStaleJournals(opts: { type?: string } = {}): Promise<void> {
  const stale = await sweepStaleJournals(opts);
  if (stale.length > 0) {
    logInfo('[journal] Stale pending mutations — inspect Journal table', {
      ids: stale.map((s) => s.id),
      types: stale.map((s) => s.type),
    });
  }
}
