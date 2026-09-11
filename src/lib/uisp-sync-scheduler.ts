import { logInfo, logWarn, logError } from './logger';
import { syncUisp, uispSyncIntervalMs } from './uisp-sync';
import { runReconciliation } from './reconcile/runReconciliation';

// UISP network mirror sync every 10 min (env UISP_SYNC_INTERVAL_MIN, ±10 min
// jitter, backoff on failure). Same pattern as the Splynx scheduler: runs in
// the pm2 fork, MariaDB lease guards overlap. UISP data feeds the BTS resolver
// (customer -> BTS attribution) and the admin BTS dashboard; webhooks cover
// real-time site changes, this poll is the reconciliation backstop.

const INITIAL_DELAY_MS = 3 * 60 * 1000; // 3 min after boot
const JITTER_MS = 10 * 60 * 1000;
const BACKOFF_STEPS_MS = [60 * 60 * 1000, 2 * 60 * 60 * 1000, 4 * 60 * 60 * 1000, 6 * 60 * 60 * 1000];

let started = false;
let consecutiveFailures = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let intervalTimer: ReturnType<typeof setTimeout> | undefined;

function nextIntervalMs(): number {
  if (consecutiveFailures === 0) return uispSyncIntervalMs();
  const step = Math.min(consecutiveFailures - 1, BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[step];
}

export function startUispSyncScheduler(): void {
  if (started) return;
  started = true;

  if (process.env.UISP_SYNC_DISABLED === 'true') {
    logInfo('[uisp-sync] scheduler disabled via UISP_SYNC_DISABLED');
    return;
  }

  const run = async () => {
    try {
      const stats = await syncUisp();
      logInfo('[uisp-sync] scheduler run finished', { ...stats });
      consecutiveFailures = 0;
      // Reconcile sales records against the fresh customer truth; a failure
      // here must never roll back the sync itself (and vice versa).
      try {
        const rec = await runReconciliation();
        logInfo('[uisp-sync] reconciliation finished', { ...rec });
      } catch (err) {
        logWarn('[uisp-sync] reconciliation failed (sync unaffected)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      scheduleNext();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      consecutiveFailures++;
      logError('[uisp-sync] scheduler run error', { error: message, consecutiveFailures });
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    if (intervalTimer) clearTimeout(intervalTimer);
    const delay = nextIntervalMs() + Math.floor(Math.random() * JITTER_MS * 2) - JITTER_MS;
    intervalTimer = setTimeout(run, Math.max(delay, 60 * 1000));
    intervalTimer.unref?.();
  };

  timer = setTimeout(() => {
    logInfo('[uisp-sync] starting scheduler (10 min ± jitter, backoff on failure)');
    run();
  }, INITIAL_DELAY_MS);
  timer.unref?.();
}
