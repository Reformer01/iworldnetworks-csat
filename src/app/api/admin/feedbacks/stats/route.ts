import { withAdmin } from '@/lib/middleware/withAdmin';
import { success } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET /api/admin/feedbacks/stats — counts by status/category, avg rating */
export const GET = withAdmin(
  async () => {
    const [byStatus, byCategory, total] = await Promise.all([
      prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.feedback.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.feedback.count(),
    ]);
    return success({ total, byStatus, byCategory });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'feedback-stats' },
);
