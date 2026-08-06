import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError, logInfo } from '@/lib/logger';
import { btsStations, BTS_REGIONS, isBtsRegion, getStationsByRegion, findBtsMatch } from '@/lib/bts-data';
import type { BtsAuditRecord } from '@/lib/sales-types';
import { getRegionForLocation } from '@/lib/sales-staff';
import { parseCSV } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const BATCH_MAX = 400;

interface BtsCustomerRow {
  serialNumber: number;
  customerName: string;
  btsName: string;
  status: string;
  accountType: string;
  mrc: number;
  planCode: string;
}

interface BtsSiteSummary {
  btsName: string;
  matchedBtsName: string | null;
  matchStatus: 'matched' | 'unmatched';
  region: string;
  totalCustomers: number;
  activeCustomers: number;
  enterpriseCustomers: number;
  retailCustomers: number;
  smeCustomers: number;
  residentialCustomers: number;
  partnersHosts: number;
  neighbourhoodCustomers: number;
  totalMrr: number;
}

const ACCOUNT_TYPE_MAP: Record<string, string> = {
  enterprise: 'ENTERPRISE',
  retail: 'RETAIL',
  sme: 'SME',
  residential: 'RESIDENTIAL',
  'partners & hosts': 'PARTNERS_HOSTS',
  partner: 'PARTNERS_HOSTS',
  neighbourhood: 'NEIGHBOURHOOD',
  neighborhood: 'NEIGHBOURHOOD',
};

function parseNaira(value: string): number {
  if (!value || value === '—' || value === '-') return 0;
  const cleaned = value.replace(/^[₦Nn\s,#]+/, '').trim();
  const num = parseFloat(cleaned.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

function mapAccountType(raw: string): string {
  const key = raw.trim().toLowerCase();
  return ACCOUNT_TYPE_MAP[key] || 'OTHER';
}

/**
 * Auto-create/refresh BTS audit records for matched sites so imported data
 * shows up on the BTS audit page for the current audit period.
 *
 * Existing records are updated with fresh customer/revenue metrics only;
 * manually-entered fields (status, siteType, address, outages, etc.) are preserved.
 */
async function syncAuditRecords(
  db: FirebaseFirestore.Firestore,
  summaries: BtsSiteSummary[],
  regionStations: typeof btsStations,
  now: number,
): Promise<{ created: number; updated: number }> {
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
      await db
        .collection('bts_latest_audit')
        .doc(btsName)
        .set({ ...existingDoc.data(), ...metrics, id: existingDoc.id }, { merge: true });
      updated++;
      continue;
    }

    const record: BtsAuditRecord = {
      btsName,
      ...(station?.id !== undefined ? { btsId: station.id } : {}),
      region: summary.region || getRegionForLocation(station?.region || ''),
      siteType: 'Tower',
      status: summary.activeCustomers > 0 ? 'Active' : 'Inactive',
      ...(station?.host ? { host: station.host } : {}),
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
    await db
      .collection('bts_latest_audit')
      .doc(btsName)
      .set({ ...record, id: docRef.id });
    created++;
  }

  logInfo('[bts-customers-import] Audit sync', { created, updated, period: auditPeriod });
  return { created, updated };
}

function getCurrentAuditPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

async function commitBatchChunked(
  db: ReturnType<typeof getAdminFirestore>,
  operations: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>,
) {
  for (let i = 0; i < operations.length; i += BATCH_MAX) {
    const chunk = operations.slice(i, i + BATCH_MAX);
    const batch = db.batch();
    for (const op of chunk) {
      batch.set(op.ref, op.data);
    }
    await batch.commit();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 5, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return error('Invalid origin', 403);

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.csv) {
      return error('CSV content required', 400);
    }

    const region = (body.region || '').trim();
    if (!region) {
      return error('Region is required. Select one of: ' + BTS_REGIONS.join(', '), 400);
    }
    if (!isBtsRegion(region)) {
      return error(`Invalid region "${region}". Must be one of: ${BTS_REGIONS.join(', ')}`, 400);
    }

    const csvText = body.csv;
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      return error('No valid rows found in CSV', 400);
    }

    const regionStations = getStationsByRegion(region);

    logInfo('[bts-customers-import] Parsing', { count: rows.length, region, regionStationCount: regionStations.length });

    const customers: BtsCustomerRow[] = [];
    const parseErrors: string[] = [];

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
    }

    if (customers.length === 0) {
      return error('No valid customer records to import', 400);
    }

    const db = getAdminFirestore();
    const importBatchId = `bts_csv_${region.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const now = Date.now();
    const siteMap = new Map<string, BtsSiteSummary>();
    const unmatchedSites = new Set<string>();

    const customerOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];

    for (const customer of customers) {
      const docRef = db.collection('bts_customers').doc();
      customerOps.push({
        ref: docRef,
        data: {
          ...customer,
          region,
          importBatchId,
          createdAt: now,
          updatedAt: now,
        },
      });

      const siteKey = customer.btsName.toLowerCase();
      const existing = siteMap.get(siteKey) || {
        btsName: customer.btsName,
        matchedBtsName: null,
        matchStatus: 'unmatched' as const,
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
      existing.totalMrr += customer.mrc;

      if (customer.status === 'Active') existing.activeCustomers++;
      if (customer.accountType === 'ENTERPRISE') existing.enterpriseCustomers++;
      if (customer.accountType === 'RETAIL') existing.retailCustomers++;
      if (customer.accountType === 'SME') existing.smeCustomers++;
      if (customer.accountType === 'RESIDENTIAL') existing.residentialCustomers++;
      if (customer.accountType === 'PARTNERS_HOSTS') existing.partnersHosts++;
      if (customer.accountType === 'NEIGHBOURHOOD') existing.neighbourhoodCustomers++;

      if (!existing.matchedBtsName) {
        const match = findBtsMatch(customer.btsName, regionStations);
        if (match) {
          existing.matchedBtsName = match.name;
          existing.region = getRegionForLocation(match.region);
          existing.matchStatus = 'matched';
        } else {
          unmatchedSites.add(customer.btsName);
        }
      }

      siteMap.set(siteKey, existing);
    }

    const siteOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];
    const siteSummaries: BtsSiteSummary[] = [];

    for (const [key, summary] of siteMap) {
      const siteRef = db.collection('bts_customer_sites').doc(`${importBatchId}_${key.replace(/[^a-z0-9]/g, '_')}`);
      siteOps.push({
        ref: siteRef,
        data: {
          ...summary,
          region,
          importBatchId,
          createdAt: now,
        },
      });
      siteSummaries.push(summary);
    }

    await commitBatchChunked(db, customerOps);
    await commitBatchChunked(db, siteOps);

    // Auto-create/refresh BTS audit records for matched sites (current audit period)
    const auditSync = await syncAuditRecords(db, siteSummaries, regionStations, now);

    logInfo('[bts-customers-import] Done', {
      customers: customers.length,
      sites: siteSummaries.length,
      matched: siteSummaries.filter((s) => s.matchStatus === 'matched').length,
      unmatched: siteSummaries.filter((s) => s.matchStatus === 'unmatched').length,
      errors: parseErrors.length,
      batchId: importBatchId,
      region,
      auditCreated: auditSync.created,
      auditUpdated: auditSync.updated,
    });

    return success(
      {
        batchId: importBatchId,
        region,
        customerCount: customers.length,
        siteCount: siteSummaries.length,
        matchedCount: siteSummaries.filter((s) => s.matchStatus === 'matched').length,
        unmatchedCount: siteSummaries.filter((s) => s.matchStatus === 'unmatched').length,
        unmatchedSites: unmatchedSites.size > 0 ? Array.from(unmatchedSites) : undefined,
        sites: siteSummaries,
        errors: parseErrors.length > 0 ? parseErrors : undefined,
        auditRecordsCreated: auditSync.created,
        auditRecordsUpdated: auditSync.updated,
      },
      201,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-customers-import] POST error', { error: message });
    return serverError();
  }
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const db = getAdminFirestore();
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    const region = searchParams.get('region');

    let query: FirebaseFirestore.Query = db.collection('bts_customer_sites').orderBy('createdAt', 'desc');
    if (batchId) query = query.where('importBatchId', '==', batchId);
    if (region) query = query.where('region', '==', region);

    const snapshot = await query.limit(200).get();
    const sites = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const batchIds = [...new Set(sites.map((s: Record<string, unknown>) => s.importBatchId as string))];

    return success({ sites, count: sites.length, batchIds });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-customers-import] GET error', { error: message });

    if (message.includes('requires an index') || message.includes('FAILED_PRECONDITION')) {
      const indexUrl = message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
      return error(
        `Query requires a Firestore composite index. ${indexUrl ? 'Create it here: ' + indexUrl : 'Run: firebase deploy --only firestore:indexes'}`,
        412,
      );
    }

    return serverError();
  }
}
