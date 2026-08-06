/**
 * Remove a BTS CSV import batch from Firestore.
 * Run with: node scripts/remove-bts-batch.js <batchId> [batchId...]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function initFirebase() {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    let raw = serviceAccountJson.trim();
    if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
      raw = raw.slice(1, -1);
    }
    const serviceAccount = JSON.parse(raw);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({
      credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    });
  }

  try {
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  } catch (e) {
    console.error('Failed to initialize Firebase Admin.');
    console.error('Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(1);
  }
}

async function deleteCollectionWhere(db, collection, batchId) {
  let deleted = 0;
  for (let pass = 0; pass < 100; pass++) {
    const snap = await db
      .collection(collection)
      .where('importBatchId', '==', batchId)
      .limit(500)
      .get();
    if (snap.size === 0) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 500) break;
  }
  return deleted;
}

async function main() {
  const batchIds = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (batchIds.length === 0) {
    console.error('Usage: node scripts/remove-bts-batch.js <batchId> [batchId...]');
    process.exit(1);
  }

  const app = initFirebase();
  const db = getFirestore(app);

  for (const batchId of batchIds) {
    const customers = await deleteCollectionWhere(db, 'bts_customers', batchId);
    const sites = await deleteCollectionWhere(db, 'bts_customer_sites', batchId);
    console.log(`Removed ${customers} customers + ${sites} site summaries for ${batchId}`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});