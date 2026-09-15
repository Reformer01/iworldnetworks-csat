import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, error } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { resolveEngagementVisibility } from '@/lib/support-staff-visibility';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/engagement?staff=...&search=...&page=1
 * Support-team reachout log list.
 */
export const GET = withAdmin(
  async (req, admin) => {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const callStatus = url.searchParams.get('callStatus') || '';
    const risk = url.searchParams.get('risk') || '';
    const dateFrom = url.searchParams.get('from') || '';
    const dateTo = url.searchParams.get('to') || '';
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const pageSize = 50;

    // Staff isolation: reachout agents are locked to their own records.
    const requestedStaff = url.searchParams.get('staff') || '';
    const { staffName: staff } = await resolveEngagementVisibility(admin.email, requestedStaff);

    const lastContactFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) lastContactFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      lastContactFilter.lte = end;
    }
    const hasDateRange = Boolean(dateFrom || dateTo);

    const where = {
      ...(staff ? { staffName: staff } : {}),
      ...(hasDateRange ? { lastContactAt: lastContactFilter } : {}),
      ...(callStatus ? (callStatus === 'Never Contacted' ? { callStatus: null, lastContactAt: null } : { callStatus }) : {}),
      ...(risk === 'unrated' ? { retentionRisk: null } : risk ? { retentionRisk: risk } : {}),
      ...(search ? { customerName: { contains: search } } : {}),
    };

    // Dashboard stats — scoped to the agent filter (not search) so agents see
    // their own daily progress. Date range also scopes the stats.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const statsWhere = {
      ...(staff ? { staffName: staff } : {}),
      ...(hasDateRange ? { lastContactAt: lastContactFilter } : {}),
    };

    // Follow-ups due: only where staff actually set a nextFollowUpAt and it is due (today or overdue).
    // Previously this counted all where nextFollowUpAt <= now but null handling was inconsistent and included stale overdue from weeks ago.
    // Never Contacted is defined as both callStatus and lastContactAt are null (truly never contacted).
    const [logs, total, staffGroups, byCallStatusRaw, byRisk, contactedToday, dueFollowUps, neverContacted] = await Promise.all([
      prisma.engagementLog.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.engagementLog.count({ where }),
      prisma.engagementLog.groupBy({ by: ['staffName'], _count: { _all: true } }),
      prisma.engagementLog.groupBy({ by: ['callStatus'], _count: { _all: true }, where: { ...statsWhere, callStatus: { not: null } } }),
      prisma.engagementLog.groupBy({
        by: ['retentionRisk'],
        _count: { _all: true },
        where: { ...statsWhere, retentionRisk: { not: null } },
      }),
      prisma.engagementLog.count({ where: { ...statsWhere, lastContactAt: { gte: startOfDay } } }),
      prisma.engagementLog.count({ where: { ...statsWhere, nextFollowUpAt: { not: null, lte: new Date() } } }),
      prisma.engagementLog.count({ where: { ...statsWhere, callStatus: null, lastContactAt: null } }),
    ]);

    const byCallStatus = [
      ...byCallStatusRaw.map((s) => ({ label: s.callStatus!, count: s._count._all })),
      { label: 'Never Contacted', count: neverContacted },
    ];

    return success({
      logs,
      total,
      page,
      pageSize,
      staffGroups,
      stats: {
        contactedToday,
        dueFollowUps,
        highRisk: byRisk.find((r) => r.retentionRisk === 'High')?._count._all ?? 0,
        byCallStatus,
        byRisk: byRisk.map((r) => ({ label: r.retentionRisk ?? '—', count: r._count._all })),
      },
    });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'engagement-list' },
);

/** POST /api/admin/engagement — log a call/engagement. */
export const POST = withAdmin(
  async (req) => {
    const body = await req.json().catch(() => null);
    if (!body?.customerName || !body?.staffName) {
      return error('customerName and staffName are required', 400);
    }
    // MariaDB VARCHAR(191) guard: truncate instead of 500ing (feedback and
    // upsellNote are TEXT and pass through untouched).
    const str = (v: unknown, max = 191): string | null => {
      if (v === null || v === undefined || v === '') return null;
      const s = String(v);
      return s.length > max ? s.slice(0, max) : s;
    };
    const log = await prisma.engagementLog.create({
      data: {
        customerId: body.customerId || null,
        customerName: String(body.customerName).slice(0, 191),
        btsName: str(body.btsName),
        accountStatus: str(body.accountStatus),
        accountType: str(body.accountType),
        plan: str(body.plan),
        region: str(body.region),
        phone: str(body.phone),
        callStatus: str(body.callStatus),
        lastContactAt: body.lastContactAt ? new Date(body.lastContactAt) : new Date(),
        nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null,
        purpose: str(body.purpose),
        feedback: body.feedback || null,
        complaint: str(body.complaint),
        upsellNote: body.upsellNote || null,
        retentionRisk: str(body.retentionRisk),
        resolution: str(body.resolution),
        staffName: String(body.staffName).slice(0, 191),
      },
    });
    return success(log, 201);
  },
  { rate: { limit: 60, windowMs: 60_000 }, tag: 'engagement-create' },
);
