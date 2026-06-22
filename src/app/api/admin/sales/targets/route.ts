import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { salesTargetSchema } from '@/lib/validations/sales';
import { salesAgents, regionalTargets } from '@/lib/sales-staff';
import { success, error, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
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
    const snapshot = await db.collection('sales_targets').orderBy('month', 'desc').limit(60).get();
    const targets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return success({
      targets,
      staticTargets: {
        agents: salesAgents.map((a) => ({ name: a.name, region: a.region, annualRevenueTarget: a.annualTarget, annualCustomerTarget: a.annualCustomerTarget })),
        regions: regionalTargets,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-targets] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) {
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

    const validation = salesTargetSchema.safeParse(body);
    if (!validation.success) {
      return error('Validation failed.', 400, { errors: validation.error.flatten().fieldErrors });
    }

    const db = getAdminFirestore();
    const docRef = await db.collection('sales_targets').add({
      ...validation.data,
      createdAt: Date.now(),
    });

    return success({ id: docRef.id }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-targets] POST error', { error: message });
    return serverError();
  }
}
