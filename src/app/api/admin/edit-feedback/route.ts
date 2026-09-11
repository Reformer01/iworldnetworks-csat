import { NextRequest, NextResponse } from 'next/server';
import { getFeedbackById, updateFeedback } from '@/lib/lib/db/feedbacks';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { logError, logWarn } from '@/lib/logger';
import { feedbackSchema } from '@/lib/validations/feedback';
import { z } from 'zod';
import { validateOrigin, forbidden } from '@/lib/api-response';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { FeedbackDoc } from '@/lib/feedback-types';

const editFeedbackSchema = feedbackSchema
  .partial()
  .extend({
    feedbackId: z.string().min(1, 'feedbackId is required'),
    status: z.enum(['open', 'resolved', 'escalated']).optional(),
    resolutionNotes: z.string().max(1000).optional(),
  })
  .strict();

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

    const validation = editFeedbackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed.', details: validation.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { feedbackId, ...updateFields } = validation.data;

    // 4. MariaDB update (source of truth)
    const existing = await getFeedbackById(feedbackId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Feedback record not found.' }, { status: 404 });
    }

    const cleanedFields: Record<string, unknown> = Object.fromEntries(Object.entries(updateFields).filter(([_, v]) => v !== undefined));

    cleanedFields.updatedAt = Date.now();

    await updateFeedback(feedbackId, cleanedFields as Partial<FeedbackDoc>);

    // 5. Best-effort Firestore mirror (rollback only)
    try {
      await getAdminFirestore().collection('feedbacks').doc(feedbackId).update(cleanedFields);
    } catch (mirrorErr) {
      logWarn('[edit-feedback] Firestore mirror failed (best-effort)', {
        error: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
      });
    }

    return NextResponse.json({ success: true, message: 'Feedback record updated successfully.' }, { status: 200 });
  } catch (err: unknown) {
    logError('[edit-feedback] POST error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
