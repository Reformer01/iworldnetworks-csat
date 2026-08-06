#!/usr/bin/env node
/**
 * Demo Data Seed Script
 *
 * Populates demo data for the presentation. Fills empty collections so every
 * admin page has representative records:
 *
 *   - bts_audit_records   (critical: BTS audit page query otherwise shows empty)
 *   - sales_records       (extra records in the current quarter)
 *   - sales_targets       (monthly targets per region/agent)
 *   - tickets             (support tickets assigned to real staff)
 *   - feedbacks           (a few more support surveys)
 *   - support_revenue     (a few more support project records)
 *
 * Idempotent: uses marker docs so re-running skips previously seeded records.
 *
 * Usage: node scripts/seed-demo-data.mjs [--dry-run]
 */

import { existsSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';

for (const envFile of ['.env.local', '.env']) {
  if (existsSync(envFile)) {
    loadDotenv({ path: envFile, override: false });
  }
}

// --- Audit period helpers (mirrors src/app/admin/bts/audit/page.tsx) ---

function getWeekNumber(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function getCurrentAuditPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-W${String(getWeekNumber(now)).padStart(2, '0')}`;
}

// --- Deterministic RNG ---

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomOf(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

// --- BTS stations (matches bts-data.ts) ---

const BTS_STATIONS = [
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
  { id: 33, name: 'Sagamu Extension', region: 'Sagamu', host: 'Mr. Akeem Oriyomi (Mast)' },
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
];

// Map BTS dispatch region -> sales region (as used by the audit form)
const BTS_TO_SALES_REGION = {
  Ibadan: 'Oyo',
  Osogbo: 'Osun',
  Akure: 'Ondo',
  Ota: 'Ogun',
  Sagamu: 'Ogun',
  Ijebu: 'Ogun',
  Abeokuta: 'Ogun',
};

// --- Sales reference data ---

const SALES_REGIONS = ['Ogun', 'Oyo', 'Osun', 'Ondo'];
const SALES_AGENTS_BY_REGION = {
  Ogun: ['Titilade Bakare', 'Henry Adiene', 'Janet Oke'],
  Oyo: ['Jeffery Udoji'],
  Osun: ['Emmanuel Oladimeji', 'Elizabeth Tola'],
  Ondo: ['Ruth Suleimon', 'Elizabeth Tola'],
};

const PLANS = [
  { code: 'H-Lite', segment: 'HOME', mrc: 27500 },
  { code: 'H-Pro', segment: 'HOME', mrc: 43500 },
  { code: 'H-Max', segment: 'HOME', mrc: 36500 },
  { code: 'U-Lite', segment: 'SME', mrc: 32500 },
  { code: 'U-Max', segment: 'SME', mrc: 43500 },
  { code: 'U-Pro', segment: 'SME', mrc: 58000 },
  { code: 'N-10K', segment: 'NEIGHBOURHOOD', mrc: 10000 },
  { code: 'N-15K', segment: 'NEIGHBOURHOOD', mrc: 15000 },
  { code: 'N-22-5K', segment: 'NEIGHBOURHOOD', mrc: 22500 },
  { code: '20Mbps', segment: 'ENTERPRISE', mrc: 120000 },
  { code: '50Mbps', segment: 'ENTERPRISE', mrc: 250000 },
  { code: '100Mbps', segment: 'ENTERPRISE', mrc: 450000 },
];

const LOCATIONS = ['Ibadan', 'Abeokuta', 'Sagamu', 'Ota', 'Ijebu Ode', 'Akure', 'Osogbo', 'Mowe', 'Shagamu', 'Orile Imo', 'Ibo', 'Lagos'];

const LOCATION_TO_REGION = {
  Ibadan: 'Oyo', Mowe: 'Oyo', Ibo: 'Oyo', Lagos: 'Oyo',
  Abeokuta: 'Ogun', Sagamu: 'Ogun', Shagamu: 'Ogun', Ota: 'Ogun', 'Ijebu Ode': 'Ogun', 'Orile Imo': 'Ogun',
  Osogbo: 'Osun', Oshogbo: 'Osun',
  Akure: 'Ondo',
};

const CUSTOMER_NAMES = [
  'Alhaji Rasaq Adebayo', 'Mrs Kehinde Ogunlesi', 'Chief Bamidele Ojo',
  'Dr Fasina Oluwaseun', 'Tola Adeyemi', 'Bisi Oluwole', 'Segun Adewale',
  'Wumi Balogun', 'Pastor Adeola Falade', 'Kunle Ajayi', 'Mrs. Ronke Sodade',
  'Emmanuel Okoro', 'Femi Awe', 'Comfort Oyelade', 'Bode Familusi',
  'Tunde Olawale', 'Ayotunde Bankole', 'Seyi Oladipupo', 'Gbenga Akinpelu', 'Mary Okafor',
];

const MEANS_OF_SALE = ['Door Knocking', 'Walk-in', 'Referral', 'Retailer', 'Social Media', 'Showroom'];
const PACKAGE_TYPES = ['Outright', 'Lease'];
const ACCOUNT_STATUSES = ['Active', 'Inactive', 'Blocked'];

// --- Support staff (matches seed-staff.js) ---

const SUPPORT_STAFF = [
  { id: 'backend-yusuf-femi', name: 'Yusuf Femi' },
  { id: 'backend-ibrahim-gbadamosi', name: 'Ibrahim Gbadamosi' },
  { id: 'backend-omotunde-olamide', name: 'Omotunde Olamide' },
  { id: 'backend-tunji-adebayo', name: 'Tunji Adebayo' },
  { id: 'support-victoria-fokorede', name: 'Victoria Fokorede' },
  { id: 'support-aishat-hamzat', name: 'Aishat Hamzat' },
  { id: 'support-adekomoya-joseph', name: 'Adekomoya Joseph' },
];

const COMPLAINT_TYPES = ['No Connectivity', 'Slow Speed', 'Hardware Issue', 'Installation Issue', 'Billing Issue', 'Other'];
const TICKET_STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
const TICKET_DESCRIPTIONS = [
  'Customer reports zero throughput since this morning.',
  'Internet drops intermittently every few minutes.',
  'ONT shows no LOS; suspected fiber cut in the area.',
  'Customer requests modem upgrade; current unit overheating.',
  'Billing dispute: invoice does not match agreed plan.',
  'New installation pending CPE dispatch and mounting.',
  'Slow speed complaints across the street during peak hours.',
  'Repeated disconnections after the rainstorm.',
];

const PROJECT_TYPES = ['CCTV Installation', 'Fiber Drop Extension', 'Router Replacement', 'UPS Backup', 'Structured Cabling', 'Surveillance Upgrade'];
const SUPPORT_AGENTS = ['Yusuf Femi', 'Ibrahim Gbadamosi', 'Tunji Adebayo', 'Omotunde Olamide'];

// --- Builders ---

function buildAuditRecords(period) {
  const rng = mulberry32(4242);
  const now = Date.now();
  return BTS_STATIONS.map((station) => {
    const region = BTS_TO_SALES_REGION[station.region] || 'Oyo';
    const activeCustomers = 200 + Math.floor(rng() * 1500);
    const totalCustomers = activeCustomers + Math.floor(rng() * 200);
    const enterpriseCustomers = Math.floor(activeCustomers * (0.05 + rng() * 0.12));
    const retailCustomers = totalCustomers - enterpriseCustomers;
    const mrr = activeCustomers * (18000 + rng() * 12000);
    const targetMrr = 5000000;
    const attainment = Math.min(120, Math.round((mrr / targetMrr) * 1000) / 10);
    const isActive = attainment >= 60 && rng() > 0.05;
    return {
      btsName: `${station.name}`,
      btsId: station.id,
      region,
      siteType: randomOf(['Tower', 'Rooftop', 'Indoor', 'Pole'], rng),
      status: isActive ? 'Active' : randomOf(['Inactive', 'Under Maintenance', 'Planned'], rng),
      latitude: Math.round((7 + rng() * 2) * 100000) / 100000,
      longitude: Math.round((3 + rng() * 2) * 100000) / 100000,
      address: `${station.region} area, ${region}`,
      host: station.host,
      activeCustomers,
      totalCustomers,
      enterpriseCustomers,
      retailCustomers,
      monthlyRecurringRevenue: Math.round(mrr),
      targetMrr,
      attainmentPercentage: attainment,
      nrcRevenue: Math.round(activeCustomers * (4000 + rng() * 15000)),
      totalRevenue: Math.round(mrr / 12 + activeCustomers * 6000),
      splynxRouterIds: [1000 + station.id],
      splynxRouterNames: [`${station.name}-R1`],
      lastSplynxSync: now,
      lastOutageDate: rng() > 0.6 ? now - Math.floor(rng() * 7 * 86400000) : 0,
      outageCountThisMonth: Math.floor(rng() * 3),
      maintenanceNotes: rng() > 0.7 ? 'Quarterly battery replacement scheduled.' : '',
      auditedBy: 'admin@iworldnetworks.net',
      auditedAt: now,
      auditPeriod: period,
      createdAt: now,
      updatedAt: now,
    };
  });
}

function buildSalesRecords() {
  const rng = mulberry32(7777);
  const now = Date.now();
  const records = [];
  for (let i = 0; i < 60; i++) {
    const location = randomOf(LOCATIONS, rng);
    const region = LOCATION_TO_REGION[location] || 'Oyo';
    const agent = randomOf(SALES_AGENTS_BY_REGION[region] || ['Titilade Bakare'], rng);
    const plan = randomOf(PLANS, rng);
    const nrc = plan.mrc * (rng() > 0.3 ? 4 : 1) + Math.floor(rng() * 60000);
    const day = 1 + Math.floor(rng() * 28);
    const month = rng() > 0.5 ? 'AUGUST' : 'JULY';
    records.push({
      serialNumber: 9000 + i,
      customerName: randomOf(CUSTOMER_NAMES, rng),
      location,
      region,
      segment: plan.segment,
      nrc: Math.round(nrc),
      mrc: plan.mrc,
      planCode: plan.code,
      saleDate: `2026-${month === 'AUGUST' ? '08' : '07'}-${String(day).padStart(2, '0')}`,
      quarter: 'QUARTER 1',
      month,
      packageType: randomOf(PACKAGE_TYPES, rng),
      salesAgent: agent,
      meansOfSale: randomOf(MEANS_OF_SALE, rng),
      accountStatus: randomOf(ACCOUNT_STATUSES, rng),
      statusNotes: '',
      importBatchId: 'demo-seed',
      customerType: rng() > 0.25 ? 'new' : 'revived',
      revivedByAgent: '',
      bts: randomOf(BTS_STATIONS, rng).name,
      createdAt: now - Math.floor(rng() * 40 * 86400000),
      updatedAt: now,
    });
  }
  return records;
}

function buildSalesTargets() {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targets = [
    { month, region: 'Ogun', agentName: '', targetRevenue: 875000, targetCustomers: 30 },
    { month, region: 'Oyo', agentName: '', targetRevenue: 875000, targetCustomers: 30 },
    { month, region: 'Osun', agentName: '', targetRevenue: 375000, targetCustomers: 13 },
    { month, region: 'Osun', agentName: 'Emmanuel Oladimeji', targetRevenue: 375000, targetCustomers: 13 },
    { month, region: 'Ondo', agentName: '', targetRevenue: 375000, targetCustomers: 12 },
  ];
  return targets.map((t) => ({ ...t, createdAt: Date.now() }));
}

function buildTickets() {
  const rng = mulberry32(9001);
  const now = Date.now();
  const tickets = [];
  for (let i = 0; i < 26; i++) {
    const staff = randomOf(SUPPORT_STAFF, rng);
    const createdAt = now - Math.floor(rng() * 26 * 86400000);
    const status = randomOf(TICKET_STATUSES, rng);
    const isResolved = status === 'resolved' || status === 'closed';
    const resolvedAt = isResolved ? createdAt + (2 + rng() * 20) * 3600000 : 0;
    const location = randomOf(LOCATIONS, rng);
    tickets.push({
      ticketNumber: 1000 + i,
      customerName: randomOf(CUSTOMER_NAMES, rng),
      customerPhone: `+23480${Math.floor(10000000 + rng() * 89999999)}`,
      customerEmail: 'customer@example.com',
      location,
      region: LOCATION_TO_REGION[location] || 'Oyo',
      bts: randomOf(BTS_STATIONS, rng).name,
      complaintType: randomOf(COMPLAINT_TYPES, rng),
      description: randomOf(TICKET_DESCRIPTIONS, rng),
      createdBy: 'support-victoria-fokorede',
      assignedTo: rng() > 0.15 ? staff.id : '',
      escalatedTo: rng() > 0.8 ? randomOf(SUPPORT_STAFF, rng).id : '',
      status,
      createdAt,
      assignedAt: rng() > 0.2 ? createdAt + 3600000 : 0,
      escalatedAt: 0,
      resolvedAt,
      closedAt: resolvedAt,
      slaBreached: rng() > 0.75,
      resolutionNotes: isResolved ? 'Investigated and resolved; customer back online.' : '',
      firstTimeFix: isResolved && rng() > 0.4,
      delayReasons: [],
      delayNotes: '',
      followUps: [],
      createdByAgent: 'support-victoria-fokorede',
      updatedAt: now,
      deletedAt: null,
    });
  }
  return tickets;
}

function buildFeedbacks() {
  const rng = mulberry32(4242);
  const now = Date.now();
  const feedbacks = [];
  for (let i = 0; i < 12; i++) {
    const staff = randomOf(SUPPORT_STAFF, rng);
    const timestamp = now - Math.floor(rng() * 30 * 86400000);
    feedbacks.push({
      customerName: randomOf(CUSTOMER_NAMES, rng),
      category: 'Support',
      location: randomOf(LOCATIONS, rng),
      comment: 'Agent was polite and resolved the issue promptly.',
      staffName: staff.name,
      ratings: {
        professionalism: 4 + Math.floor(rng() * 2),
        responsiveness: 4 + Math.floor(rng() * 2),
        satisfaction: 4 + (rng() > 0.5 ? 1 : 0),
      },
      dateSubmitted: new Date(timestamp).toISOString(),
      timestamp,
      satisfied: rng() > 0.15 ? 'Yes' : 'No',
    });
  }
  return feedbacks;
}

function buildSupportRevenue() {
  const rng = mulberry32(3003);
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const location = randomOf(LOCATIONS, rng);
    const total = 150000 + rng() * 600000;
    rows.push({
      customerName: randomOf(CUSTOMER_NAMES, rng),
      location,
      region: LOCATION_TO_REGION[location] || 'Oyo',
      projectType: randomOf(PROJECT_TYPES, rng),
      items: [
        { name: 'Site visit', quantity: 1, unitPrice: 50000 },
        { name: 'Equipment', quantity: 1, unitPrice: Math.round(total - 50000) },
      ],
      totalAmount: Math.round(total),
      date: new Date(now - rng() * 20 * 86400000).toISOString().slice(0, 10),
      agentName: randomOf(SUPPORT_AGENTS, rng),
      notes: 'Demo record.',
      createdAt: now,
      updatedAt: now,
    });
  }
  return rows;
}

// --- Main ---

async function deleteDemoData(db, period) {
  console.log('🧹 Clearing previously seeded demo data...');
  let deleted = 0;

  // bts_audit_records seeded for the current period
  const audit = await db.collection('bts_audit_records').where('auditPeriod', '==', period).get();
  for (let i = 0; i < audit.docs.length; i += 450) {
    const batch = db.batch();
    for (const doc of audit.docs.slice(i, i + 450)) batch.delete(doc.ref);
    await batch.commit();
  }
  deleted += audit.size;
  console.log(`  bts_audit_records: deleted ${audit.size}`);

  // sales_records flagged with demo-seed importBatchId
  const sales = await db.collection('sales_records').where('importBatchId', '==', 'demo-seed').get();
  for (let i = 0; i < sales.docs.length; i += 450) {
    const batch = db.batch();
    for (const doc of sales.docs.slice(i, i + 450)) batch.delete(doc.ref);
    await batch.commit();
  }
  deleted += sales.size;
  console.log(`  sales_records: deleted ${sales.size}`);

  // sales_targets / tickets were empty before seeding — delete everything
  for (const coll of ['sales_targets', 'tickets']) {
    const docs = await db.collection(coll).get();
    for (let i = 0; i < docs.docs.length; i += 450) {
      const batch = db.batch();
      for (const doc of docs.docs.slice(i, i + 450)) batch.delete(doc.ref);
      await batch.commit();
    }
    deleted += docs.size;
    console.log(`  ${coll}: deleted ${docs.size}`);
  }

  // feedbacks: only the demo-sourced ones (others existed before seeding)
  const demoComments = 'Agent was polite and resolved the issue promptly.';
  const feedbacks = await db.collection('feedbacks').where('comment', '==', demoComments).get();
  for (let i = 0; i < feedbacks.docs.length; i += 450) {
    const batch = db.batch();
    for (const doc of feedbacks.docs.slice(i, i + 450)) batch.delete(doc.ref);
    await batch.commit();
  }
  deleted += feedbacks.size;
  console.log(`  feedbacks (demo): deleted ${feedbacks.size}`);

  // support_revenue: demo-sourced records
  const revenue = await db.collection('support_revenue').where('notes', '==', 'Demo record.').get();
  for (let i = 0; i < revenue.docs.length; i += 450) {
    const batch = db.batch();
    for (const doc of revenue.docs.slice(i, i + 450)) batch.delete(doc.ref);
    await batch.commit();
  }
  deleted += revenue.size;
  console.log(`  support_revenue (demo): deleted ${revenue.size}`);

  // Marker
  await db.collection('seed_meta').doc('demo_seed').delete();
  console.log(`  Total deleted: ${deleted}`);
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
  const period = getCurrentAuditPeriod();

  console.log('🌱 Demo Data Seed — Press Presentation');
  console.log(`   Audit period:    ${period}`);
  console.log(`   Firestore project: ${adminApp.options.projectId}`);
  if (dryRun) console.log('   DRY RUN — no writes will be made');
  console.log('');

  let markerRef = db.collection('seed_meta').doc('demo_seed');
  let alreadySeeded = false;
  let auditAlready = false;
  let salesAlready = false;

  if (process.argv.includes('--reset')) {
    if (dryRun) {
      console.log('(--reset suppressed in dry-run)');
      process.exit(0);
    }
    await deleteDemoData(db, period);
    console.log('');
  } else {
    const markerDoc = await markerRef.get();
    alreadySeeded = markerDoc.exists;
    auditAlready = alreadySeeded && markerDoc.data()?.btsAuditSeeded === true;
    salesAlready = alreadySeeded && markerDoc.data()?.salesRecordsSeeded === true;

    if (alreadySeeded) {
      console.log('⚠️  Demo data already present (marker doc found).');
      if (auditAlready) console.log('   - bts_audit_records already seeded');
      if (salesAlready) console.log('   - sales_records already seeded (importBatchId=demo-seed)');
      console.log('');
      console.log('   Tip: run with --reset to replace existing demo data.');
      console.log('');
    }
  }

  const auditRecords = buildAuditRecords(period);
  const salesRecords = buildSalesRecords();
  const salesTargets = buildSalesTargets();
  const tickets = buildTickets();
  const feedbacks = buildFeedbacks();
  const supportRevenue = buildSupportRevenue();

  console.log('=== Seed Plan ===');
  console.log(`  bts_audit_records: ${alreadySeeded ? 'skipped (always seeded)' : auditRecords.length}`);
  console.log(`  sales_records:     ${alreadySeeded ? 'skipped (always seeded)' : salesRecords.length}`);
  console.log(`  sales_targets:     ${alreadySeeded ? 'skipped (always seeded)' : salesTargets.length}`);
  console.log(`  tickets:           ${alreadySeeded ? 'skipped (always seeded)' : tickets.length}`);
  console.log(`  feedbacks:         ${alreadySeeded ? 'skipped (always seeded)' : feedbacks.length}`);
  console.log(`  support_revenue:   ${alreadySeeded ? 'skipped (always seeded)' : supportRevenue.length}`);
  console.log('');

  if (dryRun) {
    console.log('Sample audit record:');
    console.log(JSON.stringify(auditRecords[0], null, 2));
    process.exit(0);
  }

  async function writeCollection(name, records, opts = {}) {
    const skip = opts.skip || false;
    if (skip) {
      console.log(`  ${name}: skipped (already seeded)`);
      return;
    }
    if (!records.length) {
      console.log(`  ${name}: nothing to write`);
      return;
    }
    let written = 0;
    for (let i = 0; i < records.length; i += 450) {
      const batch = db.batch();
      const chunk = records.slice(i, i + 450);
      for (const rec of chunk) {
        batch.set(db.collection(name).doc(), rec);
      }
      await batch.commit();
      written += chunk.length;
      console.log(`  ${name}: wrote ${written}/${records.length}`);
    }
  }

  await writeCollection('bts_audit_records', auditRecords, { skip: alreadySeeded });
  await writeCollection('sales_records', salesRecords, { skip: alreadySeeded });
  await writeCollection('sales_targets', salesTargets, { skip: alreadySeeded });
  await writeCollection('tickets', tickets, { skip: alreadySeeded });
  await writeCollection('feedbacks', feedbacks, { skip: alreadySeeded });
  await writeCollection('support_revenue', supportRevenue, { skip: alreadySeeded });

  // Persist idempotency marker
  await markerRef.set({
    btsAuditSeeded: true,
    salesRecordsSeeded: true,
    seededAt: Date.now(),
    period,
  });

  console.log('');
  console.log('✅ Demo data seeding complete.');
  const writtenCount = alreadySeeded
    ? 0
    : auditRecords.length + salesRecords.length + salesTargets.length + tickets.length + feedbacks.length + supportRevenue.length;
  console.log(`   Records written: ${writtenCount}`);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err.message || err);
  process.exit(1);
});