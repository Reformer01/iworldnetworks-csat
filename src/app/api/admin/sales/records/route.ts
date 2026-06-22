import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { salesRecordSchema } from '@/lib/validations/sales';
import { getRegionForLocation, getSegmentForPlan, getQuarterFromMonth } from '@/lib/sales-staff';
import { success, error, unauthorized, forbidden, tooMany, notFound, serverError, validateOrigin } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit-log';
import type { SalesRecord } from '@/lib/sales-types';
import { logError } from '@/lib/logger';

type RecordDoc = SalesRecord & { id: string };

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const status = searchParams.get('status');
    const agent = searchParams.get('agent');
    const importBatchId = searchParams.get('importBatchId');
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 500);

    const db = getAdminFirestore();
    let query: FirebaseFirestore.Query = db.collection('sales_records').limit(2000);

    if (region) query = query.where('region', '==', region);
    if (status) query = query.where('accountStatus', '==', status);
    if (agent) query = query.where('salesAgent', '==', agent);
    if (importBatchId) query = query.where('importBatchId', '==', importBatchId);

    const snapshot = await query.get();
    const records: RecordDoc[] = snapshot.docs
      .filter((doc) => !doc.data().deletedAt)
      .map((doc) => ({ id: doc.id, ...doc.data() } as RecordDoc));

    const filtered = search
      ? records.filter((r) =>
          r.customerName?.toLowerCase().includes(search) ||
          r.location?.toLowerCase().includes(search) ||
          r.planCode?.toLowerCase().includes(search) ||
          r.salesAgent?.toLowerCase().includes(search),
        )
      : records;

    filtered.sort((a, b) => (b.serialNumber || 0) - (a.serialNumber || 0));

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return success({
      records: paged,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-records] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => null);
    if (!body) {
      return error('Invalid JSON body.');
    }

    const validation = salesRecordSchema.safeParse(body);
    if (!validation.success) {
      return error('Validation failed.', 400, { errors: validation.error.flatten().fieldErrors });
    }

    const data = validation.data;
    const region = getRegionForLocation(data.location);
    const segment = getSegmentForPlan(data.planCode);
    const quarter = data.quarter || getQuarterFromMonth(data.month);

    const db = getAdminFirestore();
    const docRef = await db.collection('sales_records').add({
      ...data,
      region,
      segment,
      quarter,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await writeAuditLog({
      action: 'create',
      collection: 'sales_records',
      recordId: docRef.id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: { ...data, region, segment, quarter },
    });

    return success({ id: docRef.id }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-records] POST error', { error: message });
    return serverError();
  }
}

export async function PUT(request: NextRequest) {
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
    if (!isSuperAdmin(admin.email)) {
      return error('Only super admins can edit records.', 403);
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Record ID required.');
    }

    const { id, ...updateData } = body;
    const validation = salesRecordSchema.partial().safeParse(updateData);
    if (!validation.success) {
      return error('Validation failed.', 400, { errors: validation.error.flatten().fieldErrors });
    }

    const db = getAdminFirestore();
    const docRef = db.collection('sales_records').doc(id);
    const prev = await docRef.get();

    if (!prev.exists) {
      return notFound('Record not found.');
    }

    await docRef.update({
      ...validation.data,
      region: validation.data.location ? getRegionForLocation(validation.data.location) : undefined,
      segment: validation.data.planCode ? getSegmentForPlan(validation.data.planCode) : undefined,
      updatedAt: Date.now(),
    });

    await writeAuditLog({
      action: 'update',
      collection: 'sales_records',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: validation.data,
      previousState: prev.data() as Record<string, unknown>,
    });

    return success({});
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-records] PUT error', { error: message });
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
    if (!isSuperAdmin(admin.email)) {
      return error('Only super admins can delete records.', 403);
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Record ID required.');
    }

    const db = getAdminFirestore();
    const docRef = db.collection('sales_records').doc(body.id);
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
      collection: 'sales_records',
      recordId: body.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: doc.data() as Record<string, unknown>,
    });

    return success({ action: 'deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-records] DELETE error', { error: message });
    return serverError();
  }
}
