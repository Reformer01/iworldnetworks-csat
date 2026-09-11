import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { CHURN_REASONS } from '@/lib/churn-reasons';

export const dynamic = 'force-dynamic';

const FETCH_LIMIT = 5000;

interface ChurnResponse {
  token: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  rating: number | null;
  reason: string | null;
  comment: string;
  sentAt: number | null;
  submittedAt: number | null;
  clientIp: string;
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const rows = await prisma.churnSurvey.findMany({
      orderBy: { sentAt: 'desc' },
      take: FETCH_LIMIT,
    });

    const responses: ChurnResponse[] = [];
    let totalSent = 0;
    let responded = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const reasonBreakdown: Record<string, number> = Object.fromEntries(CHURN_REASONS.map((r) => [r, 0]));

    for (const row of rows) {
      totalSent++;
      if (row.used) {
        responded++;
        const rating = row.rating != null ? Number(row.rating) : null;
        if (rating && rating >= 1 && rating <= 5) {
          ratingSum += rating;
          ratingCount++;
          ratingDistribution[rating]++;
        }
        const reason = row.reason ?? '';
        if (reason && reason in reasonBreakdown) reasonBreakdown[reason]++;
        responses.push({
          token: row.id,
          customerId: row.customerId,
          customerName: row.customerName,
          customerEmail: row.customerEmail,
          rating,
          reason: row.reason,
          comment: row.comment ?? '',
          sentAt: row.sentAt != null ? Number(row.sentAt) : null,
          submittedAt: row.submittedAt != null ? Number(row.submittedAt) : null,
          clientIp: row.clientIp ?? '',
        });
      }
    }

    responses.sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));

    const summary = {
      totalSent,
      responded,
      responseRate: totalSent > 0 ? Math.round((responded / totalSent) * 100) : 0,
      avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
      ratingDistribution,
      reasonBreakdown,
    };

    return NextResponse.json({ summary, responses });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-churn] GET error', { error: message });
    return serverError();
  }
}
