import { getAdminFirestore } from '@/lib/firebase-admin';

type AuditAction = 'create' | 'update' | 'delete' | 'import';

interface AuditEntry {
  action: AuditAction;
  collection: string;
  recordId?: string;
  userId: string;
  userEmail: string;
  changes?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export async function writeAuditLog(entry: AuditEntry) {
  const db = getAdminFirestore();
  await db.collection('sales_audit_log').add({
    ...entry,
    timestamp: Date.now(),
  });
}
