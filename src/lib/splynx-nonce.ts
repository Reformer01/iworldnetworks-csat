import { prisma } from './prisma';
import { getAdminFirestore } from './firebase-admin';
import { logWarn } from './logger';

/**
 * Splynx request nonce (was Firestore: splynx_nonces).
 * MariaDB-first; falls back to Firestore when the DB write is unavailable.
 * The backfill seeds the DB counter from Firestore so the sequence stays
 * monotonic across the cutover.
 */

const COLLECTION = 'splynx_nonces';

export async function getNonce(key: string): Promise<number> {
  try {
    const row = await prisma.splynxNonce.findUnique({ where: { key } });
    if (row) return row.nonce;
  } catch {
    // fall through to Firestore
  }
  try {
    const db = getAdminFirestore();
    const snap = await db.collection(COLLECTION).doc(key).get();
    if (!snap.exists) return 0;
    const data = snap.data();
    return data && typeof data.nonce === 'number' ? data.nonce : 0;
  } catch (err) {
    logWarn('[splynx-nonce] getNonce failed', { key, error: String(err) });
    return 0;
  }
}

export async function setNonce(key: string, nonce: number): Promise<void> {
  try {
    await prisma.splynxNonce.upsert({
      where: { key },
      update: { nonce, updatedAt: BigInt(Date.now()) },
      create: { key, nonce, updatedAt: BigInt(Date.now()) },
    });
  } catch {
    try {
      const db = getAdminFirestore();
      await db.collection(COLLECTION).doc(key).set({ nonce }, { merge: true });
    } catch (err) {
      logWarn('[splynx-nonce] setNonce failed', { key, error: String(err) });
    }
  }
}

export async function incrementNonce(key: string): Promise<number> {
  try {
    const row = await prisma.splynxNonce.upsert({
      where: { key },
      update: { nonce: { increment: 1 }, updatedAt: BigInt(Date.now()) },
      create: { key, nonce: 1, updatedAt: BigInt(Date.now()) },
    });
    return Number(row.nonce);
  } catch {
    try {
      const db = getAdminFirestore();
      const ref = db.collection(COLLECTION).doc(key);
      const res = await db.runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        const current = doc.exists && typeof doc.data()?.nonce === 'number' ? doc.data()!.nonce : 0;
        const next = current + 1;
        tx.set(ref, { nonce: next }, { merge: true });
        return next;
      });
      return res;
    } catch (err) {
      logWarn('[splynx-nonce] incrementNonce failed', { key, error: String(err) });
      throw err;
    }
  }
}

export default {
  getNonce,
  setNonce,
  incrementNonce,
};