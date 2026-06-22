import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { SalesMetrics, RegionMetrics, AgentMetrics, SalesRecord } from '@/lib/sales-types';
import { salesAgents, regionalTargets, getRegionForLocation, getQuarterFromMonth } from '@/lib/sales-staff';
import { success, error, unauthorized, tooMany, serverError } from '@/lib/api-response';
import { logError } from '@/lib/logger';

type RecordDoc = SalesRecord & { id: string };

export const dynamic = 'force-dynamic';

function computeMetrics(records: RecordDoc[], region?: string): SalesMetrics {
  const filtered = region ? records.filter((r) => r.region === region) : records;
  const active = filtered.filter((r) => r.accountStatus === 'Active');
  const inactive = filtered.filter((r) => r.accountStatus === 'Inactive');
  const blocked = filtered.filter((r) => r.accountStatus === 'Blocked');
  const mrr = active.reduce((sum, r) => sum + (r.mrc || 0), 0);
  const nrcRevenue = filtered.reduce((sum, r) => sum + (r.nrc || 0), 0);
  const activeCount = active.length;
  const inactiveCount = inactive.length;
  const blockedCount = blocked.length;

  return {
    mrr,
    nrii: mrr,
    arpu: activeCount > 0 ? Math.round(mrr / activeCount) : 0,
    activeSubscribers: activeCount,
    inactiveSubscribers: inactiveCount,
    blockedSubscribers: blockedCount,
    newCustomers: filtered.length,
    churnedCustomers: inactiveCount,
    churnRate: (filtered.length - blockedCount) > 0 ? Math.round((inactiveCount / (filtered.length - blockedCount)) * 10000) / 100 : 0,
    nrcRevenue,
    totalRevenue: mrr + nrcRevenue,
    avgNrc: filtered.length > 0 ? Math.round(nrcRevenue / filtered.length) : 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');

    const db = getAdminFirestore();
    const snapshot = await db.collection('sales_records').orderBy('serialNumber', 'desc').limit(2000).get();
    const records: RecordDoc[] = snapshot.docs
      .filter((doc) => !doc.data().deletedAt)
      .map((doc) => ({ id: doc.id, ...doc.data() } as RecordDoc));

    const overall = computeMetrics(records);

    const regionMetrics: RegionMetrics[] = regionalTargets.map((rt) => {
      const m = computeMetrics(records, rt.region);
      return {
        ...m,
        region: rt.region,
        attainment: rt.annualRevenueTarget > 0 ? Math.round((m.mrr / rt.annualRevenueTarget) * 10000) / 100 : 0,
        targetRevenue: rt.annualRevenueTarget,
      };
    });

    const agentMetrics: AgentMetrics[] = salesAgents.map((agent) => {
      const agentRecords = records.filter((r) => r.salesAgent === agent.name);
      const activeRecords = agentRecords.filter((r) => r.accountStatus === 'Active');
      const mrc = activeRecords.reduce((sum, r) => sum + (r.mrc || 0), 0);
      const nrc = agentRecords.reduce((sum, r) => sum + (r.nrc || 0), 0);
      return {
        name: agent.name,
        region: agent.region,
        mrc,
        nrc,
        customerCount: activeRecords.length,
        newCustomers: agentRecords.length,
        targetRevenue: agent.annualTarget,
        attainment: agent.annualTarget > 0 ? Math.round((mrc / agent.annualTarget) * 10000) / 100 : 0,
      };
    });

    const segments: SalesRecord['segment'][] = ['HOME', 'SME', 'ENTERPRISE'];
    const segmentBreakdown = segments.map((seg) => {
      const segRecords = records.filter((r) => r.segment === seg);
      const segActive = segRecords.filter((r) => r.accountStatus === 'Active');
      return {
        segment: seg,
        count: segRecords.length,
        active: segActive.length,
        mrc: segActive.reduce((sum, r) => sum + (r.mrc || 0), 0),
        arpu: segActive.length > 0 ? Math.round(segActive.reduce((sum, r) => sum + (r.mrc || 0), 0) / segActive.length) : 0,
      };
    });

    return success({
      overall,
      regionMetrics,
      agentMetrics,
      segmentBreakdown,
      totalRecords: records.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-metrics] GET error', { error: message });
    return serverError();
  }
}
