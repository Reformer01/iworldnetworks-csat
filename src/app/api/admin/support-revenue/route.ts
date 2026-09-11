import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit-log';
import type { SupportRevenueDoc } from '@/lib/support-revenue-types';
import { error, serverError, unauthorized, forbidden, tooMany, notFound, success, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import {
  listSupportRevenueDb,
  createSupportRevenueDb,
  updateSupportRevenueDb,
  softDeleteSupportRevenueDb,
  supportRevenueFromRow,
  mirrorSupportRevenueCreated,
  mirrorSupportRevenueUpdated,
  mirrorSupportRevenueDeleted,
} from '@/lib/support-revenue-db';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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
    const projectType = searchParams.get('projectType');

    const records = await listSupportRevenueDb(projectType, 2000);

    return success({ records, count: records.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-support-revenue] GET error', { error: message });
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

    const {
      location,
      projectType,
      items,
      description,
      customerName,
      saleKind,
      agentName,
      assignedSalesRep,
      bandwidthFrom,
      bandwidthTo,
      date,
      notes,
    } = body;
    const totalAmount =
      items?.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0) || 0;

    const now = Date.now();
    const doc: SupportRevenueDoc = {
      location,
      projectType,
      saleKind,
      agentName,
      assignedSalesRep,
      bandwidthFrom,
      bandwidthTo,
      items,
      description,
      notes,
      date,
      customerName,
      totalAmount,
      createdAt: now,
      updatedAt: now,
    };

    const created = await createSupportRevenueDb(doc);
    void mirrorSupportRevenueCreated(created);

    await writeAuditLog({
      action: 'create',
      collection: 'support_revenue',
      recordId: created.id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: body,
    });

    return success({ id: created.id }, 201);
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
    const ALLOWED_FIELDS: (keyof SupportRevenueDoc)[] = [
      'location',
      'projectType',
      'saleKind',
      'agentName',
      'assignedSalesRep',
      'bandwidthFrom',
      'bandwidthTo',
      'description',
      'notes',
      'date',
      'customerName',
      'totalAmount',
    ];
    const updateData: Partial<SupportRevenueDoc> = { updatedAt: Date.now() };
    for (const key of ALLOWED_FIELDS) {
      if (key in rest) updateData[key] = rest[key];
    }

    const row = await prisma.supportRevenue.findUnique({ where: { id } });
    if (!row || row.deletedAt != null) {
      return notFound('Record not found.');
    }
    const prev = supportRevenueFromRow(row);

    const updates: Partial<SupportRevenueDoc> = { ...updateData };

    if (items !== undefined) {
      updates.items = items;
      updates.totalAmount =
        items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0) || 0;
    }

    const updated = await updateSupportRevenueDb(id, { ...prev, ...updates });
    if (updated) {
      void mirrorSupportRevenueUpdated(id, updates);
    }

    await writeAuditLog({
      action: 'update',
      collection: 'support_revenue',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: updateData,
      previousState: { ...prev },
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

    const row = await prisma.supportRevenue.findUnique({ where: { id: body.id } });
    if (!row) {
      return notFound('Record not found.');
    }

    const now = Date.now();
    await softDeleteSupportRevenueDb(body.id, now, now);
    void mirrorSupportRevenueDeleted(body.id, now, now);

    await writeAuditLog({
      action: 'delete',
      collection: 'support_revenue',
      recordId: body.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: { ...supportRevenueFromRow(row) },
    });

    return success({ action: 'deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-support-revenue] DELETE error', { error: message });
    return serverError();
  }
}
