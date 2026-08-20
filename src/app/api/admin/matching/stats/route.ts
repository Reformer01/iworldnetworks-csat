import { withAdmin } from '@/lib/middleware/withAdmin';
import { success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/admin/matching/stats — pending/matched/manual counts */
export const GET = withAdmin(
  async () => {
    const grouped = await prisma.customer.groupBy({ by: ['matchState'], _count: { _all: true }, where: { deleted: false } });
    const total = await prisma.customer.count({ where: { deleted: false } });
    const map = Object.fromEntries(grouped.map((g) => [g.matchState, g._count._all]));
    return success({ total, pending: map['pending'] ?? 0, matched: map['matched'] ?? 0, manual: map['manual'] ?? 0, byState: grouped });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'matching-stats' },
);
