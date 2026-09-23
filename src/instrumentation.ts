import { init, captureRequestError } from '@sentry/nextjs';

export async function register() {
  init({
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });

  // instrumentation.register() runs in both the Node.js and Edge runtimes.
  // The Splynx mirror scheduler needs firebase-admin (Node-only), so guard it
  // to the Node runtime and import lazily — otherwise firebase-admin's Node
  // built-ins get pulled into the Edge bundle and crash at startup.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startSplynxSyncScheduler } = await import('@/lib/splynx-sync-scheduler');
    startSplynxSyncScheduler();
    const { startUispSyncScheduler } = await import('@/lib/uisp-sync-scheduler');
    startUispSyncScheduler();
    const { startEmailWorker } = await import('@/lib/workers/email-worker');
    startEmailWorker();
    const { startPaystackSyncWorker } = await import('@/lib/workers/paystack-sync-worker');
    startPaystackSyncWorker();
    const { startReconciliationWorker } = await import('@/lib/workers/reconciliation-worker');
    startReconciliationWorker();
    const { startPaystackSyncScheduler } = await import('@/lib/paystack-sync-scheduler');
    startPaystackSyncScheduler();

    // Campaign scheduler — checks for scheduled campaigns every minute
    const { processScheduledCampaigns } = await import('@/lib/campaign-scheduler');
    const runCampaignScheduler = async () => {
      try {
        const result = await processScheduledCampaigns();
        if (result.processed > 0) {
          console.log(`[campaign-scheduler] Sent ${result.processed} scheduled campaign(s)`);
        }
        if (result.errors.length > 0) {
          console.error('[campaign-scheduler] Errors:', result.errors);
        }
      } catch (err) {
        console.error('[campaign-scheduler] failed:', err instanceof Error ? err.message : err);
      }
    };
    setInterval(runCampaignScheduler, 60 * 1000); // every minute

    // Tower audit snapshot scheduler — captures tower state hourly
    const { captureTowerSnapshots } = await import('@/lib/audit/tower-snapshot');
    const runTowerSnapshots = async () => {
      try {
        const result = await captureTowerSnapshots();
        if (result.captured > 0) {
          console.log(`[tower-snapshot] Captured ${result.captured} tower snapshots`);
        }
      } catch (err) {
        console.error('[tower-snapshot] failed:', err instanceof Error ? err.message : err);
      }
    };
    // Run once after 2 minutes, then every hour
    setTimeout(runTowerSnapshots, 2 * 60 * 1000);
    setInterval(runTowerSnapshots, 60 * 60 * 1000);

    // Weekly database validation (Splynx vs UISP vs master) — meeting
    // decision: recurring cross-check until the dataset is verified.
    const runWeeklyValidation = async () => {
      try {
        const { runWeeklyValidation: run } = await import('@/lib/validation');
        const report = await run();
        console.log('[weekly-validation]', JSON.stringify(report.master));
      } catch (err) {
        console.error('[weekly-validation] failed:', err instanceof Error ? err.message : err);
      }
    };
    setTimeout(runWeeklyValidation, 60_000); // once shortly after boot
    setInterval(runWeeklyValidation, 7 * 24 * 60 * 60 * 1000); // then weekly

    // Daily follow-up reminders at 3:00 PM WAT (14:00 UTC).
    const scheduleFollowUpReminders = () => {
      const now = new Date();
      const target = new Date(now);
      target.setUTCHours(14, 0, 0, 0); // 3:00 PM WAT = 14:00 UTC
      if (target <= now) target.setDate(target.getDate() + 1);
      const delay = target.getTime() - now.getTime();
      setTimeout(async () => {
        try {
          const { runFollowUpReminders } = await import('@/lib/followup-reminders');
          const result = await runFollowUpReminders();
          console.log('[followup-reminder]', JSON.stringify(result));
        } catch (err) {
          console.error('[followup-reminder] failed:', err instanceof Error ? err.message : err);
        }
        setInterval(
          async () => {
            try {
              const { runFollowUpReminders } = await import('@/lib/followup-reminders');
              const r = await runFollowUpReminders();
              console.log('[followup-reminder]', JSON.stringify(r));
            } catch (err) {
              console.error('[followup-reminder] failed:', err instanceof Error ? err.message : err);
            }
          },
          24 * 60 * 60 * 1000,
        );
      }, delay);
    };
    scheduleFollowUpReminders();

    // ─── Revenue Intelligence Engine schedulers ─────────────────────────

    // Daily health score computation — runs at 2:00 AM WAT (01:00 UTC)
    const scheduleHealthScores = () => {
      const now = new Date();
      const target = new Date(now);
      target.setUTCHours(1, 0, 0, 0); // 2:00 AM WAT = 01:00 UTC
      if (target <= now) target.setDate(target.getDate() + 1);
      const delay = target.getTime() - now.getTime();
      setTimeout(async () => {
        try {
          const { computeAllHealthScores } = await import('@/lib/intelligence/health-score');
          const result = await computeAllHealthScores();
          console.log(
            `[health-score] Computed ${result.computed} scores: ${result.healthy} healthy, ${result.atRisk} at-risk, ${result.churning} churning, ${result.critical} critical, ${result.lost} lost`,
          );
        } catch (err) {
          console.error('[health-score] failed:', err instanceof Error ? err.message : err);
        }
        setInterval(
          async () => {
            try {
              const { computeAllHealthScores } = await import('@/lib/intelligence/health-score');
              const r = await computeAllHealthScores();
              console.log(`[health-score] Computed ${r.computed} scores`);
            } catch (err) {
              console.error('[health-score] failed:', err instanceof Error ? err.message : err);
            }
          },
          24 * 60 * 60 * 1000,
        );
      }, delay);
    };
    scheduleHealthScores();

    // Revenue anomaly detection — every 6 hours
    const runAnomalyDetection = async () => {
      try {
        const { detectRevenueAnomalies } = await import('@/lib/intelligence/anomaly-detection');
        const result = await detectRevenueAnomalies();
        if (result.detected > 0) {
          console.log(`[anomaly-detection] Found ${result.detected} anomalies: ${result.critical} critical, ${result.warning} warning`);
        }
      } catch (err) {
        console.error('[anomaly-detection] failed:', err instanceof Error ? err.message : err);
      }
    };
    setTimeout(runAnomalyDetection, 5 * 60 * 1000); // first run after 5 minutes
    setInterval(runAnomalyDetection, 6 * 60 * 60 * 1000); // then every 6 hours

    // Upsell detection — weekly (Sundays at 3:00 AM WAT)
    const scheduleUpsellDetection = () => {
      const now = new Date();
      const target = new Date(now);
      target.setUTCHours(2, 0, 0, 0); // 3:00 AM WAT = 02:00 UTC
      // Move to next Sunday
      while (target.getDay() !== 0 || target <= now) {
        target.setDate(target.getDate() + 1);
      }
      const delay = target.getTime() - now.getTime();
      setTimeout(async () => {
        try {
          const { detectUpsellOpportunities } = await import('@/lib/intelligence/upsell-detection');
          const result = await detectUpsellOpportunities();
          console.log(
            `[upsell-detection] Found ${result.detected} opportunities: ${result.bandwidth} bandwidth, ${result.loyalty} loyalty, ${result.enterprise} enterprise, ${result.bundle} bundle`,
          );
        } catch (err) {
          console.error('[upsell-detection] failed:', err instanceof Error ? err.message : err);
        }
        setInterval(
          async () => {
            try {
              const { detectUpsellOpportunities } = await import('@/lib/intelligence/upsell-detection');
              const r = await detectUpsellOpportunities();
              console.log(`[upsell-detection] Found ${r.detected} opportunities`);
            } catch (err) {
              console.error('[upsell-detection] failed:', err instanceof Error ? err.message : err);
            }
          },
          7 * 24 * 60 * 60 * 1000,
        );
      }, delay);
    };
    scheduleUpsellDetection();
  }
}

export const onRequestError = captureRequestError;
