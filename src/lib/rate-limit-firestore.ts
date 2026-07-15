import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || '127.0.0.1';
}

function docId(ip: string, path: string): string {
  return createHash('sha256').update(`${ip}:${path}`).digest('hex').slice(0, 32);
}

/**
 * Firestore-based sliding window rate limiter.
 * Persists across server restarts. Self-cleaning via TTL field.
 * Returns true if the request is rate-limited, false if allowed.
 */
export async function isRateLimitedFirestore(req: NextRequest, limit: number, windowMs: number): Promise<boolean> {
  try {
    const ip = getClientIp(req);
    const path = req.nextUrl.pathname;
    const id = docId(ip, path);
    const now = Date.now();

    const db = getAdminFirestore();
    const ref = db.collection('rate_limits').doc(id);

    const result = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);

      if (!doc.exists) {
        tx.set(ref, {
          count: 1,
          windowStart: now,
          ttl: now + windowMs * 2,
        });
        return false;
      }

      const data = doc.data()!;
      const windowStart = data.windowStart as number;
      const count = data.count as number;

      if (now - windowStart > windowMs) {
        tx.set(ref, {
          count: 1,
          windowStart: now,
          ttl: now + windowMs * 2,
        });
        return false;
      }

      if (count >= limit) {
        return true;
      }

      tx.update(ref, {
        count: FieldValue.increment(1),
        ttl: now + windowMs * 2,
      });
      return false;
    });

    return result;
  } catch {
    return false;
  }
}
