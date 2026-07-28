import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit-log';
import type { SupportRevenueDoc } from '@/lib/support-revenue-types';
import { error, serverError, unauthorized, forbidden, tooMany, notFound, success, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';

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

    const db = getAdminFirestore();
    let query = db.collection('support_revenue').orderBy('createdAt', 'desc');

    const { searchParams } = new URL(request.url);
    const projectType = searchParams.get('projectType');
    if (projectType) query = query.where('projectType', '==', projectType);

    const snapshot = await query.limit(2000).get();
    const docs = snapshot.docs;

    const records: SupportRevenueDoc[] = docs
      .filter((doc) => !doc.data().deletedAt)
      .map((doc) => ({ id: doc.id, ...doc.data() }) as SupportRevenueDoc);

    return success({ records, count: records.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-support-revenue] GET error', { error: message });

    if (message.includes('requires an index') || message.includes('FAILED_PRECONDITION')) {
      return error('Query requires a Firestore composite index. Run: firebase deploy --only firestore:indexes', 412);
    }

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

    const { location, projectType, items, description, customerName } = body;
    const totalAmount =
      items?.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0) || 0;

    const db = getAdminFirestore();
    const docRef = await db.collection('support_revenue').add({
      location,
      projectType,
      items,
      description,
      customerName,
      totalAmount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await writeAuditLog({
      action: 'create',
      collection: 'support_revenue',
      recordId: docRef.id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: body,
    });

    return success({ id: docRef.id }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-support-revenue] POST error', { error: message });
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
    if (!isSuperAdmin(admin.email) && !isEditor(admin.email)) {
      return error('Only authorized editors can modify records.', 403);
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Record ID required.');
    }

    const { id, items, ...rest } = body;
    const ALLOWED_FIELDS = ['location', 'projectType', 'description', 'customerName', 'totalAmount'];
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of ALLOWED_FIELDS) {
      if (key in rest) updateData[key] = rest[key];
    }

    const db = getAdminFirestore();
    const docRef = db.collection('support_revenue').doc(id);
    const prev = await docRef.get();

    if (!prev.exists) {
      return notFound('Record not found.');
    }

    const updates: Record<string, unknown> = { ...updateData };

    if (items !== undefined) {
      updates.totalAmount =
        items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0) || 0;
    }

    await docRef.update(updates);

    await writeAuditLog({
      action: 'update',
      collection: 'support_revenue',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: updateData,
      previousState: prev.data() as Record<string, unknown>,
    });

    return success({});
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-support-revenue] PUT error', { error: message });
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
      return error('Only authorized editors can delete records.', 403);
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Record ID required.');
    }

    const db = getAdminFirestore();
    const docRef = db.collection('support_revenue').doc(body.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return notFound('Record not found.');
    }

    await docRef.update({
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await writeAuditLog({
      action: 'delete',
      collection: 'support_revenue',
      recordId: body.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: doc.data() as Record<string, unknown>,
    });

    return success({ action: 'deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-support-revenue] DELETE error', { error: message });
    return serverError();
  }
}
