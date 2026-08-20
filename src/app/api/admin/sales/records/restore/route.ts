import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, error, notFound } from '@/lib/api-response';
import { restoreSalesRecordDb, getSalesRecordByIdDb } from '@/lib/sales-db';
import { writeAuditLog } from '@/lib/audit-log';
import { clearRouteCache } from '@/lib/route-cache';

export const dynamic = 'force-dynamic';

/** POST /api/admin/sales/records/restore { id } — restore soft-deleted record */
export const POST = withAdmin(
  async (req: NextRequest, admin) => {
    const body = await req.json().catch(() => null);
    if (!body?.id) return error('Record ID required.', 400);
    const prev = await getSalesRecordByIdDb(body.id);
    if (!prev) return notFound('Record not found.');
    if (!(prev as { deletedAt?: number | null }).deletedAt) return error('Record is not deleted.', 400);
    const ok = await restoreSalesRecordDb(body.id);
    if (!ok) return notFound('Record not found.');
    await writeAuditLog({
      action: 'restore',
      collection: 'sales_records',
      recordId: body.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: { ...prev },
    });
    clearRouteCache();
    return success({ restored: true });
  },
  { rate: { limit: 60, windowMs: 60_000 }, tag: 'sales-restore' },
);
