import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError, logInfo } from '@/lib/logger';
import { btsStations, BTS_REGIONS, isBtsRegion, getStationsByRegion } from '@/lib/bts-data';
import { getRegionForLocation } from '@/lib/sales-staff';

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

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    values.push(current.trim());
    if (values.length !== headers.length) continue;
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }
  return records;
}

function parseNaira(value: string): number {
  if (!value || value === '—' || value === '-') return 0;
  const cleaned = value.replace(/^[₦Nn\s,#]+/, '').trim();
  const num = parseFloat(cleaned.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

function findBtsMatch(siteName: string, regionStations: typeof btsStations): { name: string; region: string } | null {
  const normalized = siteName.toLowerCase().trim();
  // Remove common suffixes/prefixes and brackets for better matching
  const cleaned = normalized
    .replace(/\[[^\]]*\]/g, '') // Remove [brackets] like [Office Core], [Alagbado]
    .replace(/\b(bts|core|office|fm)\b/g, '') // Remove common words
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

function mapAccountType(raw: string): string {
  const key = raw.trim().toLowerCase();
  return ACCOUNT_TYPE_MAP[key] || 'OTHER';
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

    logInfo('[bts-customers-import] Done', {
      customers: customers.length,
      sites: siteSummaries.length,
      matched: siteSummaries.filter((s) => s.matchStatus === 'matched').length,
      unmatched: siteSummaries.filter((s) => s.matchStatus === 'unmatched').length,
      errors: parseErrors.length,
      batchId: importBatchId,
      region,
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
