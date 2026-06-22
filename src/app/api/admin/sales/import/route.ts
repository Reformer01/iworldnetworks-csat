import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { salesImportSchema } from '@/lib/validations/sales';
import { getRegionForLocation, getSegmentForPlan, getQuarterFromMonth } from '@/lib/sales-staff';
import { success, error, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit-log';
import { logError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 10, 60 * 1000)) {
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

    const validation = salesImportSchema.safeParse(body);
    if (!validation.success) {
      return error('Validation failed.', 400, { errors: validation.error.flatten().fieldErrors });
    }

    const { records, source, fileName } = validation.data;

    const db = getAdminFirestore();
    const batchId = `import_${Date.now()}`;
    const enrichedRecords = records.map((r) => ({
      ...r,
      region: getRegionForLocation(r.location || ''),
      segment: r.planCode ? getSegmentForPlan(r.planCode) : 'ENTERPRISE',
      quarter: r.quarter || getQuarterFromMonth(r.month),
      importBatchId: batchId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    const batch = db.batch();
    for (const record of enrichedRecords) {
      const docRef = db.collection('sales_records').doc();
      batch.set(docRef, record);
    }
    await batch.commit();

    await db.collection('sales_imports').add({
      batchId,
      source,
      fileName: fileName || '',
      recordCount: enrichedRecords.length,
      importedAt: Date.now(),
      importedBy: admin.email,
      status: 'completed',
    });

    await writeAuditLog({
      action: 'import',
      collection: 'sales_records',
      userId: admin.uid,
      userEmail: admin.email,
      metadata: { batchId, recordCount: enrichedRecords.length, source, fileName },
    });

    return success({ batchId, recordCount: enrichedRecords.length }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-import] POST error', { error: message });
    return serverError();
  }
}
