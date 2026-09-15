import { Queue } from 'bullmq';
import { getRedis } from '@/lib/redis';

export const RECONCILIATION_QUEUE_NAME = 'reconciliation';

export interface ReconciliationJobData {
  kind?: 'reconcile' | 'payments-backfill' | 'payments-incremental';
  month?: string;
}

let reconciliationQueue: Queue<ReconciliationJobData> | null = null;

export function getReconciliationQueue(): Queue<ReconciliationJobData> {
  if (!reconciliationQueue) {
    reconciliationQueue = new Queue<ReconciliationJobData>(RECONCILIATION_QUEUE_NAME, {
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
  return reconciliationQueue;
}

export async function closeReconciliationQueue(): Promise<void> {
  if (reconciliationQueue) {
    await reconciliationQueue.close();
    reconciliationQueue = null;
  }
}
