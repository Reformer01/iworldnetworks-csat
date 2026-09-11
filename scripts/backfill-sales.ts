/**
 * Backfill Firestore sales data -> MariaDB:
 *   - sales_records   -> SalesRecordEntry
 *   - sales_targets   -> SalesTarget
 *   - sales_imports   -> SalesImport
 *
 * Idempotent: rows are upserted by their Firestore doc id, so re-running is
 * safe (existing rows are overwritten with identical values).
 *
 * The Firestore source is read-only — nothing is deleted or modified there.
 *
 * NOTE: needs Firestore read quota. If the daily read quota is exhausted
 * (RESOURCE_EXHAUSTED), run after midnight UTC.
 *
 * Run (server, inside /home/csat.iwn.ng):
 *   npx tsx scripts/backfill-sales.ts
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnv() {
  for (const file of ['.env.production', '.env']) {
    try {
      const raw = readFileSync(join(process.cwd(), file), 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
      }
      console.log(`Loaded env from ${file}`);
      return;
    } catch {
      // try next file
    }
  }
  console.log('No .env / .env.production found; relying on process env.');
}

loadEnv();

const adapter = new PrismaMariaDb(process.env.DATABASE_URL ?? '');
const prisma = new PrismaClient({ adapter });

if (!getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set in environment');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(serviceAccountJson.trim())) });
}

const db = getFirestore();

const toNum = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : v != null ? Number(v) : undefined;

const toBig = (v: unknown): bigint | null | undefined => {
  const n = toNum(v);
  return n != null ? BigInt(n) : undefined;
};

/** Collect ALL docs from a collection (handles >300-doc pagination). */
async function getAllDocs(collection: string): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const out: Array<{ id: string; data: Record<string, unknown> }> = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  const pageSize = 300;
  while (true) {
    let q = db.collection(collection).orderBy('__name__').limit(pageSize);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      out.push({ id: doc.id, data: doc.data() });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
  return out;
}

async function backfillSalesRecords(): Promise<number> {
  const docs = await getAllDocs('sales_records');
  let upserted = 0;
  for (const { id, data } of docs) {
    const region = String(data.region || '');
    const segment = String(data.segment || '');
    const quarter = String(data.quarter || '');
    await prisma.salesRecordEntry.upsert({
      where: { id },
      create: {
        id,
        serialNumber: Number(data.serialNumber ?? 0),
        customerName: String(data.customerName ?? ''),
        location: String(data.location ?? ''),
        region,
        segment,
        nrc: Number(data.nrc ?? 0),
        mrc: Number(data.mrc ?? 0),
        planCode: String(data.planCode ?? ''),
        saleDate: String(data.saleDate ?? ''),
        quarter,
        month: String(data.month ?? ''),
        packageType: String(data.packageType ?? 'Outright'),
        salesAgent: String(data.salesAgent ?? ''),
        meansOfSale: String(data.meansOfSale ?? ''),
        accountStatus: String(data.accountStatus ?? 'Active'),
        statusNotes: String(data.statusNotes ?? ''),
        importBatchId: String(data.importBatchId ?? ''),
        customerType: String(data.customerType ?? 'new'),
        revivedByAgent: String(data.revivedByAgent ?? ''),
        bts: String(data.bts ?? ''),
        deletedAt: toBig(data.deletedAt) ?? null,
        createdAt: toBig(data.createdAt) ?? BigInt(0),
        updatedAt: toBig(data.updatedAt) ?? BigInt(0),
      },
      update: {
        serialNumber: Number(data.serialNumber ?? 0),
        customerName: String(data.customerName ?? ''),
        location: String(data.location ?? ''),
        region,
        segment,
        nrc: Number(data.nrc ?? 0),
        mrc: Number(data.mrc ?? 0),
        planCode: String(data.planCode ?? ''),
        saleDate: String(data.saleDate ?? ''),
        quarter,
        month: String(data.month ?? ''),
        packageType: String(data.packageType ?? 'Outright'),
        salesAgent: String(data.salesAgent ?? ''),
        meansOfSale: String(data.meansOfSale ?? ''),
        accountStatus: String(data.accountStatus ?? 'Active'),
        statusNotes: String(data.statusNotes ?? ''),
        importBatchId: String(data.importBatchId ?? ''),
        customerType: String(data.customerType ?? 'new'),
        revivedByAgent: String(data.revivedByAgent ?? ''),
        bts: String(data.bts ?? ''),
        deletedAt: toBig(data.deletedAt) ?? null,
        createdAt: toBig(data.createdAt) ?? BigInt(0),
        updatedAt: toBig(data.updatedAt) ?? BigInt(0),
      },
    });
    upserted++;
  }
  console.log(`sales_records: ${upserted} rows (${docs.length} docs)`);
  return upserted;
}

async function backfillSalesTargets(): Promise<number> {
  const docs = await getAllDocs('sales_targets');
  let upserted = 0;
  for (const { id, data } of docs) {
    await prisma.salesTarget.upsert({
      where: { id },
      create: {
        id,
        month: String(data.month ?? ''),
        region: data.region != null ? String(data.region) : null,
        agentName: data.agentName != null ? String(data.agentName) : null,
        targetRevenue: Number(data.targetRevenue ?? 0),
        targetCustomers: Number(data.targetCustomers ?? 0),
        createdAt: toBig(data.createdAt) ?? BigInt(0),
      },
      update: {
        month: String(data.month ?? ''),
        region: data.region != null ? String(data.region) : null,
        agentName: data.agentName != null ? String(data.agentName) : null,
        targetRevenue: Number(data.targetRevenue ?? 0),
        targetCustomers: Number(data.targetCustomers ?? 0),
        createdAt: toBig(data.createdAt) ?? BigInt(0),
      },
    });
    upserted++;
  }
  console.log(`sales_targets: ${upserted} rows (${docs.length} docs)`);
  return upserted;
}

async function backfillSalesImports(): Promise<number> {
  const docs = await getAllDocs('sales_imports');
  let upserted = 0;
  for (const { id, data } of docs) {
    await prisma.salesImport.upsert({
      where: { id },
      create: {
        id,
        batchId: String(data.batchId ?? id),
        source: String(data.source ?? 'csv_upload'),
        fileName: String(data.fileName ?? ''),
        recordCount: Number(data.recordCount ?? 0),
        importedAt: toBig(data.importedAt) ?? BigInt(0),
        importedBy: String(data.importedBy ?? ''),
        status: String(data.status ?? 'completed'),
      },
      update: {
        batchId: String(data.batchId ?? id),
        source: String(data.source ?? 'csv_upload'),
        fileName: String(data.fileName ?? ''),
        recordCount: Number(data.recordCount ?? 0),
        importedAt: toBig(data.importedAt) ?? BigInt(0),
        importedBy: String(data.importedBy ?? ''),
        status: String(data.status ?? 'completed'),
      },
    });
    upserted++;
  }
  console.log(`sales_imports: ${upserted} rows (${docs.length} docs)`);
  return upserted;
}

async function main() {
  const records = await backfillSalesRecords();
  const targets = await backfillSalesTargets();
  const imports = await backfillSalesImports();
  console.log(`Backfill complete: ${records} records, ${targets} targets, ${imports} imports`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
