import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifySupportToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError, logInfo } from '@/lib/logger';
import { withCache, clearRouteCache } from '@/lib/route-cache';
import {
  normalizePeriod,
  rollingWindowStart,
  periodEnd,
  periodBucketStart,
  getStaffMembers,
  getTicketsForStaff,
  getFeedbackForStaff,
  computeStaffKPIs,
  buildTeamAverages,
  persistStaffKPIs,
  type SupportStaffKPI,
} from '@/lib/staff-kpis';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const user = await verifySupportToken(authHeader);
    if (!user) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const period = normalizePeriod(searchParams.get('period'));
    const staffId = searchParams.get('staffId');

    // Rolling window so live views always have data; persisted records use
    // calendar buckets instead (see persistStaffKPIs).
    const start = rollingWindowStart(period);
    const end = periodEnd();

    const db = getAdminFirestore();

    const data = await withCache(`staff-metrics-${period}|${staffId ?? 'all'}`, 60 * 1000, async () => {
      const staffMembers = await getStaffMembers(db);

      // Filter by staffId if provided
      const staffToProcess = staffId ? staffMembers.filter((s) => s.id === staffId) : staffMembers;

      const kpis: SupportStaffKPI[] = await Promise.all(
        staffToProcess.map(async (staff) => {
          const [tickets, feedbacks] = await Promise.all([
            getTicketsForStaff(db, staff, start, end),
            getFeedbackForStaff(db, staff, start, end),
          ]);
          return computeStaffKPIs(staff, tickets, feedbacks, start, end);
        }),
      );

      return {
        period,
        periodStart: start,
        periodEnd: end,
        teamAverages: buildTeamAverages(kpis),
        staffKPIs: kpis,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        calculatedAt: Date.now(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[support-staff-metrics] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 10, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const user = await verifySupportToken(authHeader);
    if (!user) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const period = normalizePeriod(searchParams.get('period'));

    const db = getAdminFirestore();

    // Persist against the calendar bucket (idempotent per period), not the
    // rolling window, so history stays stable across the day.
    const { kpis, periodStart, periodEnd: end } = await persistStaffKPIs(db, { period, calculatedBy: user.email });

    clearRouteCache();

    logInfo('[support-staff-metrics] KPI snapshot saved', { period, periodStart, staffCount: kpis.length });

    return NextResponse.json({
      success: true,
      data: {
        period,
        periodStart,
        periodEnd: end,
        teamAverages: buildTeamAverages(kpis),
        staffKPIs: kpis,
        saved: true,
        snapshotId: `${period}_${periodStart}`,
        calculatedAt: Date.now(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[support-staff-metrics] POST error', { error: message });
    return serverError();
  }
}
