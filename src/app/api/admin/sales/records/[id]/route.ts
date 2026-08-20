import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, notFound } from '@/lib/api-response';
import { getSalesRecordByIdDb } from '@/lib/sales-db';

export const dynamic = 'force-dynamic';

/** GET /api/admin/sales/records/:id — single record detail */
export const GET = withAdmin(
  async (_req: NextRequest, _admin, ctx?: unknown) => {
    const id = (ctx as { params?: { id?: string } })?.params?.id || '';
    if (!id) return notFound('Record not found.');
    const record = await getSalesRecordByIdDb(id);
    if (!record) return notFound('Record not found.');
    return success({ record });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'sales-record-detail' },
);
