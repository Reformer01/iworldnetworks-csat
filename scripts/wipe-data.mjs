#!/usr/bin/env node
/**
 * Wipe Data Script
 *
 * Deletes ALL mock/test/demo data from Firestore so the platform can start
 * with a clean slate. Reference data (staff, complaint types, SLA definitions,
 * ticket statuses/priorities/channels) is KEPT — those are real configuration
 * and can be re-seeded with scripts/seed-staff.js and seed-ticket-types.js.
 *
 * Collections wiped:
 *   - bts_audit_records, bts_latest_audit   (audits)
 *   - bts_customers, bts_customer_sites     (BTS CSV imports)
 *   - sales_records, sales_targets          (sales)
 *   - tickets                               (support tickets)
 *   - feedbacks, feedback_tokens            (feedback)
 *   - support_revenue                       (support projects)
 *   - sales_imports, sales_audit_log        (imports/audit trail)
 *   - staff_kpi_snapshots, staff_kpi_records, support_staff_kpis
 *   - splynx_bts_sync, splynx_bts_active_stats
 *   - seed_meta                             (seed markers)
 *
 * Usage:
 *   node scripts/wipe-data.mjs               # wipe everything listed above
 *   node scripts/wipe-data.mjs --dry-run     # show counts only, delete nothing
 */

import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';

for (const envFile of ['.env.local', '.env']) {
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile, override: false });
  }
}

const COLLECTIONS_TO_WIPE = [
  'bts_audit_records',
  'bts_latest_audit',
  'bts_customers',
  'bts_customer_sites',
  'sales_records',
  'sales_targets',
  'sales_imports',
  'sales_audit_log',
  'tickets',
  'feedbacks',
  'feedback_tokens',
  'support_revenue',
  'staff_kpi_snapshots',
  'staff_kpi_records',
  'support_staff_kpis',
  'splynx_bts_sync',
  'splynx_bts_active_stats',
  'seed_meta',
];

const BATCH_SIZE = 450;

async function wipeCollection(db, name, dryRun) {
  const snapshot = await db.collection(name).get();
  const count = snapshot.size;
  console.log(`  ${name}: ${count} docs`);

  if (dryRun || count === 0) return count;

  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_SIZE)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
  return count;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  let adminApp;
  if (getApps().length === 0) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const cleaned = serviceAccountJson.replace(/^["']|["']$/g, '');
      const serviceAccount = JSON.parse(cleaned);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    } else {
      adminApp = initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    }
  } else {
    adminApp = getApps()[0];
  }

  const db = getFirestore(adminApp);

  console.log('🧹 Wipe Data — Clean Slate');
  console.log(`   Firestore project: ${adminApp.options.projectId}`);
  if (dryRun) console.log('   DRY RUN — nothing will be deleted');
  console.log('');

  let total = 0;
  for (const name of COLLECTIONS_TO_WIPE) {
    total += await wipeCollection(db, name, dryRun);
  }

  console.log('');
  if (dryRun) {
    console.log(`📋 Would delete ${total} docs (dry run — no changes made).`);
  } else {
    console.log(`✅ Deleted ${total} docs.`);
    console.log('   Reference data kept: staff, complaint_types, sla_definitions,');
    console.log('   ticket_statuses, ticket_priorities, ticket_channels.');
    console.log('');
    console.log('   Next steps:');
    console.log('   - Re-import BTS customers: node scripts/import-bts-csv.js (CSVs in Downloads)');
    console.log('   - Re-seed staff/ticket types if needed: node scripts/seed-staff.js');
  }
}

main().catch((err) => {
  console.error('❌ Wipe failed:', err.message || err);
  process.exit(1);
});
