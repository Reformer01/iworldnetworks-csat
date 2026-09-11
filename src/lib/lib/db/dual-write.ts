import { logWarn } from '@/lib/logger';
import { createFeedback, updateFeedback, deleteFeedback } from '@/lib/lib/db/feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';

// Best-effort MariaDB mirrors of Firestore writes. During the strangler-fig
// transition, Firestore stays the source of truth; the DB write must never
// fail the request, so every mirror is wrapped in try/catch + logWarn.
// Mirrors are gated by a dedicated WRITE flag (separate from the read flag),
// so dual-write can be enabled and monitored before reads flip to MariaDB.

const enabled = process.env.FEEDBACKS_DB_WRITE === '1';

export async function mirrorCreateFeedback(data: Partial<FeedbackDoc> & { id: string }): Promise<void> {
  if (!enabled) return;
  try {
    await createFeedback(data);
  } catch (e) {
    logWarn('[dual-write] MariaDB feedback create failed', { id: data.id, error: String(e) });
  }
}

export async function mirrorUpdateFeedback(id: string, data: Partial<FeedbackDoc>): Promise<void> {
  if (!enabled) return;
  try {
    await updateFeedback(id, data);
  } catch (e) {
    logWarn('[dual-write] MariaDB feedback update failed', { id, error: String(e) });
  }
}

export async function mirrorDeleteFeedback(id: string): Promise<void> {
  if (!enabled) return;
  try {
    await deleteFeedback(id);
  } catch (e) {
    logWarn('[dual-write] MariaDB feedback delete failed', { id, error: String(e) });
  }
}
