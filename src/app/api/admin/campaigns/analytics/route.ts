import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/campaigns/analytics
 * Returns:
 *  - overall: total sent, total opens, total clicks, open rate, click rate
 *  - byCampaign: per-campaign breakdown with sent/opens/clicks/rates
 *  - topLinks: most clicked URLs
 *  - timeline: opens/clicks over time (last 30 days)
 *  - devices: user-agent breakdown (Gmail, Outlook, Apple Mail, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return unauthorized();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    // 1. Overall metrics
    const totalSent = await prisma.emailJob.count({ where: { type: 'campaign', status: 'sent' } });
    const totalOpens = await prisma.emailOpenEvent.count();
    const totalClicks = await prisma.emailClickEvent.count();

    // Unique opens/clicks (per email)
    const uniqueOpens = await prisma.emailOpenEvent.groupBy({ by: ['emailJobId'] });
    const uniqueClicks = await prisma.emailClickEvent.groupBy({ by: ['emailJobId'] });

    const openRate = totalSent > 0 ? Math.round((uniqueOpens.length / totalSent) * 100) : 0;
    const clickRate = totalSent > 0 ? Math.round((uniqueClicks.length / totalSent) * 100) : 0;

    // 2. Per-campaign breakdown
    const campaigns = await prisma.campaign.findMany({
      where: { status: { in: ['sent', 'partial', 'sending'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const byCampaign = await Promise.all(
      campaigns.map(async (c) => {
        const sent = await prisma.emailJob.count({ where: { campaignId: c.id, status: 'sent' } });
        const opens = await prisma.emailOpenEvent.count({ where: { campaignId: c.id } });
        const clicks = await prisma.emailClickEvent.count({ where: { campaignId: c.id } });
        const uniqueOpenEmails = await prisma.emailOpenEvent.groupBy({ by: ['emailJobId'], where: { campaignId: c.id } });
        const uniqueClickEmails = await prisma.emailClickEvent.groupBy({ by: ['emailJobId'], where: { campaignId: c.id } });

        return {
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          subject: c.subject,
          sentAt: c.sentAt ? Number(c.sentAt) : null,
          createdAt: c.createdAt.getTime(),
          sent,
          opens,
          clicks,
          uniqueOpens: uniqueOpenEmails.length,
          uniqueClicks: uniqueClickEmails.length,
          openRate: sent > 0 ? Math.round((uniqueOpenEmails.length / sent) * 100) : 0,
          clickRate: sent > 0 ? Math.round((uniqueClickEmails.length / sent) * 100) : 0,
        };
      }),
    );

    // 3. Top clicked URLs
    const topLinksRaw = await prisma.emailClickEvent.groupBy({
      by: ['originalUrl'],
      _count: { _all: true },
      orderBy: { _count: { originalUrl: 'desc' } },
      take: 10,
    });
    const topLinks = topLinksRaw.map((r) => ({ url: r.originalUrl, clicks: r._count._all }));

    // 4. Timeline (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const [opensTimeline, clicksTimeline] = await Promise.all([
      prisma.emailOpenEvent.findMany({
        where: { openedAt: { gte: thirtyDaysAgo } },
        select: { openedAt: true },
        orderBy: { openedAt: 'asc' },
      }),
      prisma.emailClickEvent.findMany({
        where: { clickedAt: { gte: thirtyDaysAgo } },
        select: { clickedAt: true },
        orderBy: { clickedAt: 'asc' },
      }),
    ]);

    // Group by date
    const dateMap = new Map<string, { date: string; opens: number; clicks: number }>();
    for (const e of opensTimeline) {
      const key = e.openedAt.toISOString().slice(0, 10);
      const existing = dateMap.get(key) || { date: key, opens: 0, clicks: 0 };
      existing.opens++;
      dateMap.set(key, existing);
    }
    for (const e of clicksTimeline) {
      const key = e.clickedAt.toISOString().slice(0, 10);
      const existing = dateMap.get(key) || { date: key, opens: 0, clicks: 0 };
      existing.clicks++;
      dateMap.set(key, existing);
    }
    const timeline = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // 5. Device/client breakdown from user agents
    const recentOpens = await prisma.emailOpenEvent.findMany({
      where: { openedAt: { gte: thirtyDaysAgo } },
      select: { userAgent: true },
    });
    const deviceMap = new Map<string, number>();
    for (const e of recentOpens) {
      const ua = e.userAgent || 'Unknown';
      let client = 'Other';
      if (ua.includes('Gmail') || ua.includes('Google')) client = 'Gmail';
      else if (ua.includes('Outlook') || ua.includes('Microsoft')) client = 'Outlook';
      else if (ua.includes('Apple') || ua.includes('Mail/')) client = 'Apple Mail';
      else if (ua.includes('Yahoo')) client = 'Yahoo Mail';
      else if (ua.includes('Thunderbird')) client = 'Thunderbird';
      else if (ua.includes('Android')) client = 'Android';
      else if (ua.includes('iPhone') || ua.includes('iPad')) client = 'iOS';
      deviceMap.set(client, (deviceMap.get(client) || 0) + 1);
    }
    const devices = Array.from(deviceMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return success({
      overall: { totalSent, totalOpens, totalClicks, openRate, clickRate, uniqueOpens: uniqueOpens.length, uniqueClicks: uniqueClicks.length },
      byCampaign,
      topLinks,
      timeline,
      devices,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[campaign-analytics] GET error', { error: message });
    return serverError();
  }
}
