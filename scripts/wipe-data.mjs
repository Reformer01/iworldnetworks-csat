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
 * SAFETY (added to prevent accidental production data loss):
 *   1. A typed confirmation token is REQUIRED. The token must include the
 *      exact target project id: --confirm=WIPE-<PROJECT_ID>
 *   2. Running against a project whose id contains "prod" (or with
 *      FIREBASE_ENV=production) requires an additional --allow-prod flag.
 *   3. A manifest of doc counts per collection is written to backups/ BEFORE
 *      anything is deleted (audit trail / first line of recovery).
 *
 * Usage:
 *   node scripts/wipe-data.mjs --dry-run
 *   node scripts/wipe-data.mjs --confirm=WIPE-<PROJECT_ID>
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

/** Writes a progressively-updated manifest so a crash mid-wipe still leaves an audit trail. */
function writeManifest(projectId, counts) {
  try {
    mkdirSync('backups', { recursive: true });
    const manifest = {
      createdAt: new Date().toISOString(),
      projectId,
      tool: 'wipe-data.mjs',
      note: 'Counts recorded at scan time (before deletion).',
      counts,
    };
    const file = `backups/wipe-manifest-${projectId}-latest.json`;
    writeFileSync(file, JSON.stringify(manifest, null, 2));
    return file;
  } catch (err) {
    console.error('   ⚠️  Could not write wipe manifest:', err.message);
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const allowProd = process.argv.includes('--allow-prod');
  const confirmArg = process.argv.find((a) => a.startsWith('--confirm='));
  const confirmToken = confirmArg ? confirmArg.slice('--confirm='.length) : '';

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
  const projectId = adminApp.options.projectId || 'unknown';

  // ---- SAFETY GATE 1: typed confirmation token must match the target project ----
  const expectedToken = `WIPE-${projectId}`;
  if (!dryRun && confirmToken !== expectedToken) {
    console.error('⛔ Refusing to wipe data.');
    console.error(`   Target project: ${projectId}`);
    console.error(`   Pass --confirm=${expectedToken} to confirm you really mean it.`);
    process.exit(1);
  }

  // ---- SAFETY GATE 2: production projects require an explicit override ----
  const envName = (process.env.FIREBASE_ENV || '').toLowerCase();
  const looksLikeProd = projectId.includes('prod') || envName === 'production';
  if (!dryRun && looksLikeProd && !allowProd) {
    console.error('⛔ Refusing to wipe what looks like a PRODUCTION project.');
    console.error(`   Project: ${projectId} | FIREBASE_ENV: ${envName || '(unset)'}`);
    console.error('   If you truly intend this, re-run with --allow-prod.');
    process.exit(1);
  }

  console.log('🧹 Wipe Data — Clean Slate');
  console.log(`   Firestore project: ${projectId}`);
  if (dryRun) console.log('   DRY RUN — nothing will be deleted');
  if (!dryRun) console.log('   ⚠️  REAL WIPE — confirmation token accepted');
  console.log('');

  // ---- SAFETY GATE 3: record counts before deleting, persist manifest ----
  const counts = [];
  let total = 0;
  let manifestFile = null;
  for (const name of COLLECTIONS_TO_WIPE) {
    const snapshot = await db.collection(name).get();
    const count = snapshot.size;
    counts.push({ collection: name, count });
    console.log(`  ${name}: ${count} docs`);
    total += count;

    if (!dryRun && count > 0) {
      const docs = snapshot.docs;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of docs.slice(i, i + BATCH_SIZE)) {
          batch.delete(doc.ref);
        }
        await batch.commit();
      }
      manifestFile = writeManifest(projectId, counts);
    }
  }

  console.log('');
  if (dryRun) {
    console.log(`📋 Would delete ${total} docs (dry run — no changes made).`);
  } else {
    if (manifestFile) console.log(`   Manifest written: ${manifestFile}`);
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
