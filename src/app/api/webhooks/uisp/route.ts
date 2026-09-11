import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError, logInfo } from '@/lib/logger';
import { mapSiteRow, recomputeBtsForNode } from '@/lib/uisp-sync';
import { isExcludedUispSiteEvent } from '@/lib/uisp-exclusions';
import { runMatching } from '@/lib/matching/runMatching';
import type { UispSite } from '@/lib/uisp-api';

// Inbound UISP webhook (Leaf B). UISP pushes site events (create/update/
// delete) in near-real-time; the 10-min poll stays as the backstop.
//
// Auth: shared secret in `x-auth-token` (UISP webhook convention) or
// `Authorization: Bearer <token>`, compared against UISP_WEBHOOK_SECRET.
// Idempotency: UispWebhookEvent is keyed by the UISP event id — a duplicate
// delivery short-circuits before any processing. Processing is one site
// upsert + a targeted BTS recompute, done inline; runMatching() is
// fire-and-forget so webhook latency stays low. Failures leave processedAt
// null so a replay of the same event id retries.

// SAFETY: the generated Prisma client predates Leaf B's schema additions
// (UispWebhookEvent, UispSite contact columns); casts are removable once
// `prisma generate` has run with the current schema.
interface WebhookEventRow {
  processedAt: bigint | null;
}

const webhookEvents = (
  prisma as unknown as {
    uispWebhookEvent: {
      upsert(args: { where: { id: string }; update: unknown; create: unknown }): Promise<WebhookEventRow>;
      update(args: { where: { id: string }; data: unknown }): Promise<WebhookEventRow>;
    };
  }
).uispWebhookEvent;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** First candidate that looks like a UISP site object (has identification.id). */
function findSiteObject(...candidates: unknown[]): Record<string, unknown> | null {
  for (const c of candidates) {
    const rec = asRecord(c);
    const identification = asRecord(rec?.identification);
    if (identification && typeof identification.id === 'string') return rec;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.UISP_WEBHOOK_SECRET;
  if (!secret) {
    // Never accept unauthenticated webhooks: unset secret is a deployment
    // misconfiguration, not a pass.
    logError('[uisp-webhook] rejected: UISP_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const token =
    request.headers.get('x-auth-token') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // UISP sends `{event: {id, type, data}, ...}`; accept a bare `{id, type}` too.
  const payload = asRecord(body);
  const eventObj = asRecord(payload?.event);
  const eventId = str(eventObj?.id) ?? str(payload?.id);
  const eventType = str(eventObj?.type) ?? str(payload?.type);
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  // Idempotency key = UISP event id. The upsert never touches an existing row
  // here: processedAt set => duplicate delivery; processedAt null => in-flight
  // or previously failed (retry). create leaves processedAt null until the
  // processing below succeeds.
  const row = await webhookEvents.upsert({
    where: { id: eventId },
    update: {},
    create: { id: eventId, eventType, payload: body, processedAt: null, error: null, createdAt: Date.now() },
  });
  if (row.processedAt !== null) {
    logInfo('[uisp-webhook] duplicate event', { eventId });
    return NextResponse.json({ status: 'duplicate' });
  }

  try {
    const now = Date.now();
    const site = findSiteObject(asRecord(eventObj?.data), asRecord(payload?.data), eventObj, payload);
    const isDelete = eventType?.includes('delete') || eventType?.includes('remove');

    if (site) {
      const siteId = String((site.identification as Record<string, unknown>).id);
      if (isDelete) {
        // Site gone from UISP: drop the row; matching reverts affected
        // customers to pending. Missing row (already swept) is fine.
        await prisma.uispSite.delete({ where: { id: siteId } }).catch(() => undefined);
      } else if (isExcludedUispSiteEvent(site as unknown as UispSite)) {
        // Keep an excluded BTS from being recreated by a near-real-time
        // update between two full UISP polling cycles.
        await prisma.uispSite.delete({ where: { id: siteId } }).catch(() => undefined);
      } else {
        const data = mapSiteRow(site as unknown as UispSite);
        // lastSyncAt=Date.now() so the next poll's stale sweep (lastSyncAt !=
        // its run timestamp) does not delete this freshly-webhooked row.
        await prisma.uispSite.upsert({
          where: { id: siteId },
          update: { ...data, lastSyncAt: BigInt(now) } as never,
          create: { id: siteId, ...data, lastSyncAt: BigInt(now) } as never,
        });
      }
      // A parent change cascades down the subtree; for deletes the node is
      // gone, so only its descendants get re-attributed.
      await recomputeBtsForNode(siteId);
    }
    // No site object (device event, ping, unrelated type): nothing to mirror,
    // still recorded as processed.

    await webhookEvents.update({
      where: { id: eventId },
      data: { processedAt: BigInt(now), error: null },
    });

    // Rematch on the next tick — never block the webhook response on it.
    runMatching().catch((err: unknown) => {
      logError('[uisp-webhook] matching failed', { eventId, error: err instanceof Error ? err.message : String(err) });
    });

    logInfo('[uisp-webhook] processed', { eventId, eventType });
    return NextResponse.json({ status: 'processed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('[uisp-webhook] processing failed', { eventId, error: message });
    // Leave processedAt null so a replay of the same event id retries. Still
    // respond 200 so UISP does not retry-loop on our bugs.
    await webhookEvents
      .update({ where: { id: eventId }, data: { processedAt: null, error: message } })
      .catch(() => undefined);
    return NextResponse.json({ status: 'error', error: message });
  }
}
