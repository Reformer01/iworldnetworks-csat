import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { CUSTOMERS_COLLECTION, CHURN_COLLECTION } from '@/lib/splynx-mirror-types';
import { withCache } from '@/lib/route-cache';
import type { CustomerSummary, SyncMeta } from '@/lib/lib/db/customers';

export const dynamic = 'force-dynamic';

const FETCH_LIMIT = 5000;
// Long TTL + min-refresh floor: the snapshot only reloads when the page is
// actually opened AND at least 10 minutes passed AND data changed (sync or
// webhook calls clearRouteCache()). Stale values are served in between.
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const SNAPSHOT_MIN_REFRESH_MS = 10 * 60 * 1000;

// Strangler-fig flag: when '1', reads come from MariaDB via Prisma. Defaults
// to Firestore until the one-time data migration lands (see migration plan).
const useDb = process.env.CUSTOMERS_DB === '1';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isNumberValue(value: JsonValue): value is number {
  return typeof value === 'number';
}

function isStringValue(value: JsonValue): value is string {
  return typeof value === 'string';
}

/** Cached snapshot of non-deleted customers (cheap bulk read, refreshed at most every 10 min). */
async function getCustomersSnapshot(db: ReturnType<typeof getAdminFirestore>): Promise<Array<{ id: string } & Record<string, JsonValue>>> {
  return withCache(
    `customers-snapshot-${FETCH_LIMIT}`,
    SNAPSHOT_TTL_MS,
    async () => {
      const snapshot = await db.collection(CUSTOMERS_COLLECTION).orderBy('customerId', 'desc').limit(FETCH_LIMIT).get();
      return snapshot.docs.filter((doc) => !doc.data().deleted).map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    SNAPSHOT_MIN_REFRESH_MS,
  );
}

/** Firestore count() aggregation — bills ~1 read per 1000 index entries, not per doc. */
async function countWhere(
  db: ReturnType<typeof getAdminFirestore>,
  field: string,
  op: FirebaseFirestore.WhereFilterOp,
  value: string | number | boolean | null,
): Promise<number> {
  try {
    const q = db.collection(CUSTOMERS_COLLECTION).where(field, op, value);
    const snap = await q.count().get();
    return snap.data().count;
  } catch {
    return -1;
  }
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const lifecycle = searchParams.get('lifecycle');
    const status = searchParams.get('status');
    const overdue = searchParams.get('overdue');
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 500);

    // Strangler path: use Prisma when CUSTOMERS_DB=1, otherwise Firestore
    if (useDb) {
      const { getCustomersPage } = await import('@/lib/lib/db/customers');
      const result = await getCustomersPage({
        lifecycle: lifecycle ?? undefined,
        status: status ?? undefined,
        search: search ?? undefined,
        overdue: overdue === 'true' || overdue === 'false' ? overdue : undefined,
        page,
        pageSize,
      });
      return success({
        records: result.records,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        summary: result.summary,
        meta: result.meta,
      });
    }

    // --- Firestore path (original logic) ---
    const db = getAdminFirestore();
    const records = await getCustomersSnapshot(db);

    // --- Summary via count() aggregations (cheap) + cached snapshot fallbacks ---
    const totalCount = await countWhere(db, 'customerId', '!=', 0);
    const summary: CustomerSummary = {
      total: totalCount >= 0 ? totalCount : records.length,
      active: records.filter((r) => r.lifecycle === 'active').length,
      blocked: records.filter((r) => r.lifecycle === 'blocked').length,
      inactive: records.filter((r) => r.lifecycle === 'inactive').length,
      churned: records.filter((r) => r.lifecycle === 'churned').length,
      totalMrr: records.reduce((acc, r) => acc + (isNumberValue(r.mrrTotal) ? r.mrrTotal : 0), 0),
      reminders15: records.filter((r) => r.reminder15SentAt).length,
      reminders30: records.filter((r) => r.reminder30SentAt).length,
      churnSurveySent: records.filter((r) => r.churnSurveySentAt).length,
      churnResponses: 0,
    };

    // Churn survey responses (used links) — count() aggregation.
    try {
      const responses = await db.collection(CHURN_COLLECTION).where('used', '==', true).count().get();
      summary.churnResponses = responses.data().count;
    } catch {
      summary.churnResponses = 0;
    }

    // Sync metadata for the "Sync Now" button state.
    const meta: SyncMeta = { lastSyncAt: null, lastStatus: '', lastError: '', invoicesApiDenied: false };
    const lockSnap = await db
      .collection('sync_locks')
      .doc('splynx-sync')
      .get()
      .catch(() => null);
    if (lockSnap?.exists) {
      const lock = lockSnap.data()!;
      meta.lastSyncAt = isNumberValue(lock.lastRunAt) ? lock.lastRunAt : null;
      meta.lastStatus = lock.lastStatus || '';
      meta.lastError = lock.lastError || '';
    }
    const metaSnap = await db
      .collection('splynx_meta')
      .doc('sync')
      .get()
      .catch(() => null);
    if (metaSnap?.exists) {
      meta.invoicesApiDenied = metaSnap.data()!.invoicesApiDenied === true;
    }

    // --- Filter + paginate in memory (all reads are cached snapshots) ---
    let filtered = records;
    if (lifecycle) filtered = filtered.filter((r) => r.lifecycle === lifecycle);
    if (status) filtered = filtered.filter((r) => r.status === status);
    if (search) {
      filtered = filtered.filter(
        (r) =>
          String(r.customerName || '')
            .toLowerCase()
            .includes(search) ||
          String(r.email || '')
            .toLowerCase()
            .includes(search) ||
          String(r.login || '')
            .toLowerCase()
            .includes(search),
      );
    }

    // Overdue filter — applied to the FULL filtered list before pagination,
    // using the denormalized overdueInfo the sync/webhooks write on the
    // customer doc (no invoice collection scan).
    if (overdue === 'true') {
      // SAFETY: overdueInfo is written by the sync/webhook jobs with exactly
      // this shape; a missing or null value simply falls through the filter.
      filtered = filtered.filter((r) => (r.overdueInfo as { hasOverdueInvoice?: boolean } | null | undefined)?.hasOverdueInvoice === true);
    } else if (overdue === 'false') {
      // SAFETY: same denormalized shape as above; inversion of the overdue check.
      filtered = filtered.filter((r) => (r.overdueInfo as { hasOverdueInvoice?: boolean } | null | undefined)?.hasOverdueInvoice !== true);
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    // Join churn responses for the paged records (max 10 per 'in' query).
    // Single-field query only — no composite index required; 'used' filtered in memory.
    const churnByCustomer = new Map<string, { rating: number | null; reason: string | null; comment: string | null }>();
    if (paged.length) {
      const ids = paged.map((r) => String(r.customerId ?? r.id)).filter(Boolean);
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        const churnSnap = await db
          .collection(CHURN_COLLECTION)
          .where('customerId', 'in', chunk)
          .get()
          .catch(() => null);
        churnSnap?.docs.forEach((doc) => {
          const data = doc.data();
          if (data.used !== true) return;
          churnByCustomer.set(String(data.customerId), {
            rating: isNumberValue(data.rating) ? data.rating : null,
            reason: isStringValue(data.reason) ? data.reason : null,
            comment: isStringValue(data.comment) ? data.comment : null,
          });
        });
      }
    }

    const recordsWithChurn = paged.map((r) => {
      // SAFETY: overdueInfo is written by the sync/webhook jobs with exactly
      // this shape; any other value is treated as absent.
      const overdueInfo =
        (r.overdueInfo as
          | {
              hasOverdueInvoice?: boolean;
              overdueDays?: number;
              overdueInvoiceCount?: number;
              invoiceNumber?: string | null;
              invoiceAmount?: number;
              lastReminderSentAt?: number | null;
              lastReminderType?: string | null;
            }
          | null
          | undefined) || null;
      return {
        ...r,
        churnResponse: churnByCustomer.get(String(r.customerId ?? r.id)) || null,
        overdueInvoice: overdueInfo
          ? {
              hasOverdueInvoice: overdueInfo.hasOverdueInvoice === true,
              overdueDays: overdueInfo.overdueDays ?? 0,
              overdueInvoiceCount: overdueInfo.overdueInvoiceCount ?? 0,
              invoiceNumber: overdueInfo.invoiceNumber ?? null,
              invoiceAmount: overdueInfo.invoiceAmount ?? 0,
              lastReminderSentAt: overdueInfo.lastReminderSentAt ?? null,
              lastReminderType: overdueInfo.lastReminderType ?? null,
            }
          : null,
      };
    });

    return success({
      records: recordsWithChurn,
      total,
      page,
      pageSize,
      totalPages,
      summary,
      meta,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-customers] GET error', { error: message });
    return serverError();
  }
}
