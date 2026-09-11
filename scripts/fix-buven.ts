/**
 * Re-file Buven Communications FieldSupport feedback as Installation
 * with all ratings at 5 stars (customer submitted via the wrong form).
 * Usage: npx tsx scripts/fix-buven.ts
 */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

const DOC_ID = 'ftX8mFN8qVZkmbcFJgrT';

async function main() {
  const { getAdminFirestore } = await import('../src/lib/firebase-admin');
  const db = getAdminFirestore();
  const ref = db.collection('feedbacks').doc(DOC_ID);
  const doc = await ref.get();
  if (!doc.exists) throw new Error(`doc ${DOC_ID} not found`);

  await ref.update({
    category: 'Installation',
    ratings: { overall: 5, quality: 5, timeliness: 5 },
    // comment stays '' — no additional notes per instruction
    updatedAt: new Date().toISOString(),
  });

  const after = await ref.get();
  const d = after.data();
  console.log('updated:', after.id);
  console.log(JSON.stringify({ category: d?.category, ratings: d?.ratings, staffName: d?.staffName, comment: d?.comment }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
