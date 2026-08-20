import type { SalesMetrics, RegionMetrics, AgentMetrics, SalesRecord, BtsStation, ChannelMetrics } from '@/lib/sales-types';
import { salesAgents, regionalTargets, SEGMENTS_THAT_ROLL_UP_TO_SME } from '@/lib/sales-staff';
import { btsStations } from '@/lib/bts-data';
import { MEANS_OF_SALES } from '@/lib/sales-types';

/**
 * Pure business logic for sales metrics — no NextRequest, no Prisma.
 * Called by the route handler and unit-testable in isolation.
 */
export function computeMetrics(records: Array<SalesRecord & { id: string }>, region?: string): SalesMetrics {
  const filtered = region ? records.filter((r) => r.region === region) : records;
  const active = filtered.filter((r) => r.accountStatus === 'Active');
  const mrr = active.reduce((sum, r) => sum + (r.mrc || 0), 0);
  const nrcRevenue = filtered.reduce((sum, r) => sum + (r.nrc || 0), 0);
  return {
    mrr,
    nrii: mrr,
    arpu: active.length > 0 ? Math.round(mrr / active.length) : 0,
    activeSubscribers: active.length,
    inactiveSubscribers: filtered.filter((r) => r.accountStatus === 'Inactive').length,
    blockedSubscribers: filtered.filter((r) => r.accountStatus === 'Blocked').length,
    newCustomers: filtered.filter((r) => r.customerType === 'new').length,
    totalMrcClosed: filtered.reduce((sum, r) => sum + (r.mrc || 0), 0),
    nrcRevenue,
    totalRevenue: mrr + nrcRevenue,
    avgNrc: filtered.length > 0 ? Math.round(nrcRevenue / filtered.length) : 0,
  };
}

export function buildDashboard(records: Array<SalesRecord & { id: string }>) {
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
        mrc: smeActive.reduce((s, r) => s + (r.mrc || 0), 0),
        arpu: smeActive.length > 0 ? Math.round(smeActive.reduce((s, r) => s + (r.mrc || 0), 0) / smeActive.length) : 0,
      };
    }
    const segRecords = records.filter((r) => r.segment === seg);
    const segActive = segRecords.filter((r) => r.accountStatus === 'Active');
    return {
      segment: seg,
      count: segRecords.length,
      active: segActive.length,
      mrc: segActive.reduce((s, r) => s + (r.mrc || 0), 0),
      arpu: segActive.length > 0 ? Math.round(segActive.reduce((s, r) => s + (r.mrc || 0), 0) / segActive.length) : 0,
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
      mrc: btsActive.reduce((s, r) => s + (r.mrc || 0), 0),
    };
  });
  const agentSegmentBreakdown = salesAgents.flatMap((agent) => {
    const agentRecords = records.filter((r) => r.salesAgent === agent.name);
    return segments.map((seg) => {
      const segRecords = agentRecords.filter((r) => r.segment === seg);
      const segActive = segRecords.filter((r) => r.segment === seg && r.accountStatus === 'Active');
      // FIX: use segActive for mrc, not segRecords
      const mrc = agentRecords.filter((r) => r.segment === seg && r.accountStatus === 'Active').reduce((s, r) => s + (r.mrc || 0), 0);
      return { agent: agent.name, segment: seg, count: segRecords.length, active: segActive.length, mrc };
    });
  });
  const meansOfSaleBreakdown: ChannelMetrics[] = MEANS_OF_SALES.map((meansOfSale) => {
    const channelRecords = records.filter((r) => r.meansOfSale === meansOfSale);
    const channelActive = channelRecords.filter((r) => r.accountStatus === 'Active');
    return {
      meansOfSale,
      count: channelRecords.length,
      active: channelActive.length,
      mrc: channelActive.reduce((s, r) => s + (r.mrc || 0), 0),
      nrc: channelRecords.reduce((s, r) => s + (r.nrc || 0), 0),
    };
  });
  return {
    overall,
    regionMetrics,
    agentMetrics,
    segmentBreakdown,
    btsMetrics,
    agentSegmentBreakdown,
    meansOfSaleBreakdown,
    totalRecords: records.length,
  };
}
