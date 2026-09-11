import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin, salesAgentForEmail } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { unauthorized, tooMany, forbidden, serverError, validateOrigin } from '@/lib/api-response';
import type { SalesRecord } from '@/lib/sales-types';
import { logError } from '@/lib/logger';
import { listSalesRecordsDb } from '@/lib/sales-db';

type RecordDoc = SalesRecord & { id: string };

export const dynamic = 'force-dynamic';

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

    // Agents always export — but only their own records.
    const agentName = isSuperAdmin(admin.email) ? undefined : salesAgentForEmail(admin.email);
    const records: RecordDoc[] = agentName
      ? (await listSalesRecordsDb()).filter((r) => r.salesAgent === agentName)
      : await listSalesRecordsDb();

    const headers = [
      'Serial Number',
      'Customer Name',
      'Location',
      'Region',
      'Plan Code',
      'MRC',
      'NRC',
      'Sale Date',
      'Quarter',
      'Month',
      'Package Type',
      'Sales Agent',
      'Means of Sale',
      'Account Status',
      'Status Notes',
      'Customer Type',
      'Revived By Agent',
      'BTS',
      'Segment',
    ];

    const csvRows = records.map((r) => [
      r.serialNumber,
      escapeCsv(r.customerName || ''),
      escapeCsv(r.location || ''),
      r.region || '',
      escapeCsv(r.planCode || ''),
      r.mrc || 0,
      r.nrc || 0,
      r.saleDate || '',
      r.quarter || '',
      r.month || '',
      r.packageType || '',
      escapeCsv(r.salesAgent || ''),
      r.meansOfSale || '',
      r.accountStatus || '',
      escapeCsv(r.statusNotes || ''),
      r.customerType || 'new',
      escapeCsv(r.revivedByAgent || ''),
      r.bts || '',
      r.segment || '',
    ]);

    const csv = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sales-records-export.csv"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[sales-export] GET error', { error: message });
    return serverError();
  }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
