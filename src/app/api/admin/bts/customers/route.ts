import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, tooMany, notFound, serverError, validateOrigin } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit-log';
import { logError } from '@/lib/logger';

export interface BtsCustomerDoc {
  id: string;
  serialNumber?: number;
  customerName?: string;
  btsName?: string;
  status?: string;
  accountType?: string;
  mrc?: number;
  planCode?: string;
  region?: string;
  importBatchId?: string;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface BtsCustomersSummary {
  totalCustomers: number;
  activeCustomers: number;
  totalMrr: number;
  enterpriseCustomers: number;
  retailCustomers: number;
  smeCustomers: number;
  residentialCustomers: number;
  partnersHosts: number;
  neighbourhoodCustomers: number;
  otherCustomers: number;
}

export const dynamic = 'force-dynamic';

const FETCH_LIMIT = 5000;

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const status = searchParams.get('status');
    const accountType = searchParams.get('accountType');
    const importBatchId = searchParams.get('importBatchId');
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 500);

    const db = getAdminFirestore();
    const snapshot = await db.collection('bts_customers').orderBy('createdAt', 'desc').limit(FETCH_LIMIT).get();

    let records: BtsCustomerDoc[] = snapshot.docs
      .filter((doc) => !doc.data().deletedAt)
      .map((doc) => ({ id: doc.id, ...doc.data() }) as BtsCustomerDoc);

    if (region) records = records.filter((r) => r.region === region);
    if (status) records = records.filter((r) => r.status === status);
    if (accountType) records = records.filter((r) => r.accountType === accountType);
    if (importBatchId) records = records.filter((r) => r.importBatchId === importBatchId);
    if (search) {
      records = records.filter(
        (r) =>
          r.customerName?.toLowerCase().includes(search) ||
          r.btsName?.toLowerCase().includes(search) ||
          r.planCode?.toLowerCase().includes(search) ||
          r.region?.toLowerCase().includes(search),
      );
    }

    const summary: BtsCustomersSummary = records.reduce(
      (acc, r) => {
        acc.totalCustomers++;
        if (r.status === 'Active') acc.activeCustomers++;
        acc.totalMrr += r.mrc || 0;
        if (r.accountType === 'ENTERPRISE') acc.enterpriseCustomers++;
        else if (r.accountType === 'RETAIL') acc.retailCustomers++;
        else if (r.accountType === 'SME') acc.smeCustomers++;
        else if (r.accountType === 'RESIDENTIAL') acc.residentialCustomers++;
        else if (r.accountType === 'PARTNERS_HOSTS') acc.partnersHosts++;
        else if (r.accountType === 'NEIGHBOURHOOD') acc.neighbourhoodCustomers++;
        else acc.otherCustomers++;
        return acc;
      },
      {
        totalCustomers: 0,
        activeCustomers: 0,
        totalMrr: 0,
        enterpriseCustomers: 0,
        retailCustomers: 0,
        smeCustomers: 0,
        residentialCustomers: 0,
        partnersHosts: 0,
        neighbourhoodCustomers: 0,
        otherCustomers: 0,
      },
    );

    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paged = records.slice(start, start + pageSize);

    return success({
      records: paged,
      total,
      page,
      pageSize,
      totalPages,
      summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-customers] GET error', { error: message });
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }
    if (!isSuperAdmin(admin.email) && !isEditor(admin.email)) {
      return error('Only authorised editors can delete records.', 403);
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Record ID required.');
    }

    const db = getAdminFirestore();
    const docRef = db.collection('bts_customers').doc(body.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return notFound('Record not found.');
    }

    if (doc.data()?.deletedAt) {
      return success({ action: 'already_deleted' });
    }

    await docRef.update({ deletedAt: Date.now(), updatedAt: Date.now() });

    await writeAuditLog({
      action: 'delete',
      collection: 'bts_customers',
      recordId: body.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: doc.data() as Record<string, unknown>,
    });

    return success({ action: 'deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-customers] DELETE error', { error: message });
    return serverError();
  }
}
