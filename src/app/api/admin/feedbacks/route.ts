import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Rate limiting (120 requests per minute per IP for reading dashboard data)
    if (isRateLimited(request, 120, 60 * 1000)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests.' },
        { status: 429 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);

    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized Administrative Access.' },
        { status: 401 }
      );
    }

    const db = getAdminFirestore();
    const feedbacksSnap = await db
      .collection('feedbacks')
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    const feedbacks = feedbacksSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ success: true, feedbacks }, { status: 200 });
  } catch (err: unknown) {
    logError('[admin-feedbacks] GET error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
