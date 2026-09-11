import { getEmailQueue, getPriorityForType, EmailJobData } from './email-queue';
import { createEmailJob, markEmailJobFailed, setEmailJobBullJobId } from '@/lib/repositories/email-job-repo';
import type { Prisma } from '@prisma/client';

// Create the EmailJob audit record first, then enqueue. If enqueueing fails,
// mark the record failed so the dashboard shows it instead of a phantom pending.
// When status is 'pending_approval' the job is NOT enqueued — a super admin must
// approve it first (POST /api/admin/emails/[id] { action: 'approve' }).
async function addEmailJob<T extends Omit<EmailJobData, 'emailJobId'>>(
  name: string,
  data: T,
  priority: number,
  status?: 'pending' | 'pending_approval',
): Promise<void> {
  const emailJobId = await createEmailJob({
    type: data.type,
    customerId: (data as { customerId?: string }).customerId,
    customerEmail: (data as { customerEmail?: string }).customerEmail,
    customerName: (data as { customerName?: string }).customerName,
    payload: data as unknown as Prisma.InputJsonValue,
    status,
  });
  if (status === 'pending_approval') return;

  const queue = getEmailQueue();
  try {
    const job = await queue.add(name, { ...data, emailJobId }, { priority });
    await setEmailJobBullJobId(emailJobId, job.id ?? '');
  } catch (error) {
    await markEmailJobFailed(emailJobId, error instanceof Error ? error.message : String(error), 0);
    throw error;
  }
}

// NOTE (Sep 2026 audit): the per-type queue* helpers were removed — zero
// callers since the MariaDB strangler cutover (sync jobs send or create
// approval jobs directly). Only queueManualEmail remains live.
export async function queueManualEmail(
  to: string,
  customerName: string,
  subject: string,
  html: string,
  text: string,
  requiresApproval = false,
): Promise<void> {
  await addEmailJob(
    'manual',
    {
      type: 'manual',
      customerId: 'manual',
      customerEmail: to,
      customerName,
      subject,
      html,
      text,
    },
    getPriorityForType('manual'),
    requiresApproval ? 'pending_approval' : 'pending',
  );
}
