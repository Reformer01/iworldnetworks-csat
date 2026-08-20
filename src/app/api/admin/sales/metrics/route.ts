import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin, salesAgentForEmail } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { SalesMetrics, RegionMetrics, AgentMetrics, SalesRecord, BtsStation, ChannelMetrics, MEANS_OF_SALES } from '@/lib/sales-types';
import { salesAgents, regionalTargets, getRegionForLocation, getQuarterFromMonth, SEGMENTS_THAT_ROLL_UP_TO_SME } from '@/lib/sales-staff';
import { btsStations } from '@/lib/bts-data';
import { success, error, unauthorized, tooMany, forbidden, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { listSalesRecordsDb } from '@/lib/sales-db';

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
    newCustomers: filtered.filter((r) => r.customerType === 'new').length,
    totalMrcClosed: filtered.reduce((sum, r) => sum + (r.mrc || 0), 0),
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

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');

    // MariaDB read — the full record set is small (<2000 rows) and indexed;
    // no Firestore quota concern, no aggressive caching needed. All records
    // are fetched; region/agent/segment breakdowns filter in JS below.
    let records = await listSalesRecordsDb();

    // Agents see only their own records everywhere on the dashboard.
    if (!isSuperAdmin(admin.email)) {
      const callerAgent = salesAgentForEmail(admin.email);
      if (!callerAgent) {
        return error('Your account is not linked to a sales agent.', 403);
      }
      records = records.filter((r) => r.salesAgent === callerAgent);
    }

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

    const segments: SalesRecord['segment'][] = ['HOME', 'SME', 'ENTERPRISE', 'NEIGHBOURHOOD', 'MANAGED_SERVICES'];
    const segmentBreakdown = segments.map((seg) => {
      if (seg === 'SME') {
        const smeRecords = records.filter((r) => SEGMENTS_THAT_ROLL_UP_TO_SME.includes(r.segment));
        const smeActive = smeRecords.filter((r) => r.accountStatus === 'Active');
        return {
          segment: 'SME',
          count: smeRecords.length,
          active: smeActive.length,
          mrc: smeActive.reduce((sum, r) => sum + (r.mrc || 0), 0),
          arpu: smeActive.length > 0 ? Math.round(smeActive.reduce((sum, r) => sum + (r.mrc || 0), 0) / smeActive.length) : 0,
        };
      }
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

    const btsMetrics = btsStations.map((bts) => {
      const btsRecords = records.filter((r) => r.bts === bts.name);
      const btsActive = btsRecords.filter((r) => r.accountStatus === 'Active');
      return {
        bts: bts.name,
        region: bts.region,
        count: btsRecords.length,
        active: btsActive.length,
        mrc: btsActive.reduce((sum, r) => sum + (r.mrc || 0), 0),
      };
    });

    const agentSegmentBreakdown = salesAgents.flatMap((agent) => {
      const agentRecords = records.filter((r) => r.salesAgent === agent.name);
      return segments.map((seg) => {
        const segRecords = agentRecords.filter((r) => r.segment === seg);
        const segActive = segRecords.filter((r) => r.accountStatus === 'Active');
        return {
          agent: agent.name,
          segment: seg,
          count: segRecords.length,
          active: segActive.length,
          mrc: segActive.reduce((sum, r) => sum + (r.mrc || 0), 0),
        };
      });
    });

    const meansOfSaleBreakdown: ChannelMetrics[] = MEANS_OF_SALES.map((meansOfSale) => {
      const channelRecords = records.filter((r) => r.meansOfSale === meansOfSale);
      const channelActive = channelRecords.filter((r) => r.accountStatus === 'Active');
      return {
        meansOfSale,
        count: channelRecords.length,
        active: channelActive.length,
        mrc: channelActive.reduce((sum, r) => sum + (r.mrc || 0), 0),
        nrc: channelRecords.reduce((sum, r) => sum + (r.nrc || 0), 0),
      };
    });

    return success({
      overall,
      regionMetrics,
      agentMetrics,
      segmentBreakdown,
      btsMetrics,
      agentSegmentBreakdown,
      meansOfSaleBreakdown,
      totalRecords: records.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-metrics] GET error', { error: message });
    return serverError();
  }
}
