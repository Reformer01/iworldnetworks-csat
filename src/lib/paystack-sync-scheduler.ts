import { getPaystackSyncQueue } from './queues/paystack-sync-queue';
import { getReconciliationQueue } from './queues/reconciliation-queue';
import { PAYSTACK_DASHBOARD_STATUSES } from './paystack';
import { logInfo, logError } from './logger';

// Hourly by default (env-configurable): enqueue a Paystack transaction sync
// followed by reconciliation for the current month. Previously both only ran
// on manual button clicks, so dashboards went stale and reconciliation
// backlogs accumulated silently.
const INITIAL_DELAY_MS = 5 * 60 * 1000; // wait 5 min after boot

function paystackSyncIntervalMs(): number {
  const minutes = Number(process.env.PAYSTACK_SYNC_INTERVAL_MIN);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 60 * 60 * 1000;
}

let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let intervalTimer: ReturnType<typeof setInterval> | undefined;

async function runOnce(): Promise<void> {
  // Current month plus the previous one: late-settling and boundary
  // transactions land in either, and fixes must cover all months equally.
  const now = new Date();
  const months = [now.toISOString().slice(0, 7)];
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonth = prev.toISOString().slice(0, 7);
  if (prevMonth !== months[0]) months.push(prevMonth);
  const syncQueue = getPaystackSyncQueue();
  await syncQueue.add('sync', { maxPages: 10, statuses: [...PAYSTACK_DASHBOARD_STATUSES] });
  const reconQueue = getReconciliationQueue();
  for (const month of months) {
    await reconQueue.add('reconcile', { kind: 'reconcile', month });
  }
  logInfo('[paystack-sync-scheduler] enqueued hourly sync + reconcile', { months });
}

/**
 * Paystack automation: hourly sync + reconcile, inside
 * instrumentation.register() like the Splynx/UISP schedulers. Workers
 * already boot there; this finally gives them jobs without human clicks.
 */
export function startPaystackSyncScheduler(): void {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      await runOnce();
    } catch (err) {
      logError('[paystack-sync-scheduler] tick failed', { error: err instanceof Error ? err.message : String(err) });
    }
  };
  timer = setTimeout(() => {
    void tick();
    intervalTimer = setInterval(() => void tick(), paystackSyncIntervalMs());
  }, INITIAL_DELAY_MS);
}

export function stopPaystackSyncScheduler(): void {
  started = false;
  if (timer) clearTimeout(timer);
  if (intervalTimer) clearInterval(intervalTimer);
  timer = undefined;
  intervalTimer = undefined;
}
