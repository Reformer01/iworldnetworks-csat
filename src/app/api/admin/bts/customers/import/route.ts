import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError, logInfo } from '@/lib/logger';
import { btsStations } from '@/lib/bts-data';
import { getRegionForLocation } from '@/lib/sales-staff';

export const dynamic = 'force-dynamic';

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
  customerCount: number;
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
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
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

function findBtsMatch(siteName: string): { name: string; region: string } | null {
  const normalized = siteName.toLowerCase().trim();
  for (const bts of btsStations) {
    if (normalized.includes(bts.name.toLowerCase())) {
      return { name: bts.name, region: bts.region };
    }
  }
  for (const bts of btsStations) {
    const btsWords = bts.name.toLowerCase().split(/[\s-/]+/);
    const siteWords = normalized.split(/[\s-/]+/);
    const matchCount = btsWords.filter((w) => siteWords.includes(w)).length;
    if (matchCount >= Math.min(btsWords.length, 2)) {
      return { name: bts.name, region: bts.region };
    }
  }
  return null;
}

function mapAccountType(raw: string): string {
  const key = raw.trim().toLowerCase();
  return ACCOUNT_TYPE_MAP[key] || 'OTHER';
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

    const csvText = body.csv;
    const rows = parseCSV(csvText);

    if (rows.length === 0) {
      return error('No valid rows found in CSV', 400);
    }

    logInfo('[bts-customers-import] Parsed rows', { count: rows.length });

    // Map CSV rows to our schema
    const customers: BtsCustomerRow[] = [];
    const errors: string[] = [];

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
        errors.push(`Row ${i + 2}: Missing customer name`);
        continue;
      }
      if (!siteName) {
        errors.push(`Row ${i + 2}: Missing BTS/Site name for ${customerName}`);
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

    // Save to Firestore
    const db = getAdminFirestore();
    const batch = db.batch();
    const importBatchId = `bts_csv_${Date.now()}`;
    const now = Date.now();

    // Per-site aggregation
    const siteMap = new Map<string, BtsSiteSummary>();

    for (const customer of customers) {
      const docRef = db.collection('bts_customers').doc();
      batch.set(docRef, {
        ...customer,
        importBatchId,
        createdAt: now,
        updatedAt: now,
      });

      const siteKey = customer.btsName.toLowerCase();
      const existing = siteMap.get(siteKey) || {
        btsName: customer.btsName,
        matchedBtsName: null,
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
        customerCount: 0,
      };

      existing.totalCustomers++;
      existing.customerCount++;
      existing.totalMrr += customer.mrc;

      if (customer.status === 'Active') existing.activeCustomers++;
      if (customer.accountType === 'ENTERPRISE') existing.enterpriseCustomers++;
      if (customer.accountType === 'RETAIL') existing.retailCustomers++;
      if (customer.accountType === 'SME') existing.smeCustomers++;
      if (customer.accountType === 'RESIDENTIAL') existing.residentialCustomers++;
      if (customer.accountType === 'PARTNERS_HOSTS') existing.partnersHosts++;
      if (customer.accountType === 'NEIGHBOURHOOD') existing.neighbourhoodCustomers++;

      // Match BTS once per site
      if (!existing.matchedBtsName) {
        const match = findBtsMatch(customer.btsName);
        if (match) {
          existing.matchedBtsName = match.name;
          existing.region = getRegionForLocation(match.region);
        }
      }

      siteMap.set(siteKey, existing);
    }

    // Save per-site summary to bts_customer_sites collection
    const siteSummaries: BtsSiteSummary[] = [];
    for (const [key, summary] of siteMap) {
      const siteRef = db.collection('bts_customer_sites').doc(`${importBatchId}_${key.replace(/[^a-z0-9]/g, '_')}`);
      batch.set(siteRef, {
        ...summary,
        importBatchId,
        createdAt: now,
      });
      siteSummaries.push(summary);

      logInfo('[bts-customers-import] Site summary', {
        site: summary.btsName,
        matched: summary.matchedBtsName,
        customers: summary.totalCustomers,
        active: summary.activeCustomers,
        mrr: summary.totalMrr,
      });
    }

    await batch.commit();

    logInfo('[bts-customers-import] Import complete', {
      customers: customers.length,
      sites: siteSummaries.length,
      errors: errors.length,
      batchId: importBatchId,
    });

    return success(
      {
        batchId: importBatchId,
        customerCount: customers.length,
        siteCount: siteSummaries.length,
        sites: siteSummaries,
        errors: errors.length > 0 ? errors : undefined,
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

    let query = db.collection('bts_customer_sites').orderBy('createdAt', 'desc');
    if (batchId) query = query.where('importBatchId', '==', batchId);

    const snapshot = await query.limit(100).get();
    const sites = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return success({ sites, count: sites.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-customers-import] GET error', { error: message });
    return serverError();
  }
}
