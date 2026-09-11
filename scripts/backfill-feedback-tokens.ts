/**
 * Re-backfill Firestore feedback_tokens -> MariaDB FeedbackToken.
 *
 * Why: the original backfill ran while `eventHash` had a UNIQUE index, so
 * only the first overdue token (eventHash '') could be mirrored. The index
 * is now dropped (20260814100000_drop_feedback_token_eventhash_unique), so
 * this script restores full parity: every Firestore token is upserted by id
 * (idempotent — existing rows are updated with identical values).
 *
 * Unlike migrate-firestore-to-mysql.ts, `eventHash` is preserved exactly
 * ('' stays '', not null) to match what the live overdue mirror writes.
 *
 * Run (server):
 *   npx tsx scripts/backfill-feedback-tokens.ts
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnv() {
  for (const file of ['.env.production', '.env']) {
    try {
      const raw = readFileSync(join(process.cwd(), file), 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
      }
      console.log(`Loaded env from ${file}`);
      return;
    } catch {
      // try next file
    }
  }
  console.log('No .env / .env.production found; relying on process env.');
}

loadEnv();

const adapter = new PrismaMariaDb(process.env.DATABASE_URL ?? '');
const prisma = new PrismaClient({ adapter });

if (!getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set in environment');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(serviceAccountJson.trim())) });
}

const db = getFirestore();

const BATCH_SIZE = 200;
const DELAY_BETWEEN_BATCHES_MS = 2000;
const MAX_RETRIES = 5;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e?.code === 8 && retries > 0) {
      const delay = (MAX_RETRIES - retries + 1) * 10000;
      console.log(`  Quota hit, retrying in ${delay / 1000}s... (${retries} retries left)`);
      await sleep(delay);
      return withRetry(fn, retries - 1);
    }
    throw e;
  }
}

const bn = (v: any): bigint | null => (v === undefined || v === null ? null : BigInt(v));
const bnOr = (v: any, fallback: number): bigint => {
  const b = bn(v);
  return b === null ? BigInt(fallback) : b;
};
const str = (v: any): string | null => (v === undefined || v === null ? null : String(v));

async function main() {
  console.log('Starting feedback_tokens re-backfill...');
  const now = Date.now();
  let success = 0;
  let failed = 0;
  let total = 0;

  let lastDoc: any = null;
  let hasMore = true;

  while (hasMore) {
    let query = db.collection('feedback_tokens').limit(BATCH_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await withRetry(() => query.get());
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    for (const doc of snapshot.docs) {
      const d = doc.data();
      try {
        await prisma.feedbackToken.upsert({
          where: { id: doc.id },
          create: {
            id: doc.id,
            customerName: str(d.customerName) ?? '',
            customerEmail: str(d.customerEmail) ?? '',
            servicePlan: str(d.servicePlan) ?? '',
            location: str(d.location) ?? '',
            serviceDate: str(d.serviceDate) ?? '',
            sourceEvent: str(d.sourceEvent) ?? '',
            // Preserve '' exactly (overdue tokens) — the column is no longer unique.
            eventHash: d.eventHash === undefined || d.eventHash === null ? null : String(d.eventHash),
            category: str(d.category) ?? 'Reliability',
            staffName: str(d.staffName),
            used: d.used ?? false,
            createdAt: bnOr(d.createdAt, now),
            expiresAt: bnOr(d.expiresAt, now + 7 * 24 * 60 * 60 * 1000),
            openedAt: bn(d.openedAt),
            submittedAt: bn(d.submittedAt),
          },
          update: {
            customerName: str(d.customerName) ?? '',
            customerEmail: str(d.customerEmail) ?? '',
            servicePlan: str(d.servicePlan) ?? '',
            location: str(d.location) ?? '',
            serviceDate: str(d.serviceDate) ?? '',
            sourceEvent: str(d.sourceEvent) ?? '',
            eventHash: d.eventHash === undefined || d.eventHash === null ? null : String(d.eventHash),
            category: str(d.category) ?? 'Reliability',
            staffName: str(d.staffName),
            used: d.used ?? false,
            createdAt: bnOr(d.createdAt, now),
            expiresAt: bnOr(d.expiresAt, now + 7 * 24 * 60 * 60 * 1000),
            openedAt: bn(d.openedAt),
            submittedAt: bn(d.submittedAt),
          },
        });
        success++;
      } catch (e: any) {
        console.error(`  x ${doc.id}:`, (e as Error).message);
        failed++;
      }
      total++;
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    hasMore = snapshot.docs.length === BATCH_SIZE;
    if (hasMore) {
      console.log(`  Fetched ${total} documents so far, sleeping ${DELAY_BETWEEN_BATCHES_MS}ms...`);
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`\n=== feedback_tokens: ${success} upserted, ${failed} failed, ${total} total ===`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});