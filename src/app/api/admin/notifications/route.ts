import { withAdmin } from '@/lib/middleware/withAdmin';
import { success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export interface NotificationItem {
  type: 'followup-due' | 'high-risk' | 'never-contacted' | 'validation';
  title: string;
  body: string;
  href: string;
  severity: 'info' | 'warning' | 'critical';
}

function resolveStaffName(email: string, staffNames: string[]): string | null {
  // Match by first name: victoria@iwn.ng -> "Victoria Fokorede"
  const first = email.split('@')[0].toLowerCase();
  return (
    staffNames.find((s) => {
      const parts = s.toLowerCase().split(/\s+/);
      return parts.includes(first) || s.toLowerCase().startsWith(first);
    }) ?? null
  );
}

/**
 * GET /api/admin/notifications — per-staff action items, computed live.
 * Sources: due follow-ups, high-risk customers, never-contacted list,
 * weekly-validation staleness. More sources can be appended over time.
 */
export const GET = withAdmin(
  async (_req, admin) => {
    const staffNames = await prisma.engagementLog.groupBy({ by: ['staffName'] });
    const names = staffNames.map((g) => g.staffName);
    const myName = resolveStaffName(admin.email, names);

    const now = new Date();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const items: NotificationItem[] = [];

    if (myName) {
      const mine = { staffName: myName };

      const [dueFollowUps, highRisk, neverContacted] = await Promise.all([
        prisma.engagementLog.findMany({
          where: { ...mine, nextFollowUpAt: { not: null, lte: now } },
          select: { customerName: true },
          orderBy: { nextFollowUpAt: 'asc' },
          take: 5,
        }),
        prisma.engagementLog.findMany({
          where: { ...mine, retentionRisk: 'High' },
          select: { customerName: true },
          take: 5,
        }),
        prisma.engagementLog.count({ where: { ...mine, callStatus: null } }),
      ]);

      if (dueFollowUps.length > 0) {
        items.push({
          type: 'followup-due',
          title: `${dueFollowUps.length} follow-up${dueFollowUps.length === 1 ? '' : 's'} due`,
          body: `Starting with: ${dueFollowUps.map((f) => f.customerName).slice(0, 3).join(', ')}`,
          href: `/admin/engagement?staff=${encodeURIComponent(myName)}`,
          severity: 'warning',
        });
      }

      if (highRisk.length > 0) {
        items.push({
          type: 'high-risk',
          title: `${highRisk.length} high retention-risk customer${highRisk.length === 1 ? '' : 's'}`,
          body: `Needs attention: ${highRisk.map((f) => f.customerName).slice(0, 3).join(', ')}`,
          href: `/admin/engagement?staff=${encodeURIComponent(myName)}`,
          severity: 'critical',
        });
      }

      if (neverContacted > 0) {
        items.push({
          type: 'never-contacted',
          title: `${neverContacted} customers never contacted`,
          body: 'Your list has customers without any logged call outcome.',
          href: `/admin/engagement?staff=${encodeURIComponent(myName)}`,
          severity: 'info',
        });
      }
    }

    // Platform-wide: validation report older than 8 days.
    const validation = await prisma.syncLock.findUnique({ where: { id: 'weekly-validation' } });
    const lastRun = validation?.lastRunAt ? Number(validation.lastRunAt) : 0;
    if (!lastRun || now.getTime() - lastRun > 8 * 24 * 60 * 60 * 1000) {
      items.push({
        type: 'validation',
        title: 'Database validation overdue',
        body: 'The weekly Splynx vs UISP vs master cross-check has not run in over a week.',
        href: '/api/admin/validation?run=true',
        severity: 'info',
      });
    }

    // Campaign approval queue (super admins only)
    const { isSuperAdmin } = await import('@/lib/admin-config');
    if (isSuperAdmin(admin.email)) {
      const pendingCampaigns = await prisma.campaign.findMany({
        where: { status: 'pending_approval' },
        select: { id: true, name: true, submittedBy: true, submittedAt: true },
        orderBy: { submittedAt: 'asc' },
        take: 5,
      });
      if (pendingCampaigns.length > 0) {
        items.push({
          type: 'validation',
          title: `${pendingCampaigns.length} campaign${pendingCampaigns.length === 1 ? '' : 's'} awaiting approval`,
          body: `Review: ${pendingCampaigns.map((c) => c.name).slice(0, 3).join(', ')}`,
          href: '/admin/mailing?tab=approval',
          severity: 'warning',
        });
      }
    }

    const order = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => order[a.severity] - order[b.severity]);

    return success({ items, count: items.length, staffName: myName });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'notifications' },
);
