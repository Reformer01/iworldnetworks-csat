import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { logWarn } from '@/lib/logger';

export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getFeedbackBaseUrl(request: NextRequest): string {
  return process.env.FEEDBACK_BASE_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export interface CreateTokenData {
  customerName: string;
  customerEmail: string;
  servicePlan?: string;
  location?: string;
  serviceDate?: string;
  category?: string;
  staffName?: string;
  sourceEvent?: string;
  eventHash?: string;
}

/**
 * Feedback tokens: MariaDB-first (FeedbackToken). The Firestore doc is a
 * best-effort mirror kept for the transition — DB writes never depend on it.
 * The `db` parameter is retained for callers that previously passed it; it is
 * only used for the optional Firestore mirror.
 */
export async function createFeedbackToken(db: Firestore | null, data: CreateTokenData): Promise<{ token: string; expiresAt: number }> {
  const token = randomUUID();
  const expiresAt = Date.now() + TOKEN_TTL_MS;

  await prisma.feedbackToken.create({
    data: {
      id: token,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: data.servicePlan || '',
      location: data.location || '',
      serviceDate: data.serviceDate || '',
      sourceEvent: data.sourceEvent || '',
      // null when no hash is provided (overdue tokens carry their identity in
      // sourceEvent; eventHash is not unique since overdue tokens share '').
      eventHash: data.eventHash || null,
      category: data.category || '',
      staffName: data.staffName || '',
      used: false,
      createdAt: BigInt(Date.now()),
      expiresAt: BigInt(expiresAt),
      openedAt: null,
      submittedAt: null,
    },
  });

  if (db) {
    try {
      await db
        .collection('feedback_tokens')
        .doc(token)
        .set({
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          servicePlan: data.servicePlan || '',
          location: data.location || '',
          serviceDate: data.serviceDate || '',
          sourceEvent: data.sourceEvent || '',
          eventHash: data.eventHash || '',
          category: data.category || '',
          staffName: data.staffName || '',
          used: false,
          createdAt: Date.now(),
          expiresAt,
          openedAt: null,
          submittedAt: null,
        });
    } catch (mirrorErr) {
      logWarn('[feedback-token] Firestore mirror failed (best-effort)', {
        error: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
      });
    }
  }

  return { token, expiresAt };
}

export async function findFeedbackTokenByEventHash(eventHash: string): Promise<{ token: string; expiresAt: number } | null> {
  if (!eventHash) return null;

  try {
    // eventHash is not unique — pick the most recent matching token.
    const row = await prisma.feedbackToken.findFirst({ where: { eventHash }, orderBy: { createdAt: 'desc' } });
    if (row) return { token: row.id, expiresAt: Number(row.expiresAt) };
  } catch (err) {
    logWarn('[feedback-token] DB eventHash lookup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // No Firestore fallback read: all historical tokens were backfilled to
  // MariaDB (scripts/backfill-feedback-tokens.ts), so a DB miss means the
  // event is genuinely new — the caller creates a fresh token.
  return null;
}

/**
 * Find a recent feedback token for the same customer and event type.
 * Used for webhook deduplication: prevents sending multiple feedback emails
 * for the same customer/event within the deduplication window (default 24h).
 */
export async function findRecentFeedbackToken(
  customerEmail: string,
  sourceEvent: string,
  windowMs = 24 * 60 * 60 * 1000,
): Promise<{ token: string; expiresAt: number } | null> {
  if (!customerEmail || !sourceEvent) return null;

  const since = BigInt(Date.now() - windowMs);
  try {
    const row = await prisma.feedbackToken.findFirst({
      where: {
        customerEmail,
        sourceEvent,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (row) return { token: row.id, expiresAt: Number(row.expiresAt) };
  } catch (err) {
    logWarn('[feedback-token] DB recent token lookup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return null;
}
