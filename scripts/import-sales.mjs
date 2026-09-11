// Server-side sales import — mirrors src/app/api/admin/sales/import/route.ts
// (same enrichment + write path) so the CSV can be imported on prod without a
// Firebase ID token (none can be minted locally). Run with --commit to write;
// default is dry-run. Idempotent: skips rows whose (customerName, month)
// already exists (the route has no dedupe; the 9 UI-entered prod rows would
// otherwise double-count).
// ponytail: route-cache clearing is skipped — the running server's in-process
// TTL cache expires on its own.

import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const COMMIT = process.argv.includes('--commit');
const CSV_PATH = process.argv.find((a) => a.startsWith('--csv='))?.slice(6) ?? 'import-files/sales-import-2026-q1.csv';

const raw = fs.readFileSync('.env', 'utf8');
const dbUrl = raw.match(/DATABASE_URL=("?)(.*?)\1$/m)?.[2];
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl) });

// ---- ports of src/lib/sales-staff.ts ----
function getRegionForLocation(location) {
  const loc = (location ?? '').toLowerCase().trim();
  const ibadanCities = ['ibadan', 'oriye', 'mowe', 'ibo'];
  const ogunCities = ['abeokuta', 'shagamu', 'ota', 'ijebu ode', 'ijebu', 'orile imo', 'orile', 'sagamu'];
  const osunCities = ['oshogbo', 'osogbo'];
  const ondoCities = ['akure'];
  if (ondoCities.some((c) => loc.includes(c))) return 'Ondo';
  if (osunCities.some((c) => loc.includes(c))) return 'Osun';
  if (ogunCities.some((c) => loc.includes(c))) return 'Ogun';
  if (ibadanCities.some((c) => loc.includes(c))) return 'Oyo';
  return 'Oyo';
}

function getSegmentForPlan(planCode) {
  const code = (planCode ?? '').toUpperCase();
  if (code.startsWith('N-')) return 'NEIGHBOURHOOD';
  if (code.startsWith('H-')) return 'HOME';
  if (code.startsWith('U-')) return 'SME';
  return 'ENTERPRISE';
}

function getQuarterFromMonth(month) {
  const m = (month ?? '').toLowerCase();
  if (['june', 'july', 'august'].includes(m)) return 'QUARTER 1';
  if (['september', 'october', 'november'].includes(m)) return 'QUARTER 2';
  if (['december', 'january', 'february'].includes(m)) return 'QUARTER 3';
  return 'QUARTER 4';
}

// ---- ports of src/lib/bts-data.ts ----
const btsStations = [
  { id: 1, name: 'Sijuwola House', region: 'Ibadan', host: 'NA' },
  { id: 2, name: 'Dominion', region: 'Ibadan', host: 'Host FM' },
  { id: 3, name: 'Space', region: 'Ibadan', host: 'Space FM' },
  { id: 4, name: 'Splash', region: 'Ibadan', host: 'Splash FM' },
  { id: 6, name: 'NTA IBD', region: 'Ibadan', host: 'NTA Ibadan' },
  { id: 7, name: 'Honor', region: 'Ibadan', host: 'Honor FM' },
  { id: 8, name: 'Oleyo', region: 'Ibadan', host: 'NA' },
  { id: 9, name: 'Ologuneru', region: 'Ibadan', host: 'St. John of the Cross Carmelite community' },
  { id: 10, name: 'Jericho', region: 'Ibadan', host: 'Lead City School' },
  { id: 11, name: 'Impact', region: 'Ibadan', host: 'Impact FM' },
  { id: 12, name: 'Moniya', region: 'Ibadan', host: 'Amuludun Radio Nigeria' },
  { id: 13, name: 'OSBC', region: 'Osogbo', host: 'Osun Broadcasting Cooperation' },
  { id: 14, name: 'NTA Osogbo', region: 'Osogbo', host: 'NTA Osogbo' },
  { id: 15, name: 'Rave', region: 'Osogbo', host: 'Rave FM' },
  { id: 16, name: 'Osogbo Office', region: 'Osogbo', host: 'NA' },
  { id: 17, name: 'Odeomu', region: 'Osogbo', host: 'NA' },
  { id: 18, name: 'OSRC', region: 'Akure', host: 'Ondo State Radio Cooperation' },
  { id: 19, name: 'Akure Office', region: 'Akure', host: 'NA' },
  { id: 20, name: 'Positive', region: 'Akure', host: 'Positive FM' },
  { id: 21, name: 'Glow', region: 'Akure', host: 'NA' },
  { id: 22, name: 'Alagbaka Extension', region: 'Akure', host: '' },
  { id: 23, name: 'Bolorunduro', region: 'Akure', host: '' },
  { id: 24, name: 'Breeze', region: 'Akure', host: 'Breeze 91.9FM' },
  { id: 25, name: 'Ota Estate', region: 'Ota', host: 'Mr. David Cooker' },
  { id: 26, name: 'Syayis', region: 'Ota', host: 'Syayis Hotel' },
  { id: 27, name: 'AIT', region: 'Ota', host: 'African Independent Television' },
  { id: 28, name: 'Ota Office', region: 'Ota', host: '' },
  { id: 29, name: 'Miliki BTS', region: 'Ota', host: 'Miliki FM' },
  { id: 30, name: 'Sagamu GRA', region: 'Sagamu', host: 'Conference Hotel Sagamu' },
  { id: 31, name: 'CRC', region: 'Sagamu', host: 'Thames Valley College' },
  { id: 32, name: 'Akarigbo', region: 'Sagamu', host: 'Akarigbo Palace Sagamu' },
  { id: 33, name: 'Sagamu Extension', region: 'Sagamu', host: 'Mr. Akeem Oriyomi (Own his mast)' },
  { id: 34, name: 'Potoki', region: 'Sagamu', host: 'NA' },
  { id: 35, name: 'Pentagon', region: 'Sagamu', host: '' },
  { id: 36, name: 'Magboro', region: 'Sagamu', host: 'Pearl School Magboro' },
  { id: 37, name: 'Odogbolu', region: 'Ijebu', host: 'Ijebu Ode Anglican Diocese' },
  { id: 38, name: 'Ijebu GRA', region: 'Ijebu', host: 'Conference Hotel Ijebu Ode' },
  { id: 39, name: 'NTA Ijebu', region: 'Ijebu', host: 'Nigerian Television Authority' },
  { id: 40, name: 'Ilamo', region: 'Ijebu', host: '' },
  { id: 41, name: 'CKA', region: 'Ijebu', host: '' },
  { id: 42, name: 'Omida Office', region: 'Abeokuta', host: '' },
  { id: 43, name: 'NTA Abeokuta', region: 'Abeokuta', host: '' },
  { id: 44, name: 'Rockcity', region: 'Abeokuta', host: '' },
  { id: 45, name: 'Elega', region: 'Abeokuta', host: '' },
  { id: 46, name: 'Ikija', region: 'Abeokuta', host: '' },
  { id: 47, name: 'Ewang', region: 'Abeokuta', host: '' },
  { id: 48, name: 'IVD', region: 'Abeokuta', host: '' },
  { id: 49, name: 'Paramount', region: 'Abeokuta', host: '' },
  { id: 50, name: 'Laderin', region: 'Abeokuta', host: '' },
  { id: 51, name: 'Osoba', region: 'Abeokuta', host: '' },
  { id: 52, name: 'Oloke', region: 'Abeokuta', host: '' },
  { id: 53, name: 'CUAB', region: 'Abeokuta', host: '' },
  { id: 54, name: 'CFMC', region: 'Abeokuta', host: '' },
  { id: 55, name: 'Obada Oko', region: 'Abeokuta', host: '' },
  { id: 56, name: 'Obada Extension', region: 'Abeokuta', host: '' },
  { id: 57, name: 'Miliki', region: 'Abeokuta', host: '' },
  { id: 58, name: 'OGBC', region: 'Abeokuta', host: '' },
  { id: 59, name: 'Oshoba Hill', region: 'Abeokuta', host: '' },
];

const SITE_ALIASES = {
  'obada ext': 'Obada Extension',
  'ota [office core]': 'Ota Office',
  'osogbo-core': 'Osogbo Office',
  'nta ibadan': 'NTA IBD',
  'nta ogbe': 'NTA Abeokuta',
  'nta okegunya': 'NTA Abeokuta',
  'nta okegunya 2': 'NTA Abeokuta',
};

const LOCATION_TO_BTS_REGION = {
  ibadan: ['Ibadan'],
  oyo: ['Ibadan'],
  osogbo: ['Osogbo'],
  oshogbo: ['Osogbo'],
  akure: ['Akure'],
  abeokuta: ['Abeokuta'],
  sagamu: ['Sagamu'],
  shagamu: ['Sagamu'],
  ota: ['Ota'],
  ijebu: ['Ijebu'],
  'ijebu ode': ['Ijebu'],
  'orile imo': ['Ijebu'],
  orile: ['Ijebu'],
  mowe: ['Ibadan'],
  ibo: ['Ibadan'],
  lagos: ['Ibadan'],
  oriye: ['Ibadan'],
};

function getBtsForLocation(location) {
  const key = (location ?? '').toLowerCase().trim();
  const btsRegions = LOCATION_TO_BTS_REGION[key];
  if (btsRegions) return btsStations.filter((b) => btsRegions.includes(b.region));
  return [];
}

function findBtsMatch(siteName, regionStations) {
  const normalized = (siteName || '').toLowerCase().trim();
  const aliasTarget = SITE_ALIASES[normalized];
  if (aliasTarget) {
    const aliasStation = regionStations.find((bts) => bts.name === aliasTarget);
    if (aliasStation) return { name: aliasStation.name, region: aliasStation.region };
  }
  const cleaned = normalized
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(bts|core|office|fm)\b/g, '')
    .replace(/[\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (const bts of regionStations) {
    if (cleaned.includes(bts.name.toLowerCase())) return { name: bts.name, region: bts.region };
  }
  for (const bts of regionStations) {
    if (normalized.includes(bts.name.toLowerCase())) return { name: bts.name, region: bts.region };
  }
  for (const bts of regionStations) {
    const btsWords = bts.name.toLowerCase().split(/[\s-/]+/);
    const siteWords = cleaned.split(/[\s-/]+/);
    const matchCount = btsWords.filter((w) => siteWords.includes(w)).length;
    if (matchCount >= Math.min(btsWords.length, 3)) return { name: bts.name, region: bts.region };
    if (matchCount >= 2 && matchCount === btsWords.length) return { name: bts.name, region: bts.region };
  }
  for (const bts of regionStations) {
    const btsWords = bts.name.toLowerCase().split(/[\s-/]+/);
    const siteWords = normalized.split(/[\s-/]+/);
    const matchCount = btsWords.filter((w) => siteWords.includes(w)).length;
    if (matchCount >= Math.min(btsWords.length, 3)) return { name: bts.name, region: bts.region };
    if (matchCount >= 2 && matchCount === btsWords.length) return { name: bts.name, region: bts.region };
  }
  return null;
}

// ---- ports of src/lib/bts-resolver.ts ----
function normalizeSiteName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\b(bts|core|office|fm|ib|a)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function regionForStationName(name) {
  const s = btsStations.find((x) => x.name.toLowerCase() === (name || '').toLowerCase());
  return s ? s.region : null;
}

function endpointMatchScore(customerName, endpointName) {
  const a = normalizeSiteName(customerName).split(' ').filter(Boolean);
  const b = normalizeSiteName(endpointName).split(' ').filter(Boolean);
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  let hits = 0;
  for (const token of b) if (set.has(token)) hits++;
  return hits / Math.max(a.length, b.length);
}

function findStationForName(name) {
  const normalized = (name || '').toLowerCase().trim();
  const aliasTarget = SITE_ALIASES[normalized];
  const direct = btsStations.find((s) => s.name.toLowerCase() === normalized);
  if (direct) return direct;
  if (aliasTarget) {
    const aliasStation = btsStations.find((s) => s.name === aliasTarget);
    if (aliasStation) return aliasStation;
  }
  const cleaned = normalizeSiteName(name);
  return btsStations.find((s) => normalizeSiteName(s.name) === cleaned) ?? null;
}

function resolveCustomerBts(customerName, uispEndpoints) {
  const name = (customerName || '').trim();
  if (!name) return null;
  if (uispEndpoints && uispEndpoints.length > 0) {
    let best = null;
    for (const ep of uispEndpoints) {
      const score = endpointMatchScore(name, ep.name);
      if (score >= 0.6 && (!best || score > best.score)) {
        best = { name: ep.name, btsName: ep.btsName, score };
      }
    }
    if (best && best.btsName) {
      const region = regionForStationName(best.btsName);
      if (region) return { btsName: best.btsName, region, source: 'uisp', matchedName: best.name };
      const staticMatch = findStationForName(best.btsName);
      if (staticMatch) return { btsName: staticMatch.name, region: staticMatch.region, source: 'uisp', matchedName: best.name };
      return { btsName: best.btsName, region: '', source: 'uisp', matchedName: best.name };
    }
  }
  const allRegions = [...new Set(btsStations.map((b) => b.region))];
  for (const region of allRegions) {
    const regionStations = btsStations.filter((s) => s.region === region);
    const match = findBtsMatch(name, regionStations);
    if (match) return { btsName: match.name, region: match.region, source: 'static', matchedName: match.name };
  }
  return null;
}

// ---- CSV parsing (quote-aware, port of import/page.tsx splitLine) ----
function parseCsv(text) {
  const splitLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);
    return values.map((v) => v.trim());
  };
  const lines = text.split(/\r?\n/);
  const headers = splitLine(lines[0]);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    if (values.length !== headers.length || values.every((v) => !v)) continue;
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }
  return records;
}

function parseNairaAmount(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/^[₦Nn\s,#]+/, '').trim();
  const match = cleaned.match(/^[\d,]+(\.\d+)?/);
  if (!match) return 0;
  const num = parseFloat(match[0].replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

const OFFICIAL = {
  'Jeffery Udoji': { count: 14, mrc: 1351125 },
  'Titilade Bakare': { count: 22, mrc: 2350750 },
  'Janet Oke': { count: 26, mrc: 950000 },
  'Henry Adiene': { count: 6, mrc: 196000 },
  'Ruth Suleimon': { count: 9, mrc: 296500 },
  'Emmanuel Oladimeji': { count: 7, mrc: 197500 },
  'Elizabeth Tola': { count: 1, mrc: 58000 },
};

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  console.log(`parsed ${rows.length} rows from ${CSV_PATH}`);

  const uispEndpoints = await prisma.uispSite.findMany({
    where: { type: 'endpoint' },
    select: { id: true, name: true, type: true, btsId: true, btsName: true },
  });
  console.log(`uisp endpoints: ${uispEndpoints.length}`);

  const existing = await prisma.salesRecordEntry.findMany({ select: { customerName: true, month: true } });
  const existingKeys = new Set(existing.map((r) => `${r.customerName.toLowerCase().trim()}|${r.month}`));
  console.log(`existing sales records: ${existing.length}`);

  const now = Date.now();
  const batchId = `import_${now}`;
  const enriched = [];
  const skipped = [];
  for (const row of rows) {
    const key = `${row.Name.toLowerCase().trim()}|${row.Month}`;
    if (existingKeys.has(key)) {
      skipped.push(row.Name);
      continue;
    }
    const resolved = resolveCustomerBts(row.Name, uispEndpoints);
    const suggestedBts = getBtsForLocation(row.Location);
    const assignedBts = row.BTS || resolved?.btsName || suggestedBts[0]?.name || '';
    enriched.push({
      serialNumber: parseInt(row.S_N, 10) || 0,
      customerName: row.Name,
      location: row.Location,
      region: getRegionForLocation(row.Location),
      segment: getSegmentForPlan(row.Plan),
      nrc: parseNairaAmount(row.NRC),
      mrc: parseNairaAmount(row.MRC),
      planCode: row.Plan,
      saleDate: row.Date,
      quarter: row.Quarter || getQuarterFromMonth(row.Month),
      month: row.Month,
      packageType: row.Package_Type === 'Lease' ? 'Lease' : 'Outright',
      salesAgent: row.Sales_Agent,
      meansOfSale: row.Means_of_Sales,
      accountStatus: row.Account_Status || 'Active',
      statusNotes: row.Last_Subscription,
      importBatchId: batchId,
      customerType: 'new',
      bts: assignedBts,
      createdAt: now,
      updatedAt: now,
      _resolvedSource: resolved?.source ?? 'none',
    });
  }
  console.log(`to import: ${enriched.length}, skipped duplicates: ${skipped.length} ${skipped.length ? '(' + skipped.join(', ') + ')' : ''}`);
  console.log('bts resolution sources:', enriched.reduce((acc, r) => ((acc[r._resolvedSource] = (acc[r._resolvedSource] || 0) + 1), acc), {}));

  const byAgent = {};
  for (const r of enriched) {
    if (r.month === 'June' || r.month === 'July') {
      byAgent[r.salesAgent] = byAgent[r.salesAgent] || { count: 0, mrc: 0 };
      byAgent[r.salesAgent].count++;
      byAgent[r.salesAgent].mrc += r.mrc;
    }
  }
  console.log('\nJune+July per-agent vs official:');
  for (const [agent, o] of Object.entries(OFFICIAL)) {
    const a = byAgent[agent] || { count: 0, mrc: 0 };
    const ok = a.count === o.count && a.mrc === o.mrc;
    console.log(`${ok ? 'OK  ' : 'MISMATCH'} ${agent}: ${a.count}/${a.mrc} vs official ${o.count}/${o.mrc}`);
  }
  const jj = enriched.filter((r) => r.month === 'June' || r.month === 'July');
  console.log(`June+July total: ${jj.length} records, ${jj.reduce((s, r) => s + r.mrc, 0)} mrc (official 85 / 5399875)`);

  console.log('\nby month:', enriched.reduce((acc, r) => ((acc[r.month] = (acc[r.month] || 0) + 1), acc), {}));
  console.log('by status:', enriched.reduce((acc, r) => ((acc[r.accountStatus] = (acc[r.accountStatus] || 0) + 1), acc), {}));
  console.log('by region:', enriched.reduce((acc, r) => ((acc[r.region] = (acc[r.region] || 0) + 1), acc), {}));
  console.log('records without bts:', enriched.filter((r) => !r.bts).length);

  if (!COMMIT) {
    console.log('\ndry-run only — pass --commit to write');
    await prisma.$disconnect();
    return;
  }

  for (const r of enriched) {
    const { _resolvedSource, ...data } = r;
    await prisma.salesRecordEntry.create({
      data: {
        id: randomUUID(),
        serialNumber: data.serialNumber,
        customerName: data.customerName,
        location: data.location,
        region: data.region,
        segment: data.segment,
        nrc: data.nrc,
        mrc: data.mrc,
        planCode: data.planCode,
        saleDate: data.saleDate,
        quarter: data.quarter,
        month: data.month,
        packageType: data.packageType,
        salesAgent: data.salesAgent,
        meansOfSale: data.meansOfSale,
        accountStatus: data.accountStatus,
        statusNotes: data.statusNotes,
        importBatchId: data.importBatchId,
        customerType: data.customerType,
        bts: data.bts,
        createdAt: BigInt(data.createdAt),
        updatedAt: BigInt(data.updatedAt),
      },
    });
  }
  await prisma.salesImport.create({
    data: {
      batchId,
      source: 'csv_upload',
      fileName: CSV_PATH.split('/').pop(),
      recordCount: enriched.length,
      importedBy: 'system:server-import',
      importedAt: BigInt(now),
    },
  });
  await prisma.salesAuditLog.create({
    data: {
      action: 'import',
      collection: 'sales_records',
      userId: null,
      userEmail: 'system:server-import',
      metadata: { batchId, recordCount: enriched.length, source: 'csv_upload', fileName: CSV_PATH.split('/').pop() },
      timestamp: BigInt(now),
    },
  });
  console.log(`\ncommitted ${enriched.length} records, batch ${batchId}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
