import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, serverError, error, notFound, forbidden, tooMany, validateOrigin } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit-log';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { logError } from '@/lib/logger';
import { withCache, clearRouteCache } from '@/lib/route-cache';
import { getFeedbacks } from '@/lib/lib/db/feedbacks';

export const dynamic = 'force-dynamic';

// Strangler-fig flag: when '1', reads come from MariaDB via Prisma. Defaults
// to Firestore until the one-time data migration lands (see migration plan).
const useDb = process.env.FEEDBACKS_DB === '1';

async function fetchAllFeedbacks(): Promise<FeedbackDoc[]> {
  if (useDb) {
    return getFeedbacks(1000);
  }
  const db = getAdminFirestore();
  const snapshot = await withCache('feedbacks-latest-1000', 60 * 1000, async () =>
    db.collection('feedbacks').orderBy('timestamp', 'desc').limit(1000).get(),
  );
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
    const category = searchParams.get('category');
    const location = searchParams.get('location');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const start = (page - 1) * limit;

    let docs = await fetchAllFeedbacks();

    if (category) docs = docs.filter((doc) => doc.category === category);
    if (location) docs = docs.filter((doc) => doc.location === location);
    if (status) docs = docs.filter((doc) => doc.status === status);

    if (docs.length <= start) {
      return success({ feedbacks: [], page, pageSize: limit, total: docs.length });
    }

    const feedbacks = docs.slice(start, start + limit);
    const total = docs.length;

    return success({
      feedbacks,
      page,
      pageSize: limit,
      total,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-feedbacks] GET error', { error: message });

    if (message.includes('requires an index') || message.includes('FAILED_PRECONDITION')) {
      return error('Query requires a Firestore composite index. Run: firebase deploy --only firestore:indexes', 412);
    }

    return serverError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Feedback ID required.');
    }

    const { id, ...rest } = body;
    const ALLOWED_FIELDS: (keyof FeedbackDoc)[] = [
      'status',
      'staffName',
      'category',
      'comment',
      'location',
      'servicePlan',
      'ratings',
      'satisfied',
      'aiAnalysis',
    ];
    const updates: Partial<FeedbackDoc> = { updatedAt: Date.now() };
    for (const key of ALLOWED_FIELDS) {
      if (key in rest) updates[key] = rest[key];
    }

    const db = getAdminFirestore();
    const docRef = db.collection('feedbacks').doc(id);
    const prev = await docRef.get();

    if (!prev.exists) {
      return notFound('Feedback not found.');
    }

    await docRef.update(updates);

    await writeAuditLog({
      action: 'update',
      collection: 'feedbacks',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: updates,
      previousState: prev.data(),
    });

    clearRouteCache();

    return success({});
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-feedbacks] PUT error', { error: message });
    return serverError();
  }
}
