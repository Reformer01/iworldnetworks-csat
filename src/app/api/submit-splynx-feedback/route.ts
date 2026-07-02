import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { mapSplynxEventToCategory } from '@/lib/splynx-categories';
import { logError } from '@/lib/logger';
import { z } from 'zod';

const splynxFeedbackSchema = z.object({
  token: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  satisfied: z.enum(['yes', 'no', 'partially']).optional(),
  comment: z.string().max(1000).optional().default(''),
  ratings: z.object({
    stability: z.coerce.number().min(1).max(5).optional(),
    latency: z.coerce.number().min(1).max(5).optional(),
    peakPerformance: z.coerce.number().min(1).max(5).optional(),
    professionalism: z.coerce.number().min(1).max(5).optional(),
    clarity: z.coerce.number().min(1).max(5).optional(),
    responsiveness: z.coerce.number().min(1).max(5).optional(),
    knowledge: z.coerce.number().min(1).max(5).optional(),
    friendliness: z.coerce.number().min(1).max(5).optional(),
    fcr: z.enum(['Yes', 'No']).optional(),
    resolutionSpeed: z.coerce.number().min(1).max(5).optional(),
    repairQuality: z.coerce.number().min(1).max(5).optional(),
    conduct: z.coerce.number().min(1).max(5).optional(),
    signal: z.coerce.number().min(1).max(5).optional(),
    punctuality: z.coerce.number().min(1).max(5).optional(),
    quality: z.coerce.number().min(1).max(5).optional(),
    explanation: z.coerce.number().min(1).max(5).optional(),
    timeliness: z.coerce.number().min(1).max(5).optional(),
    accuracy: z.coerce.number().min(1).max(5).optional(),
    reconnection: z.coerce.number().min(1).max(5).optional(),
    usedPortal: z.enum(['Yes', 'No']).optional(),
    portalEase: z.coerce.number().min(1).max(5).optional(),
  }).partial().optional().default({}),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON.' }, { status: 400 });
    }

    const validation = splynxFeedbackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed.', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { token, rating, satisfied, comment, ratings } = validation.data;
    const db = getAdminFirestore();
    const tokenRef = db.collection('feedback_tokens').doc(token);

    const now = new Date();
    const nowISO = now.toISOString();
    const feedbackRef = db.collection('feedbacks').doc();

    const result = await db.runTransaction(async (transaction) => {
      const tokenDoc = await transaction.get(tokenRef);
      if (!tokenDoc.exists) {
        return { status: 404, body: { success: false, error: 'Invalid token.' } };
      }

      const tokenData = tokenDoc.data()!;
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
          ...ratings,
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
