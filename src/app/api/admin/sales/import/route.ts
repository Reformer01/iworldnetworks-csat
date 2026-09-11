import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { salesImportSchema } from '@/lib/validations/sales';
import { getRegionForLocation, getSegmentForPlan, getQuarterFromMonth, getBtsForLocation } from '@/lib/sales-staff';
import { resolveCustomerBts } from '@/lib/bts-resolver';
import { success, error, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit-log';
import { logError } from '@/lib/logger';
import { createSalesRecordDb, createSalesImportDb } from '@/lib/sales-db';
import { clearRouteCache } from '@/lib/route-cache';

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

    const batchId = `import_${Date.now()}`;
    const now = Date.now();
    const enrichedRecords = await Promise.all(
      records.map(async (r) => {
        // UISP-first BTS attribution (falls back to static station list).
        const resolved = await resolveCustomerBts(r.customerName);
        const suggestedBts = getBtsForLocation(r.location || '');
        const assignedBts = r.bts || resolved?.btsName || suggestedBts[0]?.name || '';
        return {
          ...r,
          region: getRegionForLocation(r.location || ''),
          segment: r.planCode ? getSegmentForPlan(r.planCode) : 'ENTERPRISE',
          quarter: r.quarter || getQuarterFromMonth(r.month),
          bts: assignedBts,
          importBatchId: batchId,
          customerType: r.customerType ?? 'new',
          createdAt: now,
          updatedAt: now,
        };
      }),
    );

    // MariaDB-first batch insert. Firestore mirror is skipped for imports
    // (hundreds/thousands of writes would blow the write quota; the hourly
    // picture is preserved by the DB).
    for (const record of enrichedRecords) {
      await createSalesRecordDb(record);
    }

    await createSalesImportDb({
      batchId,
      source,
      fileName: fileName || '',
      recordCount: enrichedRecords.length,
      importedBy: admin.email,
    });

    await writeAuditLog({
      action: 'import',
      collection: 'sales_records',
      userId: admin.uid,
      userEmail: admin.email,
      metadata: { batchId, recordCount: enrichedRecords.length, source, fileName },
    });

    clearRouteCache();

    return success({ batchId, recordCount: enrichedRecords.length }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-import] POST error', { error: message });
    return serverError();
  }
}
