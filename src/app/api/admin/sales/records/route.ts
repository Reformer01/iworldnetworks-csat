import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin, isEditor, canManageSalesRecord, salesAgentForEmail } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { salesRecordSchema } from '@/lib/validations/sales';
import { getRegionForLocation, getSegmentForPlan, getQuarterFromMonth, getAgentByEmail } from '@/lib/sales-staff';
import { getBtsForLocation } from '@/lib/bts-data';
import { resolveCustomerBts } from '@/lib/bts-resolver';
import { success, error, unauthorized, forbidden, tooMany, notFound, serverError, validateOrigin } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit-log';
import { logError } from '@/lib/logger';
import { clearRouteCache } from '@/lib/route-cache';
import {
  listSalesRecordsDb,
  createSalesRecordDb,
  updateSalesRecordDb,
  softDeleteSalesRecordDb,
  getSalesRecordByIdDb,
  mirrorSalesRecordCreated,
  mirrorSalesRecordUpdated,
  mirrorSalesRecordDeleted,
} from '@/lib/sales-db';

export const dynamic = 'force-dynamic';

/**
 * Unified-first BTS attribution (unified Customer mapping, then UISP endpoint
 * scan, then the static station list), shared by create/update/import so BTS
 * data stays accurate everywhere.
 */
async function resolveRecordBts(customerName: string, location: string): Promise<string> {
  const resolved = await resolveCustomerBts(customerName);
  if (resolved?.btsName) return resolved.btsName;
  return getBtsForLocation(location)?.[0]?.name || '';
}

// saleDate is the truth, month/quarter derive from it so edits move the record
function monthNameFromSaleDate(saleDate: string): string | undefined {
  const d = new Date(saleDate);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
}

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

    const isSuper = isSuperAdmin(admin.email);
    const resolvedAgent = !isSuper ? getAgentByEmail(admin.email)?.name : undefined;

    if (!isSuper && !resolvedAgent) {
      return success({ records: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
    }

    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const status = searchParams.get('status');
    const agent = isSuper ? searchParams.get('agent') : resolvedAgent;
    const importBatchId = searchParams.get('importBatchId');
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 500);

    const records = await listSalesRecordsDb({ region, status, agent, importBatchId });

    const filtered = search
      ? records.filter(
          (r) =>
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
    // Agents can only create records under their own name — they may not
    // claim or reassign records to other agents.
    const effectiveAgent =
      isSuperAdmin(admin.email) || isEditor(admin.email) ? data.salesAgent : salesAgentForEmail(admin.email) || data.salesAgent;
    if (!isSuperAdmin(admin.email) && !isEditor(admin.email) && !salesAgentForEmail(admin.email)) {
      return forbidden('Your account is not linked to a sales agent.');
    }

    const region = getRegionForLocation(data.location);
    const segment = getSegmentForPlan(data.planCode);
    const derivedMonth = data.saleDate ? monthNameFromSaleDate(data.saleDate) : undefined;
    const month = derivedMonth || data.month;
    const quarter = getQuarterFromMonth(month);
    const bts = data.bts || (await resolveRecordBts(data.customerName, data.location));
    const now = Date.now();

    const doc = await createSalesRecordDb({
      ...data,
      salesAgent: effectiveAgent,
      region,
      segment,
      month,
      quarter,
      bts,
      customerType: data.customerType ?? 'new',
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog({
      action: 'create',
      collection: 'sales_records',
      recordId: doc.id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: { ...data, region, segment, quarter },
    });

    // Best-effort Firestore mirror (rollback only) — never blocks.
    await mirrorSalesRecordCreated(doc);

    clearRouteCache();

    return success({ id: doc.id }, 201);
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

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Record ID required.');
    }

    const { id, ...updateData } = body;
    const validation = salesRecordSchema.partial().safeParse(updateData);
    if (!validation.success) {
      return error('Validation failed.', 400, { errors: validation.error.flatten().fieldErrors });
    }

    const prev = await getSalesRecordByIdDb(id);
    if (!prev) {
      return notFound('Record not found.');
    }

    // Agents may only touch records that carry their own name, and may not
    // move a record to another agent.
    const isAgentEditor = isSuperAdmin(admin.email) || isEditor(admin.email);
    if (!isAgentEditor && !canManageSalesRecord(admin.email, prev.salesAgent)) {
      return error('You can only modify records under your own name.', 403);
    }
    const changes = validation.data;
    if (!isAgentEditor) {
      changes.salesAgent = prev.salesAgent;
    }

    const derivedMonth = changes.saleDate ? monthNameFromSaleDate(changes.saleDate) : undefined;
    const updated = await updateSalesRecordDb(id, {
      ...changes,
      ...(derivedMonth ? { month: derivedMonth, quarter: getQuarterFromMonth(derivedMonth) } : {}),
      region: changes.location ? getRegionForLocation(changes.location) : undefined,
      segment: changes.planCode ? getSegmentForPlan(changes.planCode) : undefined,
      // Submitted bts wins; otherwise re-resolve (unified-first) only when the
      // name/location actually changed — never a full UISP scan on save.
      bts: changes.bts
        ? changes.bts
        : changes.location || changes.customerName
          ? await resolveRecordBts(changes.customerName || prev.customerName, changes.location || prev.location)
          : undefined,
      updatedAt: Date.now(),
    });
    if (!updated) {
      return notFound('Record not found.');
    }

    await writeAuditLog({
      action: 'update',
      collection: 'sales_records',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: validation.data,
      previousState: { ...prev },
    });

    // Best-effort Firestore mirror (rollback only) — never blocks.
    await mirrorSalesRecordUpdated(id, changes);

    clearRouteCache();

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

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Record ID required.');
    }

    const doc = await getSalesRecordByIdDb(body.id);
    if (!doc) {
      return notFound('Record not found.');
    }
    if (!isSuperAdmin(admin.email) && !isEditor(admin.email) && !canManageSalesRecord(admin.email, doc.salesAgent)) {
      return error('You can only delete records under your own name.', 403);
    }

    if (doc.deletedAt) {
      return success({ action: 'already_deleted' });
    }

    const now = Date.now();
    await softDeleteSalesRecordDb(body.id, now, now);

    await writeAuditLog({
      action: 'delete',
      collection: 'sales_records',
      recordId: body.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: { ...doc },
    });

    // Best-effort Firestore mirror (rollback only) — never blocks.
    await mirrorSalesRecordDeleted(body.id, now, now);

    clearRouteCache();

    return success({ action: 'deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-records] DELETE error', { error: message });
    return serverError();
  }
}
