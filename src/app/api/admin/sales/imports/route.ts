import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, error, notFound } from '@/lib/api-response';
import { listSalesImportsDb, deleteSalesImportBatchDb } from '@/lib/sales-db';
import { writeAuditLog } from '@/lib/audit-log';
import { clearRouteCache } from '@/lib/route-cache';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(
  async (req: NextRequest) => {
    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '50'), 200);
    const imports = await listSalesImportsDb(limit);
    return success({ imports, total: imports.length });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'sales-imports-list' },
);

export const DELETE = withAdmin(
  async (req: NextRequest, admin) => {
    const body = await req.json().catch(() => null);
    const batchId = body?.batchId || new URL(req.url).searchParams.get('batchId');
    if (!batchId) return error('batchId required.', 400);
    const count = await deleteSalesImportBatchDb(batchId, admin.email);
    if (count === 0) return notFound('Batch not found or already reverted.');
    await writeAuditLog({
      action: 'revert_import',
      collection: 'sales_imports',
      recordId: batchId,
      userId: admin.uid,
      userEmail: admin.email,
      changes: { batchId, revertedCount: count },
    });
    clearRouteCache();
    return success({ reverted: count });
  },
  { rate: { limit: 30, windowMs: 60_000 }, tag: 'sales-imports-revert' },
);
