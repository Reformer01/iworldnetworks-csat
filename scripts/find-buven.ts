/**
 * Find Buven Communications feedback records (FieldSupport misfile).
 * Usage: npx tsx scripts/find-buven.ts
 */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { getAdminFirestore } = await import('../src/lib/firebase-admin');
  const db = getAdminFirestore();
  const snap = await db.collection('feedbacks')
    .where('customerName', '>=', 'Buven')
    .where('customerName', '<=', 'Buven\uf8ff')
    .get();
  snap.forEach((doc) => {
    console.log(doc.id, JSON.stringify(doc.data(), null, 1).slice(0, 600));
    console.log('---');
  });
  if (snap.empty) console.log('no Buven records found by name prefix');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
