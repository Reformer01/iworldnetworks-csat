import { withAdmin } from '@/lib/middleware/withAdmin';
import { success } from '@/lib/api-response';
import { getIntelligenceOverview } from '@/lib/services/customer-intelligence-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/intelligence/overview — single source of truth for
 * customer + BTS intelligence. One DB read, consistent denominators.
 */
export const GET = withAdmin(
  async () => {
    const overview = await getIntelligenceOverview();
    return success(overview);
  },
  { rate: { limit: 60, windowMs: 60_000 }, tag: 'intelligence-overview' },
);
