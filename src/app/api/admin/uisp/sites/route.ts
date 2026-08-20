import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/admin/uisp/sites?type=&search=&page=&pageSize= — browse UISP sites/endpoints */
export const GET = withAdmin(
  async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 200);
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (search) where.name = { contains: search };
    const total = await prisma.uispSite.count({ where: where as never });
    const rows = await prisma.uispSite.findMany({
      where: where as never,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const records = rows.map((r) => ({ ...r, lastSyncAt: r.lastSyncAt != null ? Number(r.lastSyncAt) : null }));
    return success({ records, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'uisp-sites' },
);
