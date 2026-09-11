import { getPublicBaseUrl } from './splynx-mirror';
import { runHourlySyncDb } from './splynx-sync-db';
import { runReconciliation } from './reconcile/runReconciliation';
import { logInfo, logWarn, logError } from './logger';

// Every 15 min by default (env-configurable): the sync is MariaDB-native
// (splynx-sync-db.ts) — no Firestore reads per run, so there is no read-quota
// constraint anymore. Payment webhooks still cover real-time invoice flips;
// reminders are 15/30-day so 15-min scanning is plenty and keeps the mirror
// fresh after outages.
const INITIAL_DELAY_MS = 120 * 1000; // wait 2 min after boot
const JITTER_MS = 10 * 60 * 1000; // ±10 min so replicas/restarts don't collide

// Exponential backoff on consecutive failures: 1h -> 2h -> 4h -> 6h (cap).
const BACKOFF_STEPS_MS = [60 * 60 * 1000, 2 * 60 * 60 * 1000, 4 * 60 * 60 * 1000, 6 * 60 * 60 * 1000];

/** Poll interval; garbage env values (NaN, 0, negative) fall back to 15 min. */
function splynxSyncIntervalMs(): number {
  const minutes = Number(process.env.SPLYNX_SYNC_INTERVAL_MIN);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 15 * 60 * 1000;
}

let started = false;
let consecutiveFailures = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let intervalTimer: ReturnType<typeof setInterval> | undefined;

/** Optional generic alert webhook (e.g. Slack/ntfy). No-op if unset. */
async function alertOnFailure(error: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[csat-seat] Splynx sync failing (${consecutiveFailures} in a row): ${error}`,
      }),
    });
  } catch {
    // Alert delivery failing is not worth crashing the scheduler for.
  }
}

function nextIntervalMs(): number {
  if (consecutiveFailures === 0) return splynxSyncIntervalMs();
  const step = Math.min(consecutiveFailures - 1, BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[step];
}

/**
 * Splynx mirror sync every 15 min (±10 min jitter, exponential backoff on
 * failure). Runs inside instrumentation.register() — the Next server is a
 * single pm2 fork instance (ecosystem.config.js), so one interval is
 * sufficient; a MariaDB lease lock guards against overlap across restarts
 * or manual runs.
 */
export function startSplynxSyncScheduler(): void {
  if (started) return;
  started = true;

  if (process.env.DISABLE_SPLYNX_SYNC === 'true') {
    logInfo('[splynx-sync] scheduler disabled via DISABLE_SPLYNX_SYNC');
    return;
  }

  const run = async () => {
    try {
      const stats = await runHourlySyncDb(getPublicBaseUrl());
      logInfo('[splynx-sync] sync run finished', {
        upserted: stats.customersUpserted,
        deleted: stats.customersMarkedDeleted,
        invoices: stats.invoicesUpserted,
        reminders15: stats.reminders15,
        reminders30: stats.reminders30,
        churnSent: stats.churnSent,
        invoicesApiDenied: stats.invoicesApiDenied,
      });
      if (consecutiveFailures > 0) {
        logInfo('[splynx-sync] sync recovered after failures', { previousFailures: consecutiveFailures });
      }
      consecutiveFailures = 0;
      // Reconcile sales records against the fresh customer truth. A failure
      // here must never roll back the sync itself (and vice versa).
      try {
        const rec = await runReconciliation();
        logInfo('[splynx-sync] reconciliation finished', { ...rec });
      } catch (err) {
        logWarn('[splynx-sync] reconciliation failed (sync unaffected)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      scheduleNext();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      consecutiveFailures++;
      logError('[splynx-sync] hourly run error', {
        error: message,
        consecutiveFailures,
        nextRetryInMs: nextIntervalMs(),
      });
      await alertOnFailure(message);
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    if (intervalTimer) clearInterval(intervalTimer);
    const delay = nextIntervalMs() + Math.floor(Math.random() * JITTER_MS * 2) - JITTER_MS;
    // schedule via setTimeout chain instead of setInterval so the interval
    // always reflects the current backoff state.
    intervalTimer = setTimeout(run, Math.max(delay, 60 * 1000));
    intervalTimer.unref?.();
  };

  timer = setTimeout(() => {
    logInfo('[splynx-sync] starting scheduler (15 min ± jitter, backoff on failure)');
    run();
  }, INITIAL_DELAY_MS);

  // Keep the process alive-safe: next start is a long-running server, but
  // unref() still lets tests/one-shot scripts exit cleanly.
  timer.unref?.();
}
