/**
 * BTS CSV Import Script
 * Run with: node scripts/import-bts-csv.js
 * 
 * Reads credentials from:
 *   - FIREBASE_SERVICE_ACCOUNT_JSON env var
 *   - GOOGLE_APPLICATION_CREDENTIALS env var
 *   - .env file in project root (dotenv)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin
function initFirebase() {
  if (getApps().length > 0) return getApps()[0];
  
  // Option 1: FIREBASE_SERVICE_ACCOUNT_JSON env var (used by this project)
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
  
  // Option 2: Service account key file
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({
      credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    });
  }
  
  // Option 3: Application Default Credentials
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

// CSV Parsing (matches the import route logic)
function parseCSV(text) {
  const normalized = text.replace(/^\uFEFF/, '');
  const headers = [];
  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let rowIndex = 0;

  const flushField = () => {
    row.push(field);
    field = '';
  };

  const flushRow = () => {
    if (rowIndex === 0) {
      headers.push(...row.map((h) => h.trim()));
    } else if (row.some((v) => v.trim() !== '')) {
      // Pad short rows so rows without trailing empty columns are not dropped
      while (row.length < headers.length) row.push('');
      const record = {};
      headers.forEach((h, idx) => {
        record[h] = (row[idx] || '').trim();
      });
      records.push(record);
    }
    row = [];
    rowIndex++;
  };

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      flushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && normalized[i + 1] === '\n') i++;
      flushField();
      flushRow();
    } else {
      field += ch;
    }
  }

  // Flush any remaining row when the file does not end with a newline
  if (field !== '' || row.length > 0) {
    flushField();
    flushRow();
  }

  return records;
}

function parseNaira(value) {
  if (!value || value === '—' || value === '-') return 0;
  const cleaned = value.replace(/^[₦Nn\s,#]+/, '').trim();
  const num = parseFloat(cleaned.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

// Station mapping (matches bts-data.ts)
const BTS_STATIONS = {
  Ibadan: [
    { id: 1, name: 'Sijuwola House', host: 'NA' },
    { id: 2, name: 'Dominion', host: 'Host FM' },
    { id: 3, name: 'Space', host: 'Space FM' },
    { id: 4, name: 'Splash', host: 'Splash FM' },
    { id: 6, name: 'NTA IBD', host: 'NTA Ibadan' },
    { id: 7, name: 'Honor', host: 'Honor FM' },
    { id: 8, name: 'Oleyo', host: 'NA' },
    { id: 9, name: 'Ologuneru', host: 'St. John of the Cross Carmelite community' },
    { id: 10, name: 'Jericho', host: 'Lead City School' },
    { id: 11, name: 'Impact', host: 'Impact FM' },
    { id: 12, name: 'Moniya', host: 'Amuludun Radio Nigeria' },
  ],
  Ota: [
    { id: 25, name: 'Ota Estate', host: 'Mr. David Cooker' },
    { id: 26, name: 'Syayis', host: 'Syayis Hotel' },
    { id: 27, name: 'AIT', host: 'African Independent Television' },
    { id: 28, name: 'Ota Office', host: '' },
    { id: 29, name: 'Miliki BTS', host: 'Miliki FM' },
  ],
  Akure: [
    { id: 18, name: 'OSRC', host: 'Ondo State Radio Cooperation' },
    { id: 19, name: 'Akure Office', host: 'NA' },
    { id: 20, name: 'Positive', host: 'Positive FM' },
    { id: 21, name: 'Glow', host: 'NA' },
    { id: 22, name: 'Alagbaka Extension', host: '' },
    { id: 23, name: 'Bolorunduro', host: '' },
    { id: 24, name: 'Breeze', host: 'Breeze 91.9FM' },
  ],
  Osogbo: [
    { id: 13, name: 'OSBC', host: 'Osun Broadcasting Cooperation' },
    { id: 14, name: 'NTA Osogbo', host: 'NTA Osogbo' },
    { id: 15, name: 'Rave', host: 'Rave FM' },
    { id: 16, name: 'Osogbo Office', host: 'NA' },
    { id: 17, name: 'Odeomu', host: 'NA' },
  ],
  Abeokuta: [
    { id: 42, name: 'Omida Office', host: '' },
    { id: 43, name: 'NTA Abeokuta', host: '' },
    { id: 44, name: 'Rockcity', host: '' },
    { id: 45, name: 'Elega', host: '' },
    { id: 46, name: 'Ikija', host: '' },
    { id: 47, name: 'Ewang', host: '' },
    { id: 48, name: 'IVD', host: '' },
    { id: 49, name: 'Paramount', host: '' },
    { id: 50, name: 'Laderin', host: '' },
    { id: 51, name: 'Osoba', host: '' },
    { id: 52, name: 'Oloke', host: '' },
    { id: 53, name: 'CUAB', host: '' },
    { id: 54, name: 'CFMC', host: '' },
    { id: 55, name: 'Obada Oko', host: '' },
    { id: 56, name: 'Obada Extension', host: '' },
    { id: 57, name: 'Miliki', host: '' },
    { id: 58, name: 'OGBC', host: '' },
    { id: 59, name: 'Oshoba Hill', host: '' },
  ],
  Sagamu: [
    { id: 30, name: 'Sagamu GRA', host: 'Conference Hotel Sagamu' },
    { id: 31, name: 'CRC', host: 'Thames Valley College' },
    { id: 32, name: 'Akarigbo', host: 'Akarigbo Palace Sagamu' },
    { id: 33, name: 'Sagamu Extension', host: 'Mr. Akeem Oriyomi (Own his mast)' },
    { id: 34, name: 'Potoki', host: 'NA' },
    { id: 35, name: 'Pentagon', host: '' },
    { id: 36, name: 'Magboro', host: 'Pearl School Magboro' },
  ],
  Ijebu: [
    { id: 37, name: 'Odogbolu', host: 'Ijebu Ode Anglican Diocese' },
    { id: 38, name: 'Ijebu GRA', host: 'Conference Hotel Ijebu Ode' },
    { id: 39, name: 'NTA Ijebu', host: 'Nigerian Television Authority' },
    { id: 40, name: 'Ilamo', host: '' },
    { id: 41, name: 'CKA', host: '' },
  ],
};

const ACCOUNT_TYPE_MAP = {
  enterprise: 'ENTERPRISE',
  retail: 'RETAIL',
  sme: 'SME',
  residential: 'RESIDENTIAL',
  'partners & hosts': 'PARTNERS_HOSTS',
  partner: 'PARTNERS_HOSTS',
  neighbourhood: 'NEIGHBOURHOOD',
  neighborhood: 'NEIGHBOURHOOD',
};

// Explicit aliases for site names that fuzzy matching cannot resolve
const SITE_ALIASES = {
  'obada ext': 'Obada Extension',
  'ota [office core]': 'Ota Office',
  'osogbo-core': 'Osogbo Office',
  'nta ibadan': 'NTA IBD',
  // NTA satellite transmitter sites roll up into the NTA Abeokuta station
  'nta ogbe': 'NTA Abeokuta',
  'nta okegunya': 'NTA Abeokuta',
  'nta okegunya 2': 'NTA Abeokuta',
};

// Maps import region -> sales region used by the BTS audit page
const CITY_TO_SALES_REGION = {
  Ibadan: 'Oyo',
  Abeokuta: 'Ogun',
  Sagamu: 'Ogun',
  Ota: 'Ogun',
  Ijebu: 'Ogun',
  Osogbo: 'Osun',
  Akure: 'Ondo',
};

function mapAccountType(raw) {
  const key = raw.trim().toLowerCase();
  return ACCOUNT_TYPE_MAP[key] || 'OTHER';
}

// Enhanced fuzzy matching (matches the updated import route)
function findBtsMatch(siteName, regionStations) {
  const normalized = siteName.toLowerCase().trim();

  // 0. Explicit alias mapping first (handles names fuzzy matching cannot resolve)
  const aliasTarget = SITE_ALIASES[normalized];
  if (aliasTarget) {
    const aliasStation = regionStations.find((bts) => bts.name === aliasTarget);
    if (aliasStation) {
      return { name: aliasStation.name, region: aliasStation.region };
    }
  }

  const cleaned = normalized
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(bts|core|office|fm)\b/g, '')
    .replace(/[\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Exact substring match on cleaned name
  for (const bts of regionStations) {
    if (cleaned.includes(bts.name.toLowerCase())) {
      return { name: bts.name, region: bts.region };
    }
  }

  // 2. Exact substring match on original normalized name
  for (const bts of regionStations) {
    if (normalized.includes(bts.name.toLowerCase())) {
      return { name: bts.name, region: bts.region };
    }
  }

  // 3. Word-based fuzzy matching on cleaned name
  for (const bts of regionStations) {
    const btsWords = bts.name.toLowerCase().split(/[\s-/]+/);
    const siteWords = cleaned.split(/[\s-/]+/);
    const matchCount = btsWords.filter((w) => siteWords.includes(w)).length;
    if (matchCount >= Math.min(btsWords.length, 3)) {
      return { name: bts.name, region: bts.region };
    }
    if (matchCount >= 2 && matchCount === btsWords.length) {
      return { name: bts.name, region: bts.region };
    }
  }

  // 4. Word-based fuzzy matching on original normalized name
  for (const bts of regionStations) {
    const btsWords = bts.name.toLowerCase().split(/[\s-/]+/);
    const siteWords = normalized.split(/[\s-/]+/);
    const matchCount = btsWords.filter((w) => siteWords.includes(w)).length;
    if (matchCount >= Math.min(btsWords.length, 3)) {
      return { name: bts.name, region: bts.region };
    }
    if (matchCount >= 2 && matchCount === btsWords.length) {
      return { name: bts.name, region: bts.region };
    }
  }

  return null;
}

// Auto-discover BTS master-sheet CSVs in the Downloads folder
function discoverCsvFiles(downloadsPath) {
  const files = fs
    .readdirSync(downloadsPath)
    .filter((f) => /^Database Master-Sheet/i.test(f) && f.toLowerCase().endsWith('.csv'));

  const REGION_KEYWORDS = [
    ['IBADAN', 'Ibadan'],
    ['ABEOKUTA', 'Abeokuta'],
    ['SAGAMU', 'Sagamu'],
    ['IJEBU', 'Ijebu'],
    ['OTA', 'Ota'],
    ['OSOGBO', 'Osogbo'],
    ['AKURE', 'Akure'],
  ];

  const found = [];
  for (const file of files) {
    const match = REGION_KEYWORDS.find(([kw]) => file.toUpperCase().includes(kw));
    if (match) found.push({ file, region: match[1] });
  }
  return found;
}

function getCurrentAuditPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const pastDaysOfYear = (now - firstDayOfYear) / 86400000;
  const week = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Auto-create/refresh BTS audit records for matched sites (matches the import route logic)
async function syncAuditRecords(db, summaries, regionStations, region, now) {
  const auditPeriod = getCurrentAuditPeriod();
  let created = 0;
  let updated = 0;

  for (const summary of summaries) {
    if (summary.matchStatus !== 'matched' || !summary.matchedBtsName) continue;
    const btsName = summary.matchedBtsName;
    const station = regionStations.find((s) => s.name === btsName);
    const targetMrr = 5000000;

    const metrics = {
      activeCustomers: summary.activeCustomers,
      totalCustomers: summary.totalCustomers,
      enterpriseCustomers: summary.enterpriseCustomers,
      retailCustomers: summary.retailCustomers,
      monthlyRecurringRevenue: summary.totalMrr,
      nrcRevenue: 0,
      totalRevenue: summary.totalMrr,
      attainmentPercentage: summary.totalMrr > 0 ? Math.round((summary.totalMrr / targetMrr) * 10000) / 100 : 0,
      updatedAt: now,
    };

    const existingSnap = await db
      .collection('bts_audit_records')
      .where('btsName', '==', btsName)
      .where('auditPeriod', '==', auditPeriod)
      .limit(2)
      .get();
    const existingDoc = existingSnap.docs.find((d) => !d.data().deletedAt);

    if (existingDoc) {
      await existingDoc.ref.update(metrics);
      await db.collection('bts_latest_audit').doc(btsName).set(
        { ...existingDoc.data(), ...metrics, id: existingDoc.id },
        { merge: true },
      );
      updated++;
      continue;
    }

    const record = {
      btsName,
      ...(station && station.id !== undefined ? { btsId: station.id } : {}),
      region: CITY_TO_SALES_REGION[region] || region,
      siteType: 'Tower',
      status: summary.activeCustomers > 0 ? 'Active' : 'Inactive',
      ...(station && station.host ? { host: station.host } : {}),
      activeCustomers: summary.activeCustomers,
      totalCustomers: summary.totalCustomers,
      enterpriseCustomers: summary.enterpriseCustomers,
      retailCustomers: summary.retailCustomers,
      monthlyRecurringRevenue: summary.totalMrr,
      targetMrr,
      attainmentPercentage: metrics.attainmentPercentage,
      nrcRevenue: 0,
      totalRevenue: summary.totalMrr,
      splynxRouterIds: [],
      splynxRouterNames: [],
      outageCountThisMonth: 0,
      maintenanceNotes: 'Auto-generated from CSV import',
      auditedBy: 'system-import',
      auditedAt: now,
      auditPeriod,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('bts_audit_records').add(record);
    await db.collection('bts_latest_audit').doc(btsName).set({ ...record, id: docRef.id });
    created++;
  }

  console.log(`   Audit records: ${created} created, ${updated} updated (period ${auditPeriod})`);
  return { created, updated };
}

async function importRegion(db, csvPath, region) {
  console.log(`\n📥 Processing ${region}...`);
  
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  console.log(`   Parsed ${rows.length} rows`);

  const regionStations = BTS_STATIONS[region] || [];
  console.log(`   ${regionStations.length} known stations for ${region}`);

  const customers = [];
  const parseErrors = [];
  const siteMap = new Map();
  const unmatchedSites = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const serialNumber = parseInt(row['S/N'] || String(i + 1)) || i + 1;
    const customerName = row['Name of Subscriber']?.trim();
    const siteName = row['BTS / Sites']?.trim();
    const status = row['Status']?.trim();
    const accountType = row['Account Type']?.trim();
    const mrcRaw = row['Monthly Subcription Plan (₦)'] || '';
    const planCode = row['PLAN']?.trim();

    if (!customerName) {
      parseErrors.push(`Row ${i + 2}: Missing customer name`);
      continue;
    }
    if (!siteName) {
      parseErrors.push(`Row ${i + 2}: Missing BTS/Site name for ${customerName}`);
      continue;
    }

    customers.push({
      serialNumber,
      customerName,
      btsName: siteName,
      status: ['Active', 'Inactive'].includes(status) ? status : 'Active',
      accountType: mapAccountType(accountType),
      mrc: parseNaira(mrcRaw),
      planCode: planCode || '',
    });

    const siteKey = siteName.toLowerCase();
    const existing = siteMap.get(siteKey) || {
      btsName: siteName,
      matchedBtsName: null,
      matchStatus: 'unmatched',
      region: '',
      totalCustomers: 0,
      activeCustomers: 0,
      enterpriseCustomers: 0,
      retailCustomers: 0,
      smeCustomers: 0,
      residentialCustomers: 0,
      partnersHosts: 0,
      neighbourhoodCustomers: 0,
      totalMrr: 0,
    };

    existing.totalCustomers++;
    existing.totalMrr += parseNaira(mrcRaw);

    if (status === 'Active') existing.activeCustomers++;
    if (accountType.toLowerCase() === 'enterprise') existing.enterpriseCustomers++;
    if (accountType.toLowerCase() === 'retail') existing.retailCustomers++;
    if (accountType.toLowerCase() === 'sme') existing.smeCustomers++;
    if (accountType.toLowerCase() === 'residential') existing.residentialCustomers++;
    if (accountType.toLowerCase().includes('partner')) existing.partnersHosts++;
    if (accountType.toLowerCase().includes('neighbour')) existing.neighbourhoodCustomers++;

    if (!existing.matchedBtsName) {
      const match = findBtsMatch(siteName, regionStations);
      if (match) {
        existing.matchedBtsName = match.name;
        existing.region = match.region;
        existing.matchStatus = 'matched';
      } else {
        unmatchedSites.add(siteName);
      }
    }

    siteMap.set(siteKey, existing);
  }

  console.log(`   Valid customers: ${customers.length}`);
  console.log(`   Unique sites: ${siteMap.size}`);
  console.log(`   Matched: ${Array.from(siteMap.values()).filter(s => s.matchStatus === 'matched').length}`);
  console.log(`   Unmatched: ${Array.from(siteMap.values()).filter(s => s.matchStatus === 'unmatched').length}`);
  console.log(`   Parse errors: ${parseErrors.length}`);

  if (customers.length === 0) {
    console.log('   ⚠️ No valid customers to import');
    return { success: false, error: 'No valid customers' };
  }

  const importBatchId = `bts_csv_${region.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  const now = Date.now();

  // Batch write customers
  console.log('   Writing customers...');
  const batch = db.batch();
  for (const customer of customers) {
    const docRef = db.collection('bts_customers').doc();
    batch.set(docRef, {
      ...customer,
      region,
      importBatchId,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();

  // Batch write site summaries
  console.log('   Writing site summaries...');
  const siteBatch = db.batch();
  for (const [key, summary] of siteMap) {
    const siteRef = db.collection('bts_customer_sites').doc(`${importBatchId}_${key.replace(/[^a-z0-9]/g, '_')}`);
    siteBatch.set(siteRef, {
      ...summary,
      region,
      importBatchId,
      createdAt: now,
    });
  }
  await siteBatch.commit();

  // Auto-create/refresh BTS audit records for matched sites (current audit period)
  console.log('   Syncing audit records...');
  const auditSync = await syncAuditRecords(db, Array.from(siteMap.values()), regionStations, region, now);

  console.log(`   ✅ Import complete! Batch ID: ${importBatchId}`);
  return {
    success: true,
    batchId: importBatchId,
    customerCount: customers.length,
    siteCount: siteMap.size,
    matchedCount: Array.from(siteMap.values()).filter(s => s.matchStatus === 'matched').length,
    unmatchedCount: Array.from(siteMap.values()).filter(s => s.matchStatus === 'unmatched').length,
    unmatchedSites: unmatchedSites.size > 0 ? Array.from(unmatchedSites) : [],
  };
}

async function main() {
  console.log('🚀 BTS CSV Import Starting...\n');
  
  const app = initFirebase();
  const db = getFirestore(app);
  
  const downloadsPath = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads');
  const csvFiles = discoverCsvFiles(downloadsPath);

  if (csvFiles.length === 0) {
    console.log('⚠️ No Database Master-Sheet*.csv files found in Downloads.');
    process.exit(1);
  }

  console.log(`Found ${csvFiles.length} CSV file(s) in Downloads:\n`);
  for (const { file, region } of csvFiles) {
    console.log(`   - ${file} (${region})`);
  }
  console.log('');

  const results = {};

  for (const { file, region } of csvFiles) {
    const csvPath = path.join(downloadsPath, file);
    if (!fs.existsSync(csvPath)) {
      console.log(`⚠️ File not found: ${csvPath}`);
      results[region] = { success: false, error: 'File not found' };
      continue;
    }
    
    try {
      results[region] = await importRegion(db, csvPath, region);
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      results[region] = { success: false, error: err.message };
    }
  }

  console.log('\n📊 IMPORT SUMMARY');
  console.log('='.repeat(50));
  for (const [region, result] of Object.entries(results)) {
    if (result.success) {
      console.log(`${region}: ${result.customerCount} customers, ${result.siteCount} sites (${result.matchedCount} matched, ${result.unmatchedCount} unmatched)`);
    } else {
      console.log(`${region}: ❌ ${result.error}`);
    }
  }
  
  console.log('\n✅ All imports complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});