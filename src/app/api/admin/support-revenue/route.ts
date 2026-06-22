import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { supportRevenueSchema } from '@/lib/validations/support-revenue';
import { getRegionForLocation } from '@/lib/sales-staff';
import { isSuperAdmin } from '@/lib/admin-config';
import { success, error, unauthorized, forbidden, tooMany, notFound, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';

type Doc = Record<string, unknown> & { id: string };

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) return tooMany();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const projectType = searchParams.get('projectType');

    const db = getAdminFirestore();
    let query: FirebaseFirestore.Query = db.collection('support_revenue').limit(2000);

    if (region) query = query.where('region', '==', region);
    if (projectType) query = query.where('projectType', '==', projectType);

    const snapshot = await query.get();
    const docs: Doc[] = snapshot.docs
      .filter((d) => !d.data().deletedAt)
      .map((d) => ({ id: d.id, ...d.data() } as Doc));

    docs.sort((a, b) => ((b.createdAt as number) || 0) - ((a.createdAt as number) || 0));

    return success({ records: docs, total: docs.length });
  } catch (err: unknown) {
    logError('[support-revenue] GET error', { error: err instanceof Error ? err.message : 'Unknown' });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => null);
    if (!body) return error('Invalid JSON body.');

    const validation = supportRevenueSchema.safeParse(body);
    if (!validation.success) {
      return error('Validation failed.', 400, { errors: validation.error.flatten().fieldErrors });
    }

    const data = validation.data;
    const region = getRegionForLocation(data.location);

    const db = getAdminFirestore();
    const docRef = await db.collection('support_revenue').add({
      ...data,
      region,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return success({ id: docRef.id }, 201);
  } catch (err: unknown) {
    logError('[support-revenue] POST error', { error: err instanceof Error ? err.message : 'Unknown' });
    return serverError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    if (!isSuperAdmin(admin.email)) return forbidden();

    const body = await request.json().catch(() => null);
    if (!body || !body.id) return error('Record ID required.');

    const { id, ...updateData } = body;
    const validation = supportRevenueSchema.partial().safeParse(updateData);
    if (!validation.success) {
      return error('Validation failed.', 400, { errors: validation.error.flatten().fieldErrors });
    }

    const db = getAdminFirestore();
    const docRef = db.collection('support_revenue').doc(id);
    const prev = await docRef.get();
    if (!prev.exists) return notFound('Record not found.');

    await docRef.update({
      ...validation.data,
      region: validation.data.location ? getRegionForLocation(validation.data.location) : undefined,
      updatedAt: Date.now(),
    });

    return success({});
  } catch (err: unknown) {
    logError('[support-revenue] PUT error', { error: err instanceof Error ? err.message : 'Unknown' });
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    if (!isSuperAdmin(admin.email)) return forbidden();

    const body = await request.json().catch(() => null);
    if (!body || !body.id) return error('Record ID required.');

    const db = getAdminFirestore();
    const docRef = db.collection('support_revenue').doc(body.id);
    const doc = await docRef.get();
    if (!doc.exists) return notFound('Record not found.');
    if (doc.data()?.deletedAt) return success({ action: 'already_deleted' });

    await docRef.update({ deletedAt: Date.now(), updatedAt: Date.now() });

    return success({ action: 'deleted' });
  } catch (err: unknown) {
    logError('[support-revenue] DELETE error', { error: err instanceof Error ? err.message : 'Unknown' });
    return serverError();
  }
}
