import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { CUSTOMERS_COLLECTION, INVOICES_COLLECTION } from '@/lib/splynx-mirror-types';
import { withCache } from '@/lib/route-cache';

export const dynamic = 'force-dynamic';

const FETCH_LIMIT = 10000;

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function fmtTimestamp(ms: unknown): string {
  return typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : '';
}

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

    const db = getAdminFirestore();

    // Customer name lookup: one extra snapshot (cached) so the export is
    // human-readable without scanning the invoice collection per row.
    const [invoiceRows, customerRows] = await Promise.all([
      withCache(
        `invoices-snapshot-${FETCH_LIMIT}`,
        10 * 60 * 1000,
        async () => {
          const snapshot = await db.collection(INVOICES_COLLECTION).orderBy('date', 'desc').limit(FETCH_LIMIT).get();
          return snapshot.docs.map((doc) => doc.data() as Record<string, unknown>);
        },
        10 * 60 * 1000,
      ),
      withCache(
        `customers-name-map-${FETCH_LIMIT}`,
        10 * 60 * 1000,
        async () => {
          const snapshot = await db.collection(CUSTOMERS_COLLECTION).limit(FETCH_LIMIT).get();
          const map = new Map<string, string>();
          for (const doc of snapshot.docs) {
            const data = doc.data();
            const id = data.customerId;
            if (id !== undefined && id !== null) map.set(String(id), String(data.customerName || ''));
          }
          return Array.from(map.entries());
        },
        10 * 60 * 1000,
      ),
    ]);

    const nameMap = new Map(customerRows);

    const header = [
      'invoiceId',
      'number',
      'title',
      'customerId',
      'customerName',
      'total',
      'status',
      'isPaid',
      'date',
      'dueDate',
      'paidAt',
      'reminder15SentAt',
      'reminder30SentAt',
      'syncedAt',
    ];

    const lines = [header.join(',')];
    for (const row of invoiceRows) {
      lines.push(
        [
          csvEscape(row.invoiceId),
          csvEscape(row.number),
          csvEscape(row.title),
          csvEscape(row.customerId),
          csvEscape(nameMap.get(String(row.customerId)) || ''),
          csvEscape(row.total),
          csvEscape(row.status),
          csvEscape(row.isPaid ? 'paid' : 'unpaid'),
          fmtTimestamp(row.date),
          fmtTimestamp(row.dueDate),
          fmtTimestamp(row.paidAt),
          fmtTimestamp(row.reminder15SentAt),
          fmtTimestamp(row.reminder30SentAt),
          fmtTimestamp(row.syncedAt),
        ].join(','),
      );
    }

    const csv = '\uFEFF' + lines.join('\r\n');
    const dateStamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="splynx-invoices-${dateStamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-invoices-export] GET error', { error: message });
    return serverError();
  }
}
