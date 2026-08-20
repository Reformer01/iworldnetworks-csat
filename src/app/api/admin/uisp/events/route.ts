import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/admin/uisp/events?hasError=&page=&pageSize= — inspect webhook processing */
export const GET = withAdmin(
  async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const hasError = searchParams.get('hasError');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 200);
    const where: Record<string, unknown> = {};
    if (hasError === 'true') where.error = { not: null };
    else if (hasError === 'false') where.error = null;
    const total = await prisma.uispWebhookEvent.count({ where: where as never });
    const rows = await prisma.uispWebhookEvent.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const records = rows.map((r) => ({
      ...r,
      createdAt: Number(r.createdAt),
      processedAt: r.processedAt != null ? Number(r.processedAt) : null,
    }));
    return success({ records, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'uisp-events' },
);
