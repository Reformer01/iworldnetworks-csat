/**
 * Sales Data Migration Script
 *
 * Imports sales records from a JSON file (exported from Google Sheets) into Firestore.
 *
 * Usage:
 *   1. Export your Google Sheet data as a JSON file with a "sales_records" array
 *   2. Run: node scripts/import-sales-data.mjs <path-to-json-file>
 *
 * Expected JSON format:
 *   {
 *     "sales_records": [
 *       {
 *         "Quarter": "QUARTER 1",
 *         "Month": "JUNE",
 *         "S_N": 1,
 *         "Name": "Customer Name",
 *         "Location": "Abeokuta",
 *         "NRC": "N227,500.00",
 *         "MRC": "N27,500.00",
 *         "Plan_Code": "H-Lite",
 *         "Date": "01st-June",
 *         "Package_Type": "Outright",
 *         "Business_Person": "Sales Agent",
 *         "Means_of_Sales": "Door Knocking",
 *         "Account_Status": "Active"
 *       },
 *       ...
 *     ]
 *   }
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

for (const envFile of ['.env.local', '.env']) {
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile, override: false });
  }
}

// --- Helpers (mirrors lib/sales-staff.ts logic) ---

const REGION_MAP = {
  akure: 'Ondo', 'orile imo': 'Ogun', 'orile': 'Ogun',
  oshogbo: 'Osun', osogbo: 'Osun',
  abeokuta: 'Ogun', shagamu: 'Ogun', sagamu: 'Ogun', ota: 'Ogun',
  'ijebu ode': 'Ogun', 'ijebu': 'Ogun',
  ibadan: 'Oyo', mowe: 'Oyo',
};

function getRegion(location) {
  const loc = (location || '').toLowerCase().trim();
  for (const [key, region] of Object.entries(REGION_MAP)) {
    if (loc.includes(key)) return region;
  }
  return 'Ogun';
}

function getSegment(planCode) {
  const code = (planCode || '').toUpperCase();
  if (code.startsWith('H-')) return 'HOME';
  if (code.startsWith('U-')) return 'SME';
  return 'ENTERPRISE';
}

function getQuarter(month) {
  const m = (month || '').toLowerCase();
  if (['june', 'july', 'august'].includes(m)) return 'QUARTER 1';
  if (['september', 'october', 'november'].includes(m)) return 'QUARTER 2';
  if (['december', 'january', 'february'].includes(m)) return 'QUARTER 3';
  return 'QUARTER 4';
}

function parseAmount(val) {
  if (!val) return 0;
  const cleaned = String(val).replace(/[₦N,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function extractStatusNotes(status) {
  const s = String(status || '');
  if (s.startsWith('Inactive')) return s;
  return '';
}

function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s.startsWith('inactive')) return 'Inactive';
  if (s === 'blocked') return 'Blocked';
  if (s === 'refunded') return 'Refunded';
  if (s === 'retrieved') return 'Retrieved';
  return 'Active';
}

function mapRecord(row, index) {
  const mrc = parseAmount(row.MRC || row.mrc);
  const nrc = parseAmount(row.NRC || row.nrc);
  const location = (row.Location || row.location || '').trim();
  const status = row.Account_Status || row.accountStatus || '';

  return {
    serialNumber: parseInt(row.S_N || row.s_n || index) || index,
    customerName: (row.Name || row.name || row.customerName || '').trim(),
    location,
    region: getRegion(location),
    segment: getSegment(row.Plan_Code || row.planCode || row.Plan),
    nrc,
    mrc,
    planCode: (row.Plan_Code || row.planCode || row.Plan || '').trim(),
    saleDate: (row.Date || row.date || row.saleDate || '').trim(),
    quarter: getQuarter(row.Month || row.month),
    month: (row.Month || row.month || '').trim(),
    packageType: (row.Package_Type || row.packageType || 'Outright').trim(),
    salesAgent: (row.Business_Person || row.businessPerson || row.Sales_Agent || row.salesAgent || '').trim(),
    meansOfSale: (row.Means_of_Sales || row.meansOfSale || row.Means_of_Sale || '').trim(),
    accountStatus: normalizeStatus(status),
    statusNotes: extractStatusNotes(status),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// --- Main ---

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('Usage: node scripts/import-sales-data.mjs <path-to-json-file>');
    console.error('');
    console.error('Expected JSON structure with a "sales_records" array.');
    process.exit(1);
  }

  const absPath = resolve(jsonPath);
  if (!existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  console.log(`Reading sales data from: ${absPath}`);
  const raw = readFileSync(absPath, 'utf-8');
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }

  const rawRecords = json.sales_records || [];
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    console.error('No "sales_records" array found in JSON file.');
    console.error('Make sure your JSON has a "sales_records" key with an array of records.');
    process.exit(1);
  }

  console.log(`Found ${rawRecords.length} records in JSON.`);

  // Map to schema
  const records = rawRecords.map((r, i) => mapRecord(r, i + 1));

  // Summary
  const regions = [...new Set(records.map(r => r.region))];
  const segments = [...new Set(records.map(r => r.segment))];
  const agents = [...new Set(records.map(r => r.salesAgent).filter(Boolean))];
  const totalMrc = records.reduce((s, r) => s + r.mrc, 0);
  const totalNrc = records.reduce((s, r) => s + r.nrc, 0);
  const activeCount = records.filter(r => r.accountStatus === 'Active').length;

  console.log('');
  console.log('=== Import Summary ===');
  console.log(`Total records:     ${records.length}`);
  console.log(`Active accounts:   ${activeCount}`);
  console.log(`Regions:           ${regions.join(', ')}`);
  console.log(`Segments:          ${segments.join(', ')}`);
  console.log(`Sales agents:      ${agents.length}`);
  console.log(`Total MRC:         ₦${totalMrc.toLocaleString()}`);
  console.log(`Total NRC:         ₦${totalNrc.toLocaleString()}`);
  console.log('');
  console.log('Sample record:');
  console.log(JSON.stringify(records[0], null, 2));

  // Check if we should actually write to Firestore
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('');
    console.log('DRY RUN — no data written. Remove --dry-run to import for real.');
    process.exit(0);
  }

  // Initialize Firebase Admin
  let adminApp;
  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');

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
    const batchId = `import_script_${Date.now()}`;

    // Write in batches of 500
    const BATCH_SIZE = 500;
    let written = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = records.slice(i, i + BATCH_SIZE);

      for (const record of chunk) {
        const docRef = db.collection('sales_records').doc();
        batch.set(docRef, { ...record, importBatchId: batchId });
      }

      await batch.commit();
      written += chunk.length;
      console.log(`  Written ${written}/${records.length} records...`);
    }

    // Write import audit entry
    await db.collection('sales_imports').add({
      batchId,
      source: 'json_migration_script',
      fileName: absPath.split(/[\\/]/).pop(),
      recordCount: records.length,
      importedAt: Date.now(),
      importedBy: 'migration_script',
      status: 'completed',
    });

    console.log('');
    console.log(`✅ Import complete! ${written} records written to Firestore.`);
    console.log(`   Batch ID: ${batchId}`);
  } catch (err) {
    console.error('❌ Import failed:', err.message || err);
    process.exit(1);
  }
}

main();
