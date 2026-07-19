import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError, logInfo } from '@/lib/logger';
import type { BtsAuditRecord, BtsStatus, BtsSiteType } from '@/lib/sales-types';

export const dynamic = 'force-dynamic';

type BtsAuditDoc = BtsAuditRecord & { id: string };

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
    const status = searchParams.get('status') as BtsStatus | null;
    const region = searchParams.get('region');
    const auditPeriod = searchParams.get('auditPeriod');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 200);

    const db = getAdminFirestore();
    let query: FirebaseFirestore.Query = db.collection('bts_audit_records').orderBy('btsName', 'asc');

    if (status) query = query.where('status', '==', status);
    if (region) query = query.where('region', '==', region);
    if (auditPeriod) query = query.where('auditPeriod', '==', auditPeriod);

    const snapshot = await query.get();
    const records: BtsAuditDoc[] = snapshot.docs
      .filter((doc) => !doc.data().deletedAt)
      .map((doc) => ({ id: doc.id, ...doc.data() }) as BtsAuditDoc);

    // Apply pagination in memory (since we filtered deletedAt)
    const total = records.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paged = records.slice(start, start + pageSize);

    return success({ records: paged, total, page, pageSize, totalPages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-audit] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return error('Invalid origin', 403);

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return error('Invalid JSON body', 400);
    }

    // Validate required fields
    const required = ['btsName', 'region', 'siteType', 'status'];
    for (const field of required) {
      if (!body[field]) {
        return error(`Missing required field: ${field}`, 400);
      }
    }

    const db = getAdminFirestore();

    // Check for duplicate BTS name in same audit period
    const auditPeriod = body.auditPeriod || getCurrentAuditPeriod();
    const existing = await db
      .collection('bts_audit_records')
      .where('btsName', '==', body.btsName)
      .where('auditPeriod', '==', auditPeriod)
      .where('deletedAt', '==', null)
      .limit(1)
      .get();

    if (!existing.empty) {
      return error('BTS audit record already exists for this period', 409);
    }

    const now = Date.now();
    const record: BtsAuditRecord = {
      btsName: body.btsName,
      btsId: body.btsId || null,
      region: body.region,
      siteType: body.siteType,
      status: body.status,
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      address: body.address || null,
      host: body.host || null,
      activeCustomers: body.activeCustomers || 0,
      totalCustomers: body.totalCustomers || 0,
      enterpriseCustomers: body.enterpriseCustomers || 0,
      retailCustomers: body.retailCustomers || 0,
      monthlyRecurringRevenue: body.monthlyRecurringRevenue || 0,
      targetMrr: body.targetMrr || 5000000,
      attainmentPercentage: body.attainmentPercentage || 0,
      nrcRevenue: body.nrcRevenue || 0,
      totalRevenue: body.totalRevenue || 0,
      splynxRouterIds: body.splynxRouterIds || [],
      splynxRouterNames: body.splynxRouterNames || [],
      lastSplynxSync: body.lastSplynxSync || null,
      lastOutageDate: body.lastOutageDate || null,
      outageCountThisMonth: body.outageCountThisMonth || 0,
      maintenanceNotes: body.maintenanceNotes || null,
      auditedBy: admin.email,
      auditedAt: now,
      auditPeriod,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('bts_audit_records').add(record);

    // Also update the latest snapshot collection for quick dashboard access
    await db
      .collection('bts_latest_audit')
      .doc(body.btsName)
      .set({
        ...record,
        id: docRef.id,
      });

    logInfo('[bts-audit] Created audit record', { btsName: body.btsName, id: docRef.id, auditPeriod });

    return success({ id: docRef.id, ...record }, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-audit] POST error', { error: message });
    return serverError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return error('Invalid origin', 403);

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Record ID required', 400);
    }

    const { id, ...updateData } = body;
    const db = getAdminFirestore();
    const docRef = db.collection('bts_audit_records').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return error('Record not found', 404);
    }

    const updates = {
      ...updateData,
      auditedBy: admin.email,
      auditedAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Recalculate attainment if MRR or target changed
    if (updates.monthlyRecurringRevenue !== undefined || updates.targetMrr !== undefined) {
      const current = doc.data() as BtsAuditRecord;
      const mrr = updates.monthlyRecurringRevenue ?? current.monthlyRecurringRevenue;
      const target = updates.targetMrr ?? current.targetMrr;
      updates.attainmentPercentage = target > 0 ? Math.round((mrr / target) * 10000) / 100 : 0;
    }

    await docRef.update(updates);

    // Update latest snapshot
    const updated = { ...doc.data(), ...updates } as BtsAuditRecord;
    await db
      .collection('bts_latest_audit')
      .doc(updated.btsName)
      .set({ ...updated, id });

    logInfo('[bts-audit] Updated audit record', { id, btsName: updated.btsName });

    return success({ id, ...updates });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-audit] PUT error', { error: message });
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return error('Invalid origin', 403);

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Record ID required', 400);
    }

    const db = getAdminFirestore();
    const docRef = db.collection('bts_audit_records').doc(body.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return error('Record not found', 404);
    }

    await docRef.update({ deletedAt: Date.now(), updatedAt: Date.now() });

    // Also mark deleted in latest snapshot
    const docData = doc.data();
    if (docData?.btsName) {
      await db.collection('bts_latest_audit').doc(docData.btsName).update({ deletedAt: Date.now() });
    }

    logInfo('[bts-audit] Deleted audit record', { id: body.id });

    return success({ action: 'deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-audit] DELETE error', { error: message });
    return serverError();
  }
}

function getCurrentAuditPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}
