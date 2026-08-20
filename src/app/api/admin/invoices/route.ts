import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success } from '@/lib/api-response';
import { listInvoices } from '@/lib/services/invoice-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/invoices — list invoices with pagination (MariaDB).
 * Previously only CSV export existed; users could not browse invoices.
 */
export const GET = withAdmin(
  async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const isPaidParam = searchParams.get('isPaid');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 200);

    let isPaid: boolean | null = null;
    if (isPaidParam === 'true') isPaid = true;
    else if (isPaidParam === 'false') isPaid = false;

    const result = await listInvoices({ customerId, status, isPaid, search, page, pageSize });
    return success(result);
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'invoices' },
);
