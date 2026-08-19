import { getEmailQueue, getPriorityForType, EmailJobData } from './email-queue';
import { prisma } from '@/lib/prisma';
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

export async function queueInvoiceReminder(customerId: string, invoiceIds: string[], reminderType: '15d' | '30d'): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { customerId },
    select: { customerId: true, email: true, customerName: true },
  });
  if (!customer?.email) return;

  await addEmailJob(
    'invoice_reminder',
    {
      type: 'invoice_reminder',
      customerId: customer.customerId,
      customerEmail: customer.email,
      customerName: customer.customerName || '',
      invoiceIds,
      reminderType,
    },
    getPriorityForType('invoice_reminder'),
  );
}

export async function queueChurnSurvey(customerId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { customerId },
    select: { customerId: true, email: true, customerName: true, churnedAt: true },
  });
  if (!customer?.email || !customer.churnedAt) return;

  await addEmailJob(
    'churn_survey',
    {
      type: 'churn_survey',
      customerId: customer.customerId,
      customerEmail: customer.email,
      customerName: customer.customerName || '',
      churnedAt: Number(customer.churnedAt),
    },
    getPriorityForType('churn_survey'),
  );
}

export async function queueWinBack(customerId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { customerId },
    select: { customerId: true, email: true, customerName: true, churnedAt: true },
  });
  if (!customer?.email || !customer.churnedAt) return;

  await addEmailJob(
    'winback',
    {
      type: 'winback',
      customerId: customer.customerId,
      customerEmail: customer.email,
      customerName: customer.customerName || '',
      churnedAt: Number(customer.churnedAt),
    },
    getPriorityForType('winback'),
  );
}

export async function queueFeedbackRequest(customerId: string, sourceEvent: string, eventHash: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { customerId },
    select: { customerId: true, email: true, customerName: true },
  });
  if (!customer?.email) return;

  await addEmailJob(
    'feedback_request',
    {
      type: 'feedback_request',
      customerId: customer.customerId,
      customerEmail: customer.email,
      customerName: customer.customerName || '',
      sourceEvent,
      eventHash,
    },
    getPriorityForType('feedback_request'),
  );
}

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
