import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { isRateLimitedFirestore } from '@/lib/rate-limit-firestore';
import { validateOrigin, unauthorized } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { feedbackSchema } from '@/lib/validations/feedback';
import { analyzeCustomerFeedbackSentiment } from '@/ai/flows/analyze-customer-feedback-sentiment';

const AI_ANALYSIS_TIMEOUT_MS = 3500;

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function analyzeFeedbackWithTimeout(feedbackText: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const analysisPromise = analyzeCustomerFeedbackSentiment({ feedbackText }).catch((error) => {
    console.warn('[submit-feedback] AI analysis skipped:', error);
    return null;
  });

  const timeoutPromise = new Promise<null>((resolve) => {
    timeout = setTimeout(() => {
      console.warn('[submit-feedback] AI analysis skipped: timed out.');
      resolve(null);
    }, AI_ANALYSIS_TIMEOUT_MS);
  });

  const result = await Promise.race([analysisPromise, timeoutPromise]);
  if (timeout) clearTimeout(timeout);
  return result;
}

export async function POST(request: NextRequest) {
  try {
    if (!validateOrigin(request)) return unauthorized();

    // 1. Rate limiting (10 submissions per minute per IP)
    if (await isRateLimitedFirestore(request, 10, 60 * 1000)) {
      return NextResponse.json({ success: false, error: 'Too many requests. Please try again in a minute.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    // 2. Strict validation using Zod
    const validation = feedbackSchema.safeParse(body);
    if (!validation.success) {
      const errorMap = validation.error.flatten().fieldErrors;
      return NextResponse.json({ success: false, error: 'Validation failed.', details: errorMap }, { status: 400 });
    }

    const sanitizedData = validation.data;
    const db = getAdminFirestore();
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown';
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) || 'unknown';
    const submittedAt = sanitizedData.dateSubmitted || sanitizedData.submissionDate;
    const experiencedAt = sanitizedData.dateFeedback || sanitizedData.serviceDate;
    const submittedDate = parseDate(submittedAt);
    const now = new Date();
    let aiAnalysis = null;

    if (sanitizedData.comment.length > 10) {
      aiAnalysis = await analyzeFeedbackWithTimeout(sanitizedData.comment);
    }

    const feedbackData: Record<string, unknown> = {
      ...sanitizedData,
      customerName: sanitizedData.customerName || '',
      customerEmail: sanitizedData.customerEmail || '',
      aiAnalysis,
      serviceDate: sanitizedData.serviceDate || sanitizedData.dateFeedback || '',
      submissionDate: sanitizedData.submissionDate || sanitizedData.dateSubmitted || '',
      dateFeedback: experiencedAt || '',
      dateSubmitted: submittedAt || now.toISOString(),
      timestamp: submittedDate?.getTime() ?? now.getTime(),
      dateFormatted: submittedDate?.toISOString() ?? now.toISOString(),
      status: 'open',
      _source: 'web-form',
      clientIp,
      userAgent,
    };

    if (sanitizedData.isAnonymous === true) {
      delete feedbackData.customerName;
      delete feedbackData.customerEmail;
      delete feedbackData.isAnonymous;
    }

    const docRef = await db.collection('feedbacks').add(feedbackData);

    return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
  } catch (err: unknown) {
    logError('[submit-feedback] Error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
