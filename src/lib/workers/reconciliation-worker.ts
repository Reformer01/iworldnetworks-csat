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
        const kind = job.data.kind ?? 'reconcile';
        const month = job.data.month ?? new Date().toISOString().slice(0, 7);
        logInfo('[reconciliation-worker] Processing job', { jobId: job.id, kind, month });

        if (kind === 'invoice-items') {
          const { syncInvoiceItemsByIds, INVOICE_ITEMS_MAX_IDS } = await import('@/lib/splynx-sync-db');
          const { prisma } = await import('@/lib/prisma');
          await job.updateProgress({ stage: 'invoice-items', kind, fetched: 0, upserted: 0 });
          let ids = (Array.isArray(job.data.invoiceIds) ? job.data.invoiceIds : []).map((v) => String(v ?? '').trim()).filter(Boolean);
          if (!ids.length) {
            const [y, m] = month.split('-').map(Number);
            const gte = new Date(Date.UTC(y, m - 1, 1));
            const lt = new Date(Date.UTC(y, m, 1));
            const rows = await prisma.splynxPayment.findMany({
              where: { paidAt: { gte, lt } },
              select: { invoiceId: true },
              take: INVOICE_ITEMS_MAX_IDS,
            });
            const seen = new Set<string>();
            ids = [];
            for (const row of rows) {
              const inv = String(row.invoiceId ?? '').trim();
              if (!inv || seen.has(inv)) continue;
              seen.add(inv);
              ids.push(inv);
              if (ids.length >= INVOICE_ITEMS_MAX_IDS) break;
            }
          }
          const result = await syncInvoiceItemsByIds(ids);
          await job.updateProgress({ stage: 'complete', kind, ...result });
          logInfo('[reconciliation-worker] Invoice items sync succeeded', { jobId: job.id, kind, ...result });
          return result;
        }

        if (kind === 'payments-backfill' || kind === 'payments-incremental') {
          const { syncSplynxPayments } = await import('@/lib/splynx-payments');
          await job.updateProgress({ stage: 'payments', kind, fetched: 0, upserted: 0 });
          const result = await syncSplynxPayments({ fullBackfill: kind === 'payments-backfill' });
          await job.updateProgress({ stage: 'complete', kind, ...result });
          logInfo('[reconciliation-worker] Payments sync succeeded', { jobId: job.id, kind, ...result });
          return result;
        }

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
