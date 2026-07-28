import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { mapSplynxEventToCategory } from '@/lib/splynx-categories';
import { isRateLimitedFirestore } from '@/lib/rate-limit-firestore';
import { validateOrigin, error as apiError } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { z } from 'zod';

const splynxFeedbackSchema = z.object({
  token: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  satisfied: z.enum(['yes', 'no', 'partially']).optional(),
  invoiceAccuracy: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional().default(''),
});

export async function POST(request: NextRequest) {
  try {
    if (await isRateLimitedFirestore(request, 10, 60 * 1000)) {
      return NextResponse.json({ success: false, error: 'Too many requests.' }, { status: 429 });
    }

    if (!validateOrigin(request)) {
      return NextResponse.json({ success: false, error: 'Invalid origin.' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON.' }, { status: 400 });
    }

    const validation = splynxFeedbackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed.', details: validation.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { token, rating, satisfied, invoiceAccuracy, comment } = validation.data;
    const db = getAdminFirestore();
    const tokenRef = db.collection('feedback_tokens').doc(token);
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown';
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) || 'unknown';

    const now = new Date();
    const nowISO = now.toISOString();
    const feedbackRef = db.collection('feedbacks').doc();

    const result = await db.runTransaction(async (transaction) => {
      const tokenDoc = await transaction.get(tokenRef);
      if (!tokenDoc.exists) {
        return { status: 404, body: { success: false, error: 'Invalid token.' } };
      }

      const tokenData = tokenDoc.data() ?? {};
      if (tokenData.used) {
        return { status: 410, body: { success: false, error: 'Token already used.' } };
      }
      if (Date.now() > tokenData.expiresAt) {
        return { status: 410, body: { success: false, error: 'Token expired.' } };
      }

      const category = mapSplynxEventToCategory(tokenData.sourceEvent || '');
      const feedbackData = {
        customerName: tokenData.customerName || '',
        customerEmail: tokenData.customerEmail || '',
        category,
        location: tokenData.location || '',
        servicePlan: tokenData.servicePlan || '',
        ratings: {
          overall: rating,
          invoiceAccuracy: invoiceAccuracy || null,
        },
        satisfied: satisfied || null,
        comment,
        staffName: '',
        referralSource: 'Splynx',
        spotlightInterview: '',
        serviceDate: tokenData.serviceDate || '',
        serviceDateEnd: '',
        serviceTime: '',
        submissionDate: nowISO,
        dateFeedback: tokenData.serviceDate || '',
        dateSubmitted: nowISO,
        timestamp: now.getTime(),
        dateFormatted: nowISO,
        status: 'open',
        _source: 'splynx',
        aiAnalysis: null,
        clientIp,
        userAgent,
      };

      transaction.set(feedbackRef, feedbackData);
      transaction.update(tokenRef, { used: true, submittedAt: now.getTime() });

      return { status: 201, body: { success: true, id: feedbackRef.id } };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logError('[submit-splynx-feedback] Error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
