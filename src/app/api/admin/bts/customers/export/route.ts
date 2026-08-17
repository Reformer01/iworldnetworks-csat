import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { unauthorized, tooMany, forbidden, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { btsReadsDb, listBtsCustomersDb, type BtsCustomerDoc } from '@/lib/bts-db';
import { getAdminFirestore } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

const FETCH_LIMIT = 5000;

export async function GET(request: NextRequest) {
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

    let records: BtsCustomerDoc[];
    if (btsReadsDb()) {
      records = await listBtsCustomersDb();
    } else {
      const db = getAdminFirestore();
      const snapshot = await db.collection('bts_customers').orderBy('createdAt', 'desc').limit(FETCH_LIMIT).get();
      records = snapshot.docs.filter((doc) => !doc.data().deletedAt).map((doc) => ({ id: doc.id, ...doc.data() }) as BtsCustomerDoc);
    }

    const headers = [
      'Serial Number',
      'Customer Name',
      'BTS Site',
      'Region',
      'Status',
      'Account Type',
      'MRC',
      'Plan Code',
      'Imported (createdAt)',
      'Edited By',
      'Updated At',
    ];

    const csvRows = records.map((r) => [
      r.serialNumber ?? '',
      escapeCsv(r.customerName || ''),
      escapeCsv(r.btsName || ''),
      r.region || '',
      r.status || '',
      r.accountType || '',
      r.mrc ?? 0,
      escapeCsv(r.planCode || ''),
      r.createdAt ? new Date(r.createdAt).toISOString() : '',
      escapeCsv(r.editedBy || ''),
      r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    ]);

    const csv = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bts-customers-export.csv"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-customers-export] GET error', { error: message });
    return serverError();
  }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
