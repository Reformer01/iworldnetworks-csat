import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logWarn } from '@/lib/logger';
import { getAdminFirestore } from '@/lib/firebase-admin';

type AuditAction = 'create' | 'update' | 'delete' | 'import' | 'restore' | 'revert_import';

// JSON-serializable value type (matches Prisma.InputJsonValue structure).
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface AuditEntry {
  action: AuditAction;
  collection: string;
  recordId?: string;
  userId: string;
  userEmail: string;
  changes?: unknown;
  previousState?: unknown;
  metadata?: unknown;
  timestamp?: number;
}

/**
 * Admin audit trail (was Firestore: sales_audit_log). MariaDB-first; the
 * Firestore write is a best-effort mirror. Never throws — an audit failure
 * must not fail the underlying operation.
 */
export async function writeAuditLog(entry: AuditEntry) {
  const timestamp = entry.timestamp ?? Date.now();
  try {
    await prisma.salesAuditLog.create({
      data: {
        action: entry.action,
        collection: entry.collection,
        recordId: entry.recordId,
        userId: entry.userId,
        userEmail: entry.userEmail,
        // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
        changes: (entry.changes as Prisma.InputJsonValue | undefined) ?? undefined,
        // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
        previousState: (entry.previousState as Prisma.InputJsonValue | undefined) ?? undefined,
        // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
        metadata: (entry.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        timestamp: BigInt(timestamp),
      },
    });
  } catch (dbErr) {
    logWarn('[audit-log] MariaDB write failed', {
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      collection: entry.collection,
    });
    try {
      await getAdminFirestore()
        .collection('sales_audit_log')
        .add({
          ...entry,
          timestamp,
        });
    } catch (fsErr) {
      logWarn('[audit-log] Firestore mirror failed (best-effort)', {
        error: fsErr instanceof Error ? fsErr.message : String(fsErr),
      });
    }
  }
}
