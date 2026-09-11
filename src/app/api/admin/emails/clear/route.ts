import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySuperAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError, logInfo } from '@/lib/logger';
import { getEmailQueue } from '@/lib/queues/email-queue';

export const dynamic = 'force-dynamic';

// POST /api/admin/emails/clear  { statuses?: string[] }  super_admin only
// Clears BullMQ waiting jobs AND marks matching EmailJob rows as cancelled.
// Default: clears status='pending' (auto system mails). Pass statuses=['pending','pending_approval'] to also clear approvals.
// Keeping rows as 'cancelled' preserves audit trail; use ?hard=true to actually delete.
export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 5, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifySuperAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => null);
    const statuses: string[] = Array.isArray(body?.statuses) && body.statuses.length > 0
      ? body.statuses.filter((s: unknown) => typeof s === 'string').slice(0, 5)
      : ['pending'];
    const hard = body?.hard === true;

    const allowed = new Set(['pending', 'pending_approval', 'processing', 'failed']);
    const filtered = statuses.filter((s) => allowed.has(s));
    if (filtered.length === 0) return success({ cleared: 0, bullCleared: 0 });

    // Drain BullMQ queue first (removes waiting/delayed jobs)
    let bullCleared = 0;
    try {
      const queue = getEmailQueue();
      await queue.drain(true); // clean waiting
      await queue.clean(0, 10000, 'delayed');
      await queue.clean(0, 10000, 'waiting');
      // obliterate is nuclear — only if hard
      if (hard) await queue.obliterate({ force: true });
      bullCleared = 1;
    } catch (e) {
      logError('[admin-emails] clear bull drain error', { error: String(e) });
    }

    let cleared = 0;
    if (hard) {
      const res = await prisma.emailJob.deleteMany({ where: { status: { in: filtered }, sentAt: null } });
      cleared = res.count;
    } else {
      // Guard: never overwrite a job that already has a bullJobId (enqueued) or sentAt (delivered) — audit must stay honest
      const res = await prisma.emailJob.updateMany({
        where: { status: { in: filtered }, sentAt: null, bullJobId: null },
        data: { status: 'cancelled', error: `Cancelled by ${admin.email} at ${new Date().toISOString()} | was ${filtered.join(',')}, not yet enqueued (bullJobId null)` },
      });
      cleared = res.count;
    }

    logInfo('[admin-emails] clear queue', { by: admin.email, statuses: filtered, hard, cleared, bullCleared });

    return success({ cleared, bullCleared, statuses: filtered });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-emails] clear error', { error: message });
    return serverError();
  }
}
