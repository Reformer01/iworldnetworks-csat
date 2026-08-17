import { getPublicBaseUrl } from './splynx-mirror';
import { runHourlySyncDb } from './splynx-sync-db';
import { logInfo, logWarn, logError } from './logger';

// Hourly: the sync is MariaDB-native (splynx-sync-db.ts) — no Firestore reads
// per run, so there is no read-quota constraint anymore. Payment webhooks
// still cover real-time invoice flips; reminders are 15/30-day so hourly
// scanning is plenty and keeps the mirror fresh after outages.
const SYNC_INTERVAL_MS = 60 * 60 * 1000;
const INITIAL_DELAY_MS = 120 * 1000; // wait 2 min after boot
const JITTER_MS = 10 * 60 * 1000; // ±10 min so replicas/restarts don't collide

// Exponential backoff on consecutive failures: 1h -> 2h -> 4h -> 6h (cap).
const BACKOFF_STEPS_MS = [60 * 60 * 1000, 2 * 60 * 60 * 1000, 4 * 60 * 60 * 1000, 6 * 60 * 60 * 1000];

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
  if (consecutiveFailures === 0) return SYNC_INTERVAL_MS;
  const step = Math.min(consecutiveFailures - 1, BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[step];
}

/**
 * Splynx mirror sync every hour (±10 min jitter, exponential backoff on
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
      logInfo('[splynx-sync] hourly run finished', {
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
    logInfo('[splynx-sync] starting scheduler (1h ± jitter, backoff on failure)');
    run();
  }, INITIAL_DELAY_MS);

  // Keep the process alive-safe: next start is a long-running server, but
  // unref() still lets tests/one-shot scripts exit cleanly.
  timer.unref?.();
}
