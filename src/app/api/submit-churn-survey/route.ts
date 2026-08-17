import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { isRateLimitedFirestore } from '@/lib/rate-limit-firestore';
import { validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { CHURN_COLLECTION } from '@/lib/splynx-mirror-types';
import { CHURN_REASONS } from '@/lib/churn-reasons';
import { z } from 'zod';

const churnSurveySchema = z.object({
  token: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  reason: z.enum(CHURN_REASONS),
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

    const validation = churnSurveySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed.', details: validation.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { token, rating, reason, comment } = validation.data;
    const db = getAdminFirestore();
    const surveyRef = db.collection(CHURN_COLLECTION).doc(token);
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'unknown';

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(surveyRef);
      if (!doc.exists) {
        return { status: 404, body: { success: false, error: 'Invalid link.' } };
      }

      const data = doc.data() ?? {};
      if (data.used) {
        return { status: 410, body: { success: false, error: 'This link has already been used.' } };
      }
      if (Date.now() > data.expiresAt) {
        return { status: 410, body: { success: false, error: 'This link has expired.' } };
      }

      transaction.update(surveyRef, {
        used: true,
        submittedAt: Date.now(),
        rating,
        reason,
        comment,
        clientIp,
      });

      return { status: 200, body: { success: true } };
    });

    if (result.status === 200) {
      // Mirror the submission to MariaDB (best-effort; DB-first survey store).
      try {
        const { markChurnSurveyUsed } = await import('@/lib/lib/db/churn');
        await markChurnSurveyUsed(token, Date.now(), rating, reason, comment);
        const { prisma } = await import('@/lib/prisma');
        await prisma.churnSurvey.update({
          where: { id: token },
          data: { clientIp },
        });
      } catch (dbErr) {
        logError('[submit-churn-survey] MariaDB mirror failed (best-effort)', {
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }
    }

    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    logError('[submit-churn-survey] Error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
