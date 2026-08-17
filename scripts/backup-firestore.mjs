#!/usr/bin/env node
/**
 * Firestore Backup Script
 *
 * Dumps every collection in the project to backups/<timestamp>/<collection>.json
 * (NDJSON-style array of {id, data}), writes a manifest, and prunes old
 * backups. Designed to run from cron on the server or on demand from a dev
 * machine:
 *
 *   node scripts/backup-firestore.mjs                 # full backup
 *   node scripts/backup-firestore.mjs --dry-run       # show what would happen
 *   node scripts/backup-firestore.mjs --keep=30       # retain 30 backups
 *   node scripts/backup-firestore.mjs --collections=tickets,feedbacks
 *
 * Server cron (extends /home/backup-csat.sh):
 *   0 2 * * * cd /home/your-app && FIREBASE_SERVICE_ACCOUNT_JSON="$(cat /path/service-account.json)" node scripts/backup-firestore.mjs >> /var/log/csat-backup.log 2>&1
 *
 * SAFETY: this script is READ-ONLY against Firestore. It never writes to the
 * database. A --keep retention only deletes LOCAL backup files.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadDotenv } from 'dotenv';

for (const envFile of ['.env.local', '.env']) {
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile, override: false });
  }
}

const BACKUP_ROOT = 'backups';
const BATCH_SIZE = 450;
const DEFAULT_KEEP = 14;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const keepArg = process.argv.find((a) => a.startsWith('--keep='));
  const keep = keepArg ? parseInt(keepArg.slice('--keep='.length), 10) : DEFAULT_KEEP;
  const collectionsArg = process.argv.find((a) => a.startsWith('--collections='));
  const onlyCollections = collectionsArg ? collectionsArg.slice('--collections='.length).split(',').filter(Boolean) : null;

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

  console.log('💾 Firestore Backup');
  console.log(`   Project: ${projectId}`);
  if (dryRun) console.log('   DRY RUN — nothing will be written');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(BACKUP_ROOT, timestamp);
  if (!dryRun) mkdirSync(backupDir, { recursive: true });

  // Discover collections (optionally filtered).
  let collections = (await db.listCollections()).map((c) => c.id);
  if (onlyCollections) {
    collections = collections.filter((c) => onlyCollections.includes(c));
  }
  collections.sort();

  const summary = [];
  let totalDocs = 0;

  for (const name of collections) {
    let count = 0;
    const docs = [];
    let lastDoc = null;

    // Paginate with orderBy(__name__) to survive large collections.
    for (;;) {
      let query = db.collection(name).orderBy('__name__').limit(2000);
      if (lastDoc) query = query.startAfter(lastDoc);
      const snapshot = await query.get();
      if (snapshot.empty) break;
      for (const doc of snapshot.docs) {
        docs.push({ id: doc.id, ...doc.data() });
      }
      count += snapshot.size;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.size < 2000) break;
    }

    summary.push({ collection: name, count });
    totalDocs += count;
    console.log(`  ${name}: ${count} docs`);

    if (!dryRun && count > 0) {
      const file = join(backupDir, `${name}.json`);
      writeFileSync(file, JSON.stringify(docs));
    } else if (!dryRun) {
      writeFileSync(join(backupDir, `${name}.json`), '[]');
    }
  }

  // Manifest (progressive: written last here; wipe-data uses a pre-wipe one).
  const manifest = {
    createdAt: new Date().toISOString(),
    projectId,
    tool: 'backup-firestore.mjs',
    collections: summary,
    totalDocs,
    retentionKeep: keep,
  };

  if (!dryRun) {
    writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    writeFileSync(join(BACKUP_ROOT, `backup-manifest-${projectId}-latest.json`), JSON.stringify(manifest, null, 2));
  }

  // ---- Retention: prune oldest backup directories beyond `keep` ----
  if (!dryRun) {
    const dirs = readdirSync(BACKUP_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(d.name))
      .map((d) => ({ name: d.name, mtime: statSync(join(BACKUP_ROOT, d.name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    const toRemove = dirs.slice(keep);
    for (const dir of toRemove) {
      rmSync(join(BACKUP_ROOT, dir.name), { recursive: true, force: true });
      console.log(`  🗑  pruned ${dir.name}`);
    }
    console.log(`   Retention: keeping newest ${dirs.length - toRemove.length}/${dirs.length} backups`);
  }

  console.log('');
  console.log(dryRun ? `📋 Would back up ${totalDocs} docs across ${collections.length} collections` : `✅ Backed up ${totalDocs} docs across ${collections.length} collections`);
  if (!dryRun) console.log(`   Location: ${backupDir}`);
}

main().catch((err) => {
  console.error('❌ Backup failed:', err.message || err);
  process.exit(1);
});
