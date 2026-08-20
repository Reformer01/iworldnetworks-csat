import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/admin/audit-log?collection=&recordId=&limit=&page= */
export const GET = withAdmin(
  async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const collection = searchParams.get('collection');
    const recordId = searchParams.get('recordId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 200);

    const where: Record<string, unknown> = {};
    if (collection) where.collection = collection;
    if (recordId) where.recordId = recordId;

    const total = await prisma.salesAuditLog.count({ where: where as never });
    const rows = await prisma.salesAuditLog.findMany({
      where: where as never,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const logs = rows.map((r) => ({ ...r, timestamp: r.timestamp != null ? Number(r.timestamp) : null }));
    return success({ logs, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'audit-log' },
);
