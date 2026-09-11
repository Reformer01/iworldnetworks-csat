import { withAdmin } from '@/lib/middleware/withAdmin';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveEngagementVisibility } from '@/lib/support-staff-visibility';

export const dynamic = 'force-dynamic';

const HEADERS = [
  'Customer Name', 'Phone', 'BTS / Site', 'Account Status', 'Account Type',
  'Plan', 'Region', 'Call Status', 'Last Contact', 'Next Follow-Up',
  'Purpose', 'Feedback', 'Complaint', 'Upsell/Cross-sell', 'Retention Risk',
  'Resolution', 'Agent',
];

function esc(v: string | number | null | undefined): string {
  let s = String(v ?? '');
  // CSV formula-injection guard: neutralize spreadsheet formula triggers.
  if (/^[=+@]|^-[^0-9]|^\t/.test(s)) s = `'${s}`;
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDate(v: Date | null): string {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/**
 * GET /api/admin/engagement/export?staff=...&callStatus=...&search=...
 * CSV export of the reachout log honoring the current filters.
 */
export const GET = withAdmin(
  async (req, admin) => {
    const url = new URL(req.url);
    const search = url.searchParams.get('search') || '';
    const callStatus = url.searchParams.get('callStatus') || '';
    const dateFrom = url.searchParams.get('from') || '';
    const dateTo = url.searchParams.get('to') || '';

    // Staff isolation: reachout agents can only export their own records.
    const requestedStaff = url.searchParams.get('staff') || '';
    const { staffName: staff } = await resolveEngagementVisibility(admin.email, requestedStaff);

    const lastContactFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) lastContactFilter.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      lastContactFilter.lte = end;
    }

    const logs = await prisma.engagementLog.findMany({
      where: {
        ...(staff ? { staffName: staff } : {}),
        ...(callStatus
          ? callStatus === 'Never Contacted'
            ? { callStatus: null, lastContactAt: null }
            : { callStatus }
          : {}),
        ...(dateFrom || dateTo ? { lastContactAt: lastContactFilter } : {}),
        ...(search ? { customerName: { contains: search } } : {}),
      },
      orderBy: [{ staffName: 'asc' }, { customerName: 'asc' }],
    });

    // Naming convention: scope + date range are always visible in the filename.
    const scope = staff ? staff.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'general';
    const range = dateFrom || dateTo ? `${dateFrom || 'start'}_to_${dateTo || 'today'}` : 'all-time';
    const filename = `reachout-log_${scope}_${range}.csv`;

    const rows: string[] = [HEADERS.join(',')];
    for (const l of logs) {
      rows.push([
        esc(l.customerName), esc(l.phone), esc(l.btsName), esc(l.accountStatus), esc(l.accountType),
        esc(l.plan), esc(l.region), esc(l.callStatus), fmtDate(l.lastContactAt), fmtDate(l.nextFollowUpAt),
        esc(l.purpose), esc(l.feedback), esc(l.complaint), esc(l.upsellNote), esc(l.retentionRisk),
        esc(l.resolution), esc(l.staffName),
      ].join(','));
    }

    return new NextResponse(rows.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  },
  { rate: { limit: 10, windowMs: 60_000 }, tag: 'engagement-export' },
);
