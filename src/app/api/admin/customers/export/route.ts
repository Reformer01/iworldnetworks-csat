import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const FETCH_LIMIT = 5000;

type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [key: string]: JsonValue };

function csvEscape(value: JsonValue): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function isPositiveNumber(value: JsonValue): value is number {
  return typeof value === 'number' && value > 0;
}

function fmtTimestamp(ms: JsonValue): string {
  return isPositiveNumber(ms) ? new Date(ms).toISOString() : '';
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

    const { searchParams } = new URL(request.url);
    const overdueOnly = searchParams.get('overdue') === 'true';

    const dbRows = await prisma.customer.findMany({
      where: { deleted: false },
      orderBy: { customerId: 'desc' },
      take: FETCH_LIMIT,
    });
    const rows: Array<Record<string, JsonValue>> = dbRows.map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      email: r.email,
      phone: r.phone,
      login: r.login,
      city: r.city,
      status: r.status,
      lifecycle: r.lifecycle,
      online: r.online ?? false,
      mrrTotal: r.mrrTotal,
      accountType: r.accountType,
      category: r.category,
      servicePlan: r.servicePlan,
      lastOnlineAt: r.lastOnlineAt != null ? Number(r.lastOnlineAt) : undefined,
      lastUpdateAt: r.lastUpdateAt != null ? Number(r.lastUpdateAt) : undefined,
      reminder15SentAt: r.reminder15SentAt != null ? Number(r.reminder15SentAt) : undefined,
      reminder30SentAt: r.reminder30SentAt != null ? Number(r.reminder30SentAt) : undefined,
      churnSurveySentAt: r.churnSurveySentAt != null ? Number(r.churnSurveySentAt) : undefined,
      winBackSentAt: r.winBackSentAt != null ? Number(r.winBackSentAt) : undefined,
      firstSyncedAt: r.firstSyncedAt != null ? Number(r.firstSyncedAt) : undefined,
      lastSyncAt: r.lastSyncAt != null ? Number(r.lastSyncAt) : undefined,
      overdueInfo: r.overdueInfo,
    }));

    // Overdue export excludes customers who still have access (online) — they are
    // still-paying customers with outstanding balances, not disconnected debt.
    const filteredRows = overdueOnly
      ? rows.filter(
          (r) =>
            (r.overdueInfo as { hasOverdueInvoice?: boolean } | null | undefined)?.hasOverdueInvoice === true &&
            r.online !== true,
        )
      : rows;

    const header = [
      'customerId',
      'customerName',
      'email',
      'phone',
      'login',
      'city',
      'status',
      'lifecycle',
      'mrrTotal',
      'accountType',
      'category',
      'servicePlan',
      'lastOnlineAt',
      'lastUpdateAt',
      'reminder15SentAt',
      'reminder30SentAt',
      'churnSurveySentAt',
      'winBackSentAt',
      'firstSyncedAt',
      'lastSyncAt',
      ...(overdueOnly ? ['overdueInvoiceNumber', 'overdueDays', 'overdueAmount', 'lastReminderSentAt', 'lastReminderType'] : []),
    ];

    const lines = [header.join(',')];
    for (const row of filteredRows) {
      const baseFields = [
        csvEscape(row.customerId),
        csvEscape(row.customerName),
        csvEscape(row.email),
        csvEscape(row.phone),
        csvEscape(row.login),
        csvEscape(row.city),
        csvEscape(row.status),
        csvEscape(row.lifecycle),
        csvEscape(row.mrrTotal),
        csvEscape(row.accountType),
        csvEscape(row.category),
        csvEscape(row.servicePlan),
        fmtTimestamp(row.lastOnlineAt),
        fmtTimestamp(row.lastUpdateAt),
        fmtTimestamp(row.reminder15SentAt),
        fmtTimestamp(row.reminder30SentAt),
        fmtTimestamp(row.churnSurveySentAt),
        fmtTimestamp(row.winBackSentAt),
        fmtTimestamp(row.firstSyncedAt),
        fmtTimestamp(row.lastSyncAt),
      ];
      if (overdueOnly) {
        const info = row.overdueInfo as
          | {
              invoiceNumber?: string | null;
              overdueDays?: number;
              invoiceAmount?: number;
              lastReminderSentAt?: number | null;
              lastReminderType?: string | null;
            }
          | null
          | undefined;
        const overdueFields = [
          csvEscape(info?.invoiceNumber || ''),
          csvEscape(info?.overdueDays ?? ''),
          csvEscape(info?.invoiceAmount ?? ''),
          fmtTimestamp(info?.lastReminderSentAt),
          csvEscape(info?.lastReminderType || ''),
        ];
        lines.push([...baseFields, ...overdueFields].join(','));
      } else {
        lines.push(baseFields.join(','));
      }
    }

    const csv = '\uFEFF' + lines.join('\r\n');
    const dateStamp = new Date().toISOString().slice(0, 10);
    const prefix = overdueOnly ? 'overdue-' : '';

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="splynx-${prefix}customers-${dateStamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-customers-export] GET error', { error: message });
    return serverError();
  }
}
