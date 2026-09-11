import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, verifySuperAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, notFound, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { getEmailQueue, getPriorityForType, EmailJobData } from '@/lib/queues/email-queue';
import { serializeEmailJob, markEmailJobFailed } from '@/lib/repositories/email-job-repo';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { id } = await params;
    const record = await prisma.emailJob.findUnique({ where: { id } });
    if (!record) return notFound();

    return success(serializeEmailJob(record));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-emails] GET detail error', { error: message });
    return serverError();
  }
}

const MAX_REASON_LEN = 190;

// POST /api/admin/emails/[id]
//   { action: 'approve' }  — super admin approves a pending_approval job: sets
//                            status pending + enqueues for the worker.
//   { action: 'reject' }   — super admin rejects with optional reason.
//   (no body / retry)      — any admin retries a failed job (legacy behavior).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { id } = await params;
    const record = await prisma.emailJob.findUnique({ where: { id } });
    if (!record) return notFound();

    const body = await request.json().catch(() => null);
    const action = typeof body?.action === 'string' ? body.action : 'retry';

    if (action === 'approve' || action === 'reject') {
      const superAdmin = await verifySuperAdminToken(request.headers.get('authorization'));
      if (!superAdmin) return forbidden();
      if (record.status !== 'pending_approval') return error('Only emails awaiting approval can be approved/rejected');

      const now = BigInt(Date.now());
      if (action === 'approve') {
        // Update record first, then enqueue. If enqueueing fails the record is
        // marked failed (visible) instead of being stuck as approved-unset.
        await prisma.emailJob.update({
          where: { id },
          data: { status: 'pending', approvedAt: now, approvedBy: superAdmin.email },
        });
        // The stored payload carries only job fields — re-attach the record's
        // type so the worker's guards match (payloads never contain `type`).
        const data = record.payload as unknown as Omit<EmailJobData, 'type' | 'emailJobId'>;
        try {
          await getEmailQueue().add(record.type, { type: record.type, ...data, emailJobId: record.id } as EmailJobData, {
            priority: getPriorityForType(record.type),
          });
        } catch (enqueueError) {
          await markEmailJobFailed(id, enqueueError instanceof Error ? enqueueError.message : String(enqueueError), 0);
          throw enqueueError;
        }
        return success({ ok: true, status: 'pending' });
      }

      const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON_LEN) : '';
      await prisma.emailJob.update({
        where: { id },
        data: { status: 'rejected', approvedAt: now, approvedBy: superAdmin.email, error: reason || null },
      });
      return success({ ok: true, status: 'rejected' });
    }

    // Retry: re-enqueue a failed email job. Reuses the same EmailJob record
    // (the worker updates it via emailJobId), so the audit trail stays on one row.
    if (record.status !== 'failed') return error('Only failed emails can be retried');

    const data = record.payload as unknown as Omit<EmailJobData, 'type' | 'emailJobId'>;
    await getEmailQueue().add(record.type, { type: record.type, ...data, emailJobId: record.id } as EmailJobData, {
      priority: getPriorityForType(record.type),
    });
    await prisma.emailJob.update({ where: { id }, data: { status: 'pending', error: null } });

    return success({ ok: true, status: 'pending' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-emails] POST action error', { error: message });
    return serverError();
  }
}
