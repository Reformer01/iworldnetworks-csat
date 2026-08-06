import { getAdminFirestore } from './firebase-admin';

const COLLECTION = 'splynx_nonces';

export async function getNonce(key: string): Promise<number> {
  const db = getAdminFirestore();
  const ref = db.collection(COLLECTION).doc(key);
  const snap = await ref.get();
  if (!snap.exists) return 0;
  const data = snap.data();
  return data && typeof data.nonce === 'number' ? data.nonce : 0;
}

export async function setNonce(key: string, nonce: number): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection(COLLECTION).doc(key);
  await ref.set({ nonce }, { merge: true });
}

export async function incrementNonce(key: string): Promise<number> {
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
}

export default {
  getNonce,
  setNonce,
  incrementNonce,
};
