import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, error, notFound } from '@/lib/api-response';
import { restoreTicketDb, getTicketByIdDb } from '@/lib/ticket-db';
import { writeAuditLog } from '@/lib/audit-log';
import { clearRouteCache } from '@/lib/route-cache';

export const dynamic = 'force-dynamic';

export const POST = withAdmin(
  async (req: NextRequest, admin) => {
    const body = await req.json().catch(() => null);
    if (!body?.id) return error('Ticket ID required.', 400);
    const prev = await getTicketByIdDb(body.id);
    if (!prev) return notFound('Ticket not found.');
    if (!(prev as { deletedAt?: number | null }).deletedAt) return error('Ticket is not deleted.', 400);
    const ok = await restoreTicketDb(body.id);
    if (!ok) return notFound('Ticket not found.');
    await writeAuditLog({
      action: 'restore',
      collection: 'tickets',
      recordId: body.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: { ...prev },
    });
    clearRouteCache();
    return success({ restored: true });
  },
  { rate: { limit: 60, windowMs: 60_000 }, tag: 'ticket-restore' },
);
