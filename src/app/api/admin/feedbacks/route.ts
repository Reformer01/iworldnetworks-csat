import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, serverError, error, notFound, forbidden, tooMany, validateOrigin } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit-log';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface FeedbackQuery {
  category?: string;
  location?: string;
  staffName?: string;
  status?: string;
  limit?: number;
  page?: number;
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const location = searchParams.get('location');
    const staffName = searchParams.get('staffName');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const start = (page - 1) * limit;

    const db = getAdminFirestore();
    let query = db.collection('feedbacks').orderBy('timestamp', 'desc');

    if (category) query = query.where('category', '==', category);
    if (location) query = query.where('location', '==', location);
    if (status) query = query.where('status', '==', status);

    const snapshot = await query.limit(limit + start).get();
    const docs = snapshot.docs;

    if (docs.length <= start) {
      return success({ feedbacks: [], page, pageSize: limit, total: 0 });
    }

    const filtered = docs.slice(start, start + limit);
    const feedbacks: FeedbackDoc[] = filtered.map((doc) => ({ id: doc.id, ...doc.data() }) as FeedbackDoc);
    const total = Math.max(snapshot.size - start, 0);

    return success({
      feedbacks,
      page,
      pageSize: limit,
      total,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-feedbacks] GET error', { error: message });
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

    const { id, ...updates } = body;
    const db = getAdminFirestore();
    const docRef = db.collection('feedbacks').doc(id);
    const prev = await docRef.get();

    if (!prev.exists) {
      return notFound('Feedback not found.');
    }

    await docRef.update({
      ...updates,
      updatedAt: Date.now(),
    });

    await writeAuditLog({
      action: 'update',
      collection: 'feedbacks',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: updates,
      previousState: prev.data() as Record<string, unknown>,
    });

    return success({});
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-feedbacks] PUT error', { error: message });
    return serverError();
  }
}
