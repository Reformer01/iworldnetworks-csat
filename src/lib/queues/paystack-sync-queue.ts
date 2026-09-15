import { Queue } from 'bullmq';
import { getRedis } from '@/lib/redis';

export const PAYSTACK_SYNC_QUEUE_NAME = 'paystack-sync';

export interface PaystackSyncJobData {
  maxPages: number;
  statuses: string[];
}

let paystackSyncQueue: Queue<PaystackSyncJobData> | null = null;

export function getPaystackSyncQueue(): Queue<PaystackSyncJobData> {
  if (!paystackSyncQueue) {
    paystackSyncQueue = new Queue<PaystackSyncJobData>(PAYSTACK_SYNC_QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return paystackSyncQueue;
}

export async function closePaystackSyncQueue(): Promise<void> {
  if (paystackSyncQueue) {
    await paystackSyncQueue.close();
    paystackSyncQueue = null;
  }
}
