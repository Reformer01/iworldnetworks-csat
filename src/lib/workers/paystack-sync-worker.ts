import { Worker, Job } from 'bullmq';
import { getRedis } from '@/lib/redis';
import { PAYSTACK_SYNC_QUEUE_NAME, PaystackSyncJobData } from '@/lib/queues/paystack-sync-queue';
import { syncPaystackTransactions } from '@/lib/paystack';
import { logInfo, logWarn, logError } from '@/lib/logger';

let paystackSyncWorker: Worker<PaystackSyncJobData> | null = null;

export function getPaystackSyncWorker(): Worker<PaystackSyncJobData> {
  if (!paystackSyncWorker) {
    paystackSyncWorker = new Worker<PaystackSyncJobData>(
      PAYSTACK_SYNC_QUEUE_NAME,
      async (job: Job<PaystackSyncJobData>) => {
        const { maxPages, statuses } = job.data;
        logInfo('[paystack-sync-worker] Processing job', { jobId: job.id, maxPages });
        const result = await syncPaystackTransactions({
          maxPages,
          statuses,
          onProgress: (p) => job.updateProgress({ fetched: p.fetched, upserted: p.upserted }),
        });
        await job.updateProgress({ fetched: result.fetched, upserted: result.upserted });
        logInfo('[paystack-sync-worker] Job succeeded', { jobId: job.id, ...result });
        return result;
      },
      {
        connection: getRedis(),
        concurrency: 1,
      },
    );

    paystackSyncWorker.on('failed', (job, err) => {
      logError('[paystack-sync-worker] Job failed', {
        jobId: job?.id,
        error: err.message,
      });
    });

    paystackSyncWorker.on('stalled', (jobId) => {
      logWarn('[paystack-sync-worker] Job stalled', { jobId });
    });

    paystackSyncWorker.on('completed', (job) => {
      logInfo('[paystack-sync-worker] Job completed', { jobId: job.id });
    });
  }
  return paystackSyncWorker;
}

export async function startPaystackSyncWorker(): Promise<void> {
  if (process.env.PAYSTACK_SYNC_DISABLED === 'true') {
    logInfo('[paystack-sync-worker] Skipped — PAYSTACK_SYNC_DISABLED=true');
    return;
  }
  getPaystackSyncWorker();
  logInfo('[paystack-sync-worker] Started');
}

export async function stopPaystackSyncWorker(): Promise<void> {
  if (paystackSyncWorker) {
    await paystackSyncWorker.pause();
    await paystackSyncWorker.close();
    paystackSyncWorker = null;
    logInfo('[paystack-sync-worker] Stopped');
  }
}
