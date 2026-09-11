import { withAdmin } from '@/lib/middleware/withAdmin';
import { success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export interface StaffReport {
  staffName: string;
  revenue: { closed: number; amount: number; referrals: number; revivals: number; upsells: number; crossSells: number };
  reachout: { total: number; contacted: number; neverContacted: number; followUpsDue: number; highRisk: number };
  support: { totalFeedback: number; avgOverall: number; resolvedCount: number; escalatedCount: number };
}

/**
 * GET /api/admin/reports/support-team?from=...&to=...&staff=...
 * Aggregates revenue + reachout + customer-support feedback per staff.
 */
export const GET = withAdmin(
  async (req) => {
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const staffFilter = url.searchParams.get('staff');

    const fromDate: Date | null = from ? new Date(from) : null;
    const toDate: Date | null = to
      ? (() => {
          const d = new Date(to);
          d.setHours(23, 59, 59, 999);
          return d;
        })()
      : null;

    const dateFilter = (field: 'createdAt' | 'lastContactAt' | 'date') => {
      const f: Record<string, unknown> = {};
      if (fromDate) f.gte = field === 'date' ? fromDate.toISOString().slice(0, 10) : fromDate;
      if (toDate) f.lte = field === 'date' ? toDate.toISOString().slice(0, 10) : toDate;
      return Object.keys(f).length ? f : undefined;
    };

    // 1. Support Revenue
    const revenueWhere: Record<string, unknown> = { deletedAt: null };
    if (staffFilter) revenueWhere.agentName = staffFilter;
    if (fromDate || toDate) {
      revenueWhere.date = dateFilter('date');
    }
    const revenueRows = await prisma.supportRevenue.findMany({
      where: revenueWhere,
      select: { agentName: true, totalAmount: true, saleKind: true, projectType: true },
    });

    // 2. Reachout / Engagement
    const engagementWhere: Record<string, unknown> = {};
    if (staffFilter) engagementWhere.staffName = staffFilter;
    if (fromDate || toDate) engagementWhere.lastContactAt = dateFilter('lastContactAt');
    const engagementRows = await prisma.engagementLog.findMany({
      where: engagementWhere,
      select: { staffName: true, callStatus: true, retentionRisk: true, nextFollowUpAt: true },
    });

    // 3. Customer Support Feedback (MariaDB — the 2000-doc Firestore read
    // blew the Firestore quota; Feedback is mirrored here on every submit).
    const feedbackWhere: Record<string, unknown> = {};
    if (staffFilter) feedbackWhere.staffName = staffFilter;
    if (fromDate || toDate) {
      const ts: Record<string, unknown> = {};
      if (fromDate) ts.gte = BigInt(fromDate.getTime());
      if (toDate) ts.lte = BigInt(toDate.getTime());
      feedbackWhere.timestamp = ts;
    }
    const feedbackFiltered = await prisma.feedback.findMany({
      where: feedbackWhere,
      select: { staffName: true, ratings: true, status: true },
      orderBy: { timestamp: 'desc' },
      take: 5000,
    });

    // Aggregate per staff
    const staffMap = new Map<string, StaffReport>();

    function getOrCreate(name: string): StaffReport {
      let s = staffMap.get(name);
      if (!s) {
        s = {
          staffName: name,
          revenue: { closed: 0, amount: 0, referrals: 0, revivals: 0, upsells: 0, crossSells: 0 },
          reachout: { total: 0, contacted: 0, neverContacted: 0, followUpsDue: 0, highRisk: 0 },
          support: { totalFeedback: 0, avgOverall: 0, resolvedCount: 0, escalatedCount: 0 },
        };
        staffMap.set(name, s);
      }
      return s;
    }

    for (const r of revenueRows) {
      const agent = r.agentName || 'Unassigned';
      const s = getOrCreate(agent);
      s.revenue.closed++;
      s.revenue.amount += r.totalAmount || 0;
      if (r.saleKind === 'Upsell') s.revenue.upsells++;
      if (r.saleKind === 'Cross-sell') s.revenue.crossSells++;
      if (r.projectType === 'REFERRALS') s.revenue.referrals++;
      if (r.projectType === 'REVIVED CUSTOMER') s.revenue.revivals++;
    }

    for (const e of engagementRows) {
      const s = getOrCreate(e.staffName);
      s.reachout.total++;
      if (e.callStatus === 'Contacted') s.reachout.contacted++;
      if (!e.callStatus) s.reachout.neverContacted++;
      if (e.nextFollowUpAt && new Date(Number(e.nextFollowUpAt)) <= new Date()) s.reachout.followUpsDue++;
      if (e.retentionRisk === 'High') s.reachout.highRisk++;
    }

    let totalRating = 0,
      ratingCount = 0;
    for (const f of feedbackFiltered) {
      const staff = String(f.staffName ?? '').trim();
      if (!staff) continue;
      const s = getOrCreate(staff);
      s.support.totalFeedback++;
      const ratings = (f.ratings ?? {}) as unknown as Record<string, number>;
      const vals = Object.values(ratings).filter((v) => typeof v === 'number' && v > 0);
      if (vals.length) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        s.support.avgOverall += avg;
        ratingCount++;
      }
      if (f.status === 'resolved') s.support.resolvedCount++;
      if (f.status === 'escalated') s.support.escalatedCount++;
    }
    if (ratingCount > 0) {
      for (const s of staffMap.values()) {
        if (s.support.totalFeedback > 0) s.support.avgOverall = Math.round((s.support.avgOverall / s.support.totalFeedback) * 10) / 10;
      }
    }

    const reports = [...staffMap.values()]
      .filter((r) => r.revenue.closed > 0 || r.reachout.total > 0 || r.support.totalFeedback > 0)
      .sort((a, b) => b.revenue.amount - a.revenue.amount);
    return success({ reports, generatedAt: new Date().toISOString(), period: { from: from ?? 'all-time', to: to ?? 'present' } });
  },
  { rate: { limit: 20, windowMs: 60_000 }, tag: 'admin-reports' },
);
