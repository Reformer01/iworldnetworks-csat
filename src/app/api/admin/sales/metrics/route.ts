import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, error } from '@/lib/api-response';
import { isSuperAdmin, salesAgentForEmail } from '@/lib/admin-config';
import { listSalesRecordsDb } from '@/lib/sales-db';
import { buildDashboard } from '@/lib/services/sales-metrics-service';

export const dynamic = 'force-dynamic';

/**
 * Sales metrics dashboard — thin controller.
 * Business logic: sales-metrics-service.buildDashboard
 * Data access: sales-db.listSalesRecordsDb
 */
export const GET = withAdmin(
  async (req: NextRequest, admin) => {
    const region = new URL(req.url).searchParams.get('region');

    let records = await listSalesRecordsDb();

    // Agents see only their own records
    if (!isSuperAdmin(admin.email)) {
      const callerAgent = salesAgentForEmail(admin.email);
      if (!callerAgent) return error('Your account is not linked to a sales agent.', 403);
      records = records.filter((r) => r.salesAgent === callerAgent);
    }

    const dashboard = buildDashboard(records);
    return success(dashboard);
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'sales-metrics' },
);
