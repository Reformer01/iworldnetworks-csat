import { Worker, Job } from 'bullmq';
import { getRedis } from '@/lib/redis';
import {
  EMAIL_QUEUE_NAME,
  EmailJobData,
  InvoiceReminderJobData,
  ChurnSurveyJobData,
  WinBackJobData,
  FeedbackRequestJobData,
  ManualEmailJobData,
  CampaignEmailJobData,
} from '@/lib/queues/email-queue';
import { sendInvoiceReminderEmail } from '@/lib/email';
import { sendChurnSurveyEmail } from '@/lib/email';
import { sendWinBackEmail } from '@/lib/email';
import { sendFeedbackEmail } from '@/lib/email';
import { getTransporter } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { logInfo, logWarn, logError } from '@/lib/logger';
import { markEmailJobProcessing, markEmailJobSent, markEmailJobFailed } from '@/lib/repositories/email-job-repo';

let emailWorker: Worker<EmailJobData> | null = null;

export function getEmailWorker(): Worker<EmailJobData> {
  if (!emailWorker) {
    emailWorker = new Worker<EmailJobData>(
      EMAIL_QUEUE_NAME,
      async (job: Job<EmailJobData>) => {
        await processEmailJob(job);
      },
      {
        connection: getRedis(),
        concurrency: 5,
        limiter: {
          max: 100,
          duration: 60000, // 100 jobs per minute
        },
      },
    );

    emailWorker.on('failed', (job, err) => {
      logError('[email-worker] Job failed', {
        jobId: job?.id,
        type: job?.data.type,
        error: err.message,
      });
    });

    emailWorker.on('stalled', (jobId) => {
      logWarn('[email-worker] Job stalled', { jobId });
    });

    emailWorker.on('completed', (job) => {
      logInfo('[email-worker] Job completed', {
        jobId: job.id,
        type: job.data.type,
      });
    });
  }
  return emailWorker;
}

function isInvoiceReminder(data: EmailJobData): data is InvoiceReminderJobData {
  return data.type === 'invoice_reminder';
}

function isChurnSurvey(data: EmailJobData): data is ChurnSurveyJobData {
  return data.type === 'churn_survey';
}

function isWinBack(data: EmailJobData): data is WinBackJobData {
  return data.type === 'winback';
}

function isFeedbackRequest(data: EmailJobData): data is FeedbackRequestJobData {
  return data.type === 'feedback_request';
}

function isManualEmail(data: EmailJobData): data is ManualEmailJobData {
  return data.type === 'manual';
}

function isCampaignEmail(data: EmailJobData): data is CampaignEmailJobData {
  return data.type === 'campaign';
}

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { data } = job;
  const startTime = Date.now();

  logInfo('[email-worker] Processing job', {
    jobId: job.id,
    type: data.type,
    customerId: data.customerId,
  });

  // Jobs enqueued before the EmailJob record existed have no emailJobId; skip
  // persistence for those. For tracked jobs, gate on approval: a job must not
  // be sent while its record is awaiting approval or rejected (defense in
  // depth — the producer never enqueues those, but retries/edge paths could).
  if (data.emailJobId) {
    const rec = await prisma.emailJob.findUnique({
      where: { id: data.emailJobId },
      select: { status: true },
    });
    if (rec && (rec.status === 'pending_approval' || rec.status === 'rejected')) {
      logWarn('[email-worker] Skipping unapproved email', {
        jobId: job.id,
        emailJobId: data.emailJobId,
        status: rec.status,
      });
      return;
    }
    await markEmailJobProcessing(data.emailJobId);
  }

  try {
    if (isInvoiceReminder(data)) {
      await processInvoiceReminder(data);
    } else if (isChurnSurvey(data)) {
      await processChurnSurvey(data);
    } else if (isWinBack(data)) {
      await processWinBack(data);
    } else if (isFeedbackRequest(data)) {
      await processFeedbackRequest(data);
    } else if (isManualEmail(data)) {
      await processManualEmail(data);
    } else if (isCampaignEmail(data)) {
      await processCampaignEmail(data);
    } else {
      const unknownType = (data as EmailJobData).type;
      throw new Error(`Unknown email job type: ${unknownType}`);
    }

    if (data.emailJobId) {
      await markEmailJobSent(data.emailJobId);
    }

    logInfo('[email-worker] Job succeeded', {
      jobId: job.id,
      type: data.type,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('[email-worker] Job error', {
      jobId: job.id,
      type: data.type,
      error: message,
    });
    if (data.emailJobId) {
      await markEmailJobFailed(data.emailJobId, message, job.attemptsMade);
    }
    throw error;
  }
}

async function processInvoiceReminder(data: InvoiceReminderJobData): Promise<void> {
  const { invoiceIds, reminderType, customerEmail, customerName } = data;

  const invoices = await prisma.invoice.findMany({
    where: { invoiceId: { in: invoiceIds } },
  });

  if (!invoices.length) {
    throw new Error(`No invoices found for IDs: ${invoiceIds.join(', ')}`);
  }

  const emailInvoices = invoices.map((inv) => ({
    invoiceNumber: String(inv.number || inv.invoiceId),
    amount: inv.total || 0,
    dueDate: inv.dueDate ? new Date(Number(inv.dueDate)).toISOString().slice(0, 10) : '',
    daysOverdue: inv.dueDate ? Math.max(0, Math.floor((Date.now() - Number(inv.dueDate)) / (24 * 60 * 60 * 1000))) : 0,
  }));

  await sendInvoiceReminderEmail({
    to: customerEmail,
    customerName,
    invoices: emailInvoices,
    reminderType,
  });

  // Update invoice flags
  const now = BigInt(Date.now());
  if (reminderType === '30d') {
    await prisma.invoice.updateMany({
      where: { invoiceId: { in: invoiceIds } },
      data: { reminder30SentAt: now, reminder15SentAt: now },
    });
  } else {
    await prisma.invoice.updateMany({
      where: { invoiceId: { in: invoiceIds } },
      data: { reminder15SentAt: now },
    });
  }
}

async function processChurnSurvey(data: ChurnSurveyJobData): Promise<void> {
  const { churnedAt, customerEmail, customerName, customerId } = data;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://csat.iwn.ng';
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

  await prisma.churnSurvey.create({
    data: {
      id: token,
      customerId,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      sentAt: BigInt(Date.now()),
      expiresAt: BigInt(expiresAt),
      used: false,
      submittedAt: null,
      rating: null,
      reason: null,
      comment: null,
      clientIp: null,
    },
  });

  await sendChurnSurveyEmail({
    to: customerEmail,
    customerName: customerName || 'there',
    churnUrl: `${baseUrl}/churn?token=${token}`,
  });

  await prisma.customer.update({
    where: { customerId },
    data: { churnSurveySentAt: BigInt(Date.now()), churnSurveyToken: token },
  });
}

async function processWinBack(data: WinBackJobData): Promise<void> {
  const { churnedAt, customerEmail, customerName, customerId } = data;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://csat.iwn.ng';
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  await prisma.feedbackToken.create({
    data: {
      id: token,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: '',
      location: '',
      serviceDate: '',
      sourceEvent: 'winback',
      eventHash: `winback-${customerId}`,
      category: 'Reliability',
      staffName: '',
      used: false,
      createdAt: BigInt(Date.now()),
      expiresAt: BigInt(expiresAt),
      openedAt: null,
      submittedAt: null,
    },
  });

  await sendWinBackEmail({
    to: customerEmail,
    customerName: customerName || 'there',
    portalUrl: 'https://portal.iwn.ng',
    csatUrl: baseUrl,
    feedbackUrl: `${baseUrl}/feedback/popup?token=${token}&embed=true`,
  });

  await prisma.customer.update({
    where: { customerId },
    data: { winBackSentAt: BigInt(Date.now()), winBackToken: token },
  });
}

async function processFeedbackRequest(data: FeedbackRequestJobData): Promise<void> {
  const { sourceEvent, eventHash, customerEmail, customerName, customerId } = data;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://csat.iwn.ng';
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  await prisma.feedbackToken.create({
    data: {
      id: token,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: '',
      location: '',
      serviceDate: '',
      sourceEvent,
      eventHash: eventHash || '',
      category: 'Billing',
      staffName: '',
      used: false,
      createdAt: BigInt(Date.now()),
      expiresAt: BigInt(expiresAt),
      openedAt: null,
      submittedAt: null,
    },
  });

  await sendFeedbackEmail({
    to: customerEmail,
    customerName,
    feedbackUrl: `${baseUrl}/feedback?token=${token}&subject=Billing`,
  });
}

async function sendRawEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    // Fail loudly so the EmailJob record shows 'failed', not a phantom 'sent'.
    throw new Error('SMTP not configured (SPLYNX_SMTP_PASS missing) - email not sent');
  }

  await transporter.sendMail({
    from: `"I-World Networks Limited" <no_reply@mail.iworldnetworks.net>`,
    to,
    subject,
    text,
    html,
  });
}

async function processManualEmail(data: ManualEmailJobData): Promise<void> {
  const { subject, html, text, customerEmail } = data;
  await sendRawEmail(customerEmail, subject, html, text);
}

async function processCampaignEmail(data: CampaignEmailJobData): Promise<void> {
  const { subject, html, text, customerEmail } = data;
  await sendRawEmail(customerEmail, subject, html, text);
}

export async function startEmailWorker(): Promise<void> {
  if (process.env.MAIL_JOBS_DISABLED === 'true') {
    logInfo('[email-worker] Skipped — MAIL_JOBS_DISABLED=true');
    return;
  }
  getEmailWorker();
  logInfo('[email-worker] Started');
}

export async function stopEmailWorker(): Promise<void> {
  if (emailWorker) {
    await emailWorker.pause();
    await emailWorker.close();
    emailWorker = null;
    logInfo('[email-worker] Stopped');
  }
}
