import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { z } from 'zod';
import { validateOrigin, forbidden } from '@/lib/api-response';

const deleteFeedbackSchema = z.object({
  feedbackId: z.string().min(1, 'feedbackId is required'),
}).strict();

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting
    if (isRateLimited(request, 60, 60 * 1000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests.' },
        { status: 429 }
      );
    }

    if (!validateOrigin(request)) return forbidden();

    // 2. Auth verification
    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized Administrative Access.' },
        { status: 401 }
      );
    }

    // 3. Body parsing & validation
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const validation = deleteFeedbackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed.', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { feedbackId } = validation.data;

    // 4. Firestore delete
    const db = getAdminFirestore();
    const docRef = db.collection('feedbacks').doc(feedbackId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'Feedback record not found.' },
        { status: 404 }
      );
    }

    await docRef.delete();

    return NextResponse.json({ success: true, message: 'Feedback record deleted successfully.' }, { status: 200 });
  } catch (err: unknown) {
    logError('[delete-feedback] POST error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
