import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, tooMany, serverError } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import type { SupportStaffKPI } from '@/lib/sales-types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get('staffId');
    const period = searchParams.get('period') || 'month';

    const now = Date.now();
    let periodStart: number;
    let periodEnd: number = Date.now();

    switch (period) {
      case 'week':
        periodStart = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        periodStart = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case 'quarter':
        periodStart = now - 90 * 24 * 60 * 60 * 1000;
        break;
      case 'year':
        periodStart = now - 365 * 24 * 60 * 60 * 1000;
        break;
      default:
        periodStart = now - 30 * 24 * 60 * 60 * 1000;
    }

    const db = getAdminFirestore();

    let query = db.collection('support_staff_kpis').where('periodStart', '>=', periodStart).orderBy('periodStart', 'desc');

    if (staffId) {
      query = query.where('staffId', '==', staffId);
    }

    const snapshot = await query.get();
    let kpis: SupportStaffKPI[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as SupportStaffKPI);

    // Firestore only allows range on one field; filter periodEnd in-memory
    kpis = kpis.filter((kpi) => kpi.periodEnd <= periodEnd).slice(0, 50);

    // Group by staff and calculate trends
    const staffMetrics = new Map<string, SupportStaffKPI[]>();
    kpis.forEach((kpi) => {
      if (!staffMetrics.has(kpi.staffId)) {
        staffMetrics.set(kpi.staffId, []);
      }
      staffMetrics.get(kpi.staffId)!.push(kpi);
    });

    const trends = Array.from(staffMetrics.entries()).map(([staffId, kpis]) => {
      const latest = kpis[0];
      const previous = kpis[1];

      return {
        staffId,
        staffName: latest.staffName,
        role: latest.role,
        currentPeriod: latest,
        previousPeriod: previous,
        trend: previous
          ? {
              ticketsAssigned: latest.ticketsAssigned - previous.ticketsAssigned,
              ticketsResolved: latest.ticketsResolved - previous.ticketsResolved,
              avgResolutionTimeHours: latest.avgResolutionTimeHours - previous.avgResolutionTimeHours,
              slaComplianceRate: latest.slaComplianceRate - previous.slaComplianceRate,
              firstContactResolutionRate: latest.firstContactResolutionRate - previous.firstContactResolutionRate,
            }
          : null,
      };
    });

    return success({
      period,
      periodStart,
      periodEnd,
      trends,
      totalRecords: kpis.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[staff-metrics-history] GET error', { error: message });

    if (message.includes('requires an index') || message.includes('FAILED_PRECONDITION')) {
      return error('Query requires a Firestore composite index. Run: firebase deploy --only firestore:indexes', 412);
    }

    return serverError();
  }
}
