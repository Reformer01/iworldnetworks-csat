import { Worker, Job } from 'bullmq';
import { getRedis } from '@/lib/redis';
import { RECONCILIATION_QUEUE_NAME, ReconciliationJobData } from '@/lib/queues/reconciliation-queue';
import { importSplynxIncomeLedger } from '@/lib/finance/splynx-ledger';
import { runReconciliation } from '@/lib/finance/reconciliation-runner';
import { logInfo, logWarn, logError } from '@/lib/logger';

let reconciliationWorker: Worker<ReconciliationJobData> | null = null;

export function getReconciliationWorker(): Worker<ReconciliationJobData> {
  if (!reconciliationWorker) {
    reconciliationWorker = new Worker<ReconciliationJobData>(
      RECONCILIATION_QUEUE_NAME,
      async (job: Job<ReconciliationJobData>) => {
        const { month } = job.data;
        logInfo('[reconciliation-worker] Processing job', { jobId: job.id, month });

        // Step 1: Import Splynx ledger
        await job.updateProgress({ stage: 'import', fetched: 0, upserted: 0 });
        const importResult = await importSplynxIncomeLedger({ month });
        await job.updateProgress({ stage: 'match', fetched: importResult.fetched, upserted: importResult.upserted });

        // Step 2: Run matching
        const matchResult = await runReconciliation({ month });
        await job.updateProgress({
          stage: 'complete',
          fetched: importResult.fetched,
          upserted: importResult.upserted,
          ...matchResult,
        });

        logInfo('[reconciliation-worker] Job succeeded', { jobId: job.id, ...importResult, ...matchResult });
        return { ...importResult, ...matchResult };
      },
      {
        connection: getRedis(),
        concurrency: 1,
      },
    );

    reconciliationWorker.on('failed', (job, err) => {
      logError('[reconciliation-worker] Job failed', {
        jobId: job?.id,
        error: err.message,
      });
    });

    reconciliationWorker.on('stalled', (jobId) => {
      logWarn('[reconciliation-worker] Job stalled', { jobId });
    });

    reconciliationWorker.on('completed', (job) => {
      logInfo('[reconciliation-worker] Job completed', { jobId: job.id });
    });
  }
  return reconciliationWorker;
}

export async function startReconciliationWorker(): Promise<void> {
  if (process.env.RECONCILIATION_SYNC_DISABLED === 'true') {
    logInfo('[reconciliation-worker] Skipped — RECONCILIATION_SYNC_DISABLED=true');
    return;
  }
  getReconciliationWorker();
  logInfo('[reconciliation-worker] Started');
}

export async function stopReconciliationWorker(): Promise<void> {
  if (reconciliationWorker) {
    await reconciliationWorker.pause();
    await reconciliationWorker.close();
    reconciliationWorker = null;
    logInfo('[reconciliation-worker] Stopped');
  }
}
