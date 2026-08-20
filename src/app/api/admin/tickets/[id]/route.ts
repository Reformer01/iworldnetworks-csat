import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, notFound } from '@/lib/api-response';
import { getTicketByIdDb } from '@/lib/ticket-db';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(
  async (_req: NextRequest, _admin, ctx?: unknown) => {
    const id = (ctx as { params?: { id?: string } })?.params?.id || '';
    if (!id) return notFound('Ticket not found.');
    const ticket = await getTicketByIdDb(id);
    if (!ticket) return notFound('Ticket not found.');
    return success({ ticket });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'ticket-detail' },
);
