import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { z } from 'zod';
import { validateOrigin, forbidden } from '@/lib/api-response';

const updateFeedbackSchema = z.object({
  feedbackId: z.string().min(1, 'feedbackId is required'),
  status: z.enum(['open', 'resolved']),
  resolutionNotes: z.string().max(1000, 'Resolution notes must be under 1000 characters').optional().default(''),
}).strict();

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limiting (60 updates per minute per IP)
    if (isRateLimited(request, 60, 60 * 1000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests.' },
        { status: 429 }
      );
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);

    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized Administrative Access.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    // 2. Schema validation
    const validation = updateFeedbackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed.', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { feedbackId, status, resolutionNotes } = validation.data;

    const db = getAdminFirestore();
    const docRef = db.collection('feedbacks').doc(feedbackId);
    
    // Check if document exists
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json(
        { success: false, error: 'Feedback document not found.' },
        { status: 404 }
      );
    }

    await docRef.update({
      status,
      resolutionNotes,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    logError('[update-feedback] POST error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
