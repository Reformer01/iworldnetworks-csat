import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createFeedback } from '@/lib/lib/db/feedbacks';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { logError, logWarn } from '@/lib/logger';
import { feedbackSchema } from '@/lib/validations/feedback';
import { isNegativeFeedback } from '@/lib/feedback-negativity';
import { validateOrigin, forbidden } from '@/lib/api-response';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { getAdminFirestore } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting
    if (isRateLimited(request, 60, 60 * 1000)) {
      return NextResponse.json({ success: false, error: 'Too many requests.' }, { status: 429 });
    }

    if (!validateOrigin(request)) return forbidden();

    // 2. Auth verification
    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized Administrative Access.' }, { status: 401 });
    }

    // 3. Body parsing & validation
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const validation = feedbackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed.', details: validation.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const sanitizedData = validation.data;
    const id = randomUUID();

    const feedbackData = {
      ...sanitizedData,
      timestamp: sanitizedData.dateSubmitted ? new Date(sanitizedData.dateSubmitted).getTime() : Date.now(),
      dateFormatted: sanitizedData.dateSubmitted ? new Date(sanitizedData.dateSubmitted).toISOString() : new Date().toISOString(),
      status: isNegativeFeedback(sanitizedData) ? 'open' : 'resolved',
      _source: 'admin-panel',
    };

    // 4. MariaDB write (source of truth)
    await createFeedback({ id, ...(feedbackData as Partial<FeedbackDoc>) });

    // 5. Best-effort Firestore mirror (rollback only)
    try {
      await getAdminFirestore().collection('feedbacks').doc(id).set(feedbackData);
    } catch (mirrorErr) {
      logWarn('[create-feedback] Firestore mirror failed (best-effort)', {
        error: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
      });
    }

    return NextResponse.json({ success: true, id, message: 'Feedback logged manually.' }, { status: 201 });
  } catch (err: unknown) {
    logError('[create-feedback] POST error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
