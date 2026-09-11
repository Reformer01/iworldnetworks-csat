import { Queue, QueueEvents, Worker } from 'bullmq';
import { getRedis } from '@/lib/redis';

export const EMAIL_QUEUE_NAME = 'emails';

let emailQueue: Queue | null = null;
let emailQueueEvents: QueueEvents | null = null;

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return emailQueue;
}

export function getEmailQueueEvents(): QueueEvents {
  if (!emailQueueEvents) {
    emailQueueEvents = new QueueEvents(EMAIL_QUEUE_NAME, {
      connection: getRedis(),
    });
  }
  return emailQueueEvents;
}

export async function closeEmailQueue(): Promise<void> {
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = null;
  }
  if (emailQueueEvents) {
    await emailQueueEvents.close();
    emailQueueEvents = null;
  }
}

export type EmailJobType = 'invoice_reminder' | 'churn_survey' | 'winback' | 'feedback_request' | 'manual' | 'campaign';

export interface BaseEmailJobData {
  type: EmailJobType;
  emailJobId: string;
  customerId: string;
  customerEmail: string;
  customerName: string;
}

export interface InvoiceReminderJobData extends BaseEmailJobData {
  type: 'invoice_reminder';
  invoiceIds: string[];
  reminderType: '15d' | '30d';
}

export interface ChurnSurveyJobData extends BaseEmailJobData {
  type: 'churn_survey';
  churnedAt: number;
}

export interface WinBackJobData extends BaseEmailJobData {
  type: 'winback';
  churnedAt?: number;
  /** Pre-minted feedback token + ready-to-send links from the producer.
   *  When present the worker sends exactly what was approved (no re-mint). */
  winBackToken?: string;
  portalUrl?: string;
  csatUrl?: string;
  feedbackUrl?: string;
}

export interface FeedbackRequestJobData extends BaseEmailJobData {
  type: 'feedback_request';
  sourceEvent: string;
  eventHash: string;
  /** Ready-to-send link from the producer. When present the worker sends it
   *  as-is so the approved payload matches the delivered email. */
  feedbackUrl?: string;
}

export interface ManualEmailJobData extends BaseEmailJobData {
  type: 'manual';
  subject: string;
  html: string;
  text: string;
}

export interface CampaignEmailJobData extends BaseEmailJobData {
  type: 'campaign';
  subject: string;
  html: string;
  text: string;
  campaignId: string;
}

export type EmailJobData =
  | InvoiceReminderJobData
  | ChurnSurveyJobData
  | WinBackJobData
  | FeedbackRequestJobData
  | ManualEmailJobData
  | CampaignEmailJobData;

export const EMAIL_JOB_PRIORITY = {
  winback: 10,
  churn_survey: 5,
  invoice_reminder: 3,
  feedback_request: 2,
  manual: 1,
  campaign: 1,
} as const;

export function getPriorityForType(type: EmailJobType | string): number {
  return (EMAIL_JOB_PRIORITY as Record<string, number>)[type] ?? 1;
}
