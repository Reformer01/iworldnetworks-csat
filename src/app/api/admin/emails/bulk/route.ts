import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySuperAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { getEmailQueue, getPriorityForType, EmailJobData } from '@/lib/queues/email-queue';
import { markEmailJobFailed } from '@/lib/repositories/email-job-repo';

export const dynamic = 'force-dynamic';

const MAX_REASON_LEN = 190;
const MAX_BULK = 200;

// POST /api/admin/emails/bulk  { action: 'approve'|'reject', ids: string[], reason? }
// Super-admin only. Approve enqueues each awaiting-approval job; reject marks
// them rejected. Only records currently in pending_approval are touched.
export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 10, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifySuperAdminToken(request.headers.get('authorization'));
    if (!admin) return forbidden();

    const body = await request.json().catch(() => null);
    const action = body?.action;
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, MAX_BULK) : [];
    if (action !== 'approve' && action !== 'reject') return error('action must be approve or reject');
    if (!ids.length) return error('ids is required');

    const now = BigInt(Date.now());
    const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON_LEN) : '';

    const result = await prisma.emailJob.updateMany({
      where: { id: { in: ids }, status: 'pending_approval' },
      data:
        action === 'approve'
          ? { status: 'pending', approvedAt: now, approvedBy: admin.email }
          : { status: 'rejected', approvedAt: now, approvedBy: admin.email, error: reason || null },
    });

    if (action === 'approve' && result.count > 0) {
      const records = await prisma.emailJob.findMany({
        where: { id: { in: ids }, status: 'pending' },
        select: { id: true, type: true, payload: true },
      });
      const queue = getEmailQueue();
      for (const rec of records) {
        const data = rec.payload as unknown as Omit<EmailJobData, 'type' | 'emailJobId'>;
        try {
          await queue.add(rec.type, { type: rec.type, ...data, emailJobId: rec.id } as EmailJobData, {
            priority: getPriorityForType(rec.type),
          });
        } catch (enqueueError) {
          await markEmailJobFailed(rec.id, enqueueError instanceof Error ? enqueueError.message : String(enqueueError), 0);
        }
      }
    }

    return success({ ok: true, affected: result.count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-emails] BULK error', { error: message });
    return serverError();
  }
}
