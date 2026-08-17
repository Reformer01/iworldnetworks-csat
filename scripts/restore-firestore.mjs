#!/usr/bin/env node
/**
 * Firestore Restore Script + Runbook
 *
 * Restores a backup directory (produced by scripts/backup-firestore.mjs) back
 * into Firestore. Each collection file is an array of {id, ...data} docs.
 *
 * Usage:
 *   node scripts/restore-firestore.mjs --dry-run --from=backups/2026-08-09T02-00-00
 *   node scripts/restore-firestore.mjs --from=backups/2026-08-09T02-00-00 --confirm=RESTORE-<PROJECT_ID>
 *
 * SAFETY:
 *   1. --dry-run is strongly recommended first: it prints counts and stops.
 *   2. A typed confirmation token is REQUIRED: --confirm=RESTORE-<PROJECT_ID>
 *      matching the CURRENT target project (the project the admin SDK is
 *      pointing at), NOT the backup's origin.
 *   3. Restoring into a project whose id contains "prod" (or FIREBASE_ENV=
 *      production) requires an additional --allow-prod flag.
 *   4. The backup's manifest projectId must match the target project unless
 *      --allow-project-mismatch is passed. Restoring across projects is
 *      almost always a mistake.
 *   5. Restore REPLACES documents at the backed-up doc ids (set, not merge).
 *
 * RUNBOOK (recovery from data loss / accidental wipe):
 *   1. STOP writes: deploy is not needed — just stop imports/syncs briefly
 *      (or accept last-write-wins on the affected collections only).
 *   2. Pick the newest backup before the incident:
 *        ls -t backups | head
 *        node scripts/restore-firestore.mjs --dry-run --from=backups/<dir>
 *   3. Restore only the collections that lost data:
 *        node scripts/restore-firestore.mjs --from=backups/<dir> --collections=bts_audit_records,bts_latest_audit,bts_customers --confirm=RESTORE-<PROJECT_ID>
 *   4. Verify: open the admin pages for the restored collections and check
 *      counts against the backup's manifest.json.
 *   5. If a partial import caused the loss (see mutations_journal for stale
 *      "pending" entries), fix the import logic FIRST, then restore, so a
 *      running sync doesn't immediately re-break the data.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';

for (const envFile of ['.env.local', '.env']) {
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile, override: false });
  }
}

const BATCH_SIZE = 450;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const allowProd = process.argv.includes('--allow-prod');
  const allowMismatch = process.argv.includes('--allow-project-mismatch');
  const fromArg = process.argv.find((a) => a.startsWith('--from='));
  const confirmArg = process.argv.find((a) => a.startsWith('--confirm='));
  const confirmToken = confirmArg ? confirmArg.slice('--confirm='.length) : '';
  const collectionsArg = process.argv.find((a) => a.startsWith('--collections='));
  const onlyCollections = collectionsArg ? collectionsArg.slice('--collections='.length).split(',').filter(Boolean) : null;

  if (!fromArg) {
    console.error('⛔ Missing --from=<backup-dir> (e.g. --from=backups/2026-08-09T02-00-00)');
    process.exit(1);
  }
  const backupDir = fromArg.slice('--from='.length);
  if (!existsSync(join(backupDir, 'manifest.json'))) {
    console.error(`⛔ ${backupDir} does not look like a backup dir (no manifest.json)`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf-8'));

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

  console.log('♻️  Firestore Restore');
  console.log(`   Backup from project: ${manifest.projectId}`);
  console.log(`   Restore into project: ${projectId}`);
  if (dryRun) console.log('   DRY RUN — nothing will be written');

  // ---- SAFETY GATE 1: confirmation token must match the TARGET project ----
  const expectedToken = `RESTORE-${projectId}`;
  if (!dryRun && confirmToken !== expectedToken) {
    console.error('⛔ Refusing to restore.');
    console.error(`   Target project: ${projectId}`);
    console.error(`   Pass --confirm=${expectedToken} to confirm you really mean it.`);
    process.exit(1);
  }

  // ---- SAFETY GATE 2: production projects require an explicit override ----
  const envName = (process.env.FIREBASE_ENV || '').toLowerCase();
  const looksLikeProd = projectId.includes('prod') || envName === 'production';
  if (!dryRun && looksLikeProd && !allowProd) {
    console.error('⛔ Refusing to restore into what looks like a PRODUCTION project.');
    console.error(`   Project: ${projectId} | FIREBASE_ENV: ${envName || '(unset)'}`);
    console.error('   If you truly intend this, re-run with --allow-prod.');
    process.exit(1);
  }

  // ---- SAFETY GATE 3: backup origin must match the target project ----
  if (!dryRun && !allowMismatch && manifest.projectId !== projectId) {
    console.error('⛔ Backup was taken from a DIFFERENT project.');
    console.error(`   Backup project: ${manifest.projectId}`);
    console.error(`   Target project: ${projectId}`);
    console.error('   If you really want to cross-restore, re-run with --allow-project-mismatch.');
    process.exit(1);
  }

  // ---- Collect the files to restore ----
  const files = readdirSync(backupDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json').sort();
  const targets = onlyCollections ? files.filter((f) => onlyCollections.includes(f.slice(0, -5))) : files;

  let totalDocs = 0;
  for (const file of targets) {
    const collection = file.slice(0, -5);
    const docs = JSON.parse(readFileSync(join(backupDir, file), 'utf-8'));
    totalDocs += docs.length;

    if (dryRun) {
      console.log(`  ${collection}: ${docs.length} docs (would restore)`);
      continue;
    }

    console.log(`  ${collection}: restoring ${docs.length} docs...`);
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const doc of docs.slice(i, i + BATCH_SIZE)) {
        const ref = db.collection(collection).doc(String(doc.id));
        const { id: _id, ...data } = doc;
        batch.set(ref, data);
      }
      await batch.commit();
    }
  }

  console.log('');
  if (dryRun) {
    console.log(`📋 Would restore ${totalDocs} docs from ${targets.length} collections (dry run — no changes made).`);
  } else {
    console.log(`✅ Restored ${totalDocs} docs across ${targets.length} collections.`);
    console.log('   Verify counts against the backup manifest, then resume syncs/imports.');
  }
}

main().catch((err) => {
  console.error('❌ Restore failed:', err.message || err);
  process.exit(1);
});
