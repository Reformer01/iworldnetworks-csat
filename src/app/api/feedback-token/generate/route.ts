import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { createFeedbackToken, getFeedbackBaseUrl } from '@/lib/feedback-token';
import { isRateLimitedFirestore } from '@/lib/rate-limit-firestore';
import { logError } from '@/lib/logger';
import { z } from 'zod';

const tokenSchema = z.object({
  customerName: z.string().min(1, 'Name is required'),
  customerEmail: z.string().email('Invalid email'),
  servicePlan: z.string().optional().default(''),
  location: z.string().optional().default(''),
  serviceDate: z.string().optional().default(''),
  sourceEvent: z.string().optional().default(''),
});

export async function POST(request: NextRequest) {
  try {
    if (await isRateLimitedFirestore(request, 20, 60 * 1000)) {
      return NextResponse.json({ success: false, error: 'Too many requests.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON.' }, { status: 400 });
    }

    const validation = tokenSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed.', details: validation.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = validation.data;
    const db = getAdminFirestore();
    const { token } = await createFeedbackToken(db, data);

    return NextResponse.json({
      success: true,
      token,
      url: `${getFeedbackBaseUrl(request)}/feedback?token=${token}`,
    });
  } catch (err) {
    logError('[feedback-token-generate] POST error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
