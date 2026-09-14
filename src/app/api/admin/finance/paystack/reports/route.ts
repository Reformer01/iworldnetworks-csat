import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, notFound, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceViewer } from '@/lib/finance-access';
import { extractRegion, extractSegment, isValidPaystackMonth } from '@/lib/finance/paystack-aggregates';
import {
  buildCsv,
  buildCustomersCsv,
  buildExceptionsCsv,
  buildReconciliationCsv,
  buildTransactionsCsv,
  type CsvRow,
} from '@/lib/finance/paystack-report';

export const dynamic = 'force-dynamic';

const FETCH_CAP = 5000;
const REPORT_SCOPES = ['transactions', 'reconciliation', 'exceptions', 'customers', 'snapshot'] as const;
const REPORT_FORMATS = ['csv', 'json'] as const;
type ReportScope = (typeof REPORT_SCOPES)[number];

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function monthKeyOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function csvResponse(scope: ReportScope, csv: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="paystack-${scope}.csv"`,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const viewerBlock = requireFinanceViewer(admin);
    if (viewerBlock) return viewerBlock;

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'json').trim().toLowerCase();
    if (!(REPORT_FORMATS as readonly string[]).includes(format)) return error('format must be csv or json');
    const scope = (searchParams.get('scope') || 'transactions').trim().toLowerCase();
    if (!(REPORT_SCOPES as readonly string[]).includes(scope)) {
      return error(`scope must be one of: ${REPORT_SCOPES.join(', ')}`);
    }
    const month = (searchParams.get('month') || '').trim();
    if (month && !isValidPaystackMonth(month)) return error('month must be YYYY-MM');

    const reportScope = scope as ReportScope;

    if (reportScope === 'transactions') {
      const rows = (await prisma.paystackTransaction.findMany({
        orderBy: { paidAt: 'desc' },
        take: FETCH_CAP,
      })) as unknown as Record<string, unknown>[];
      const inMonth = month ? rows.filter((row) => monthKeyOf(row.paidAt as Date | string | null) === month) : rows;
      const items = inMonth.map((row) => ({
        reference: String(row.reference ?? ''),
        customer: String((row.customerName as string | null) || (row.customerEmail as string | null) || ''),
        customerEmail: (row.customerEmail as string | null) ?? null,
        amountNaira: Math.round((((row.amount as number | null) || 0) / 100) * 100) / 100,
        channel: (row.channel as string | null) ?? null,
        status: String(row.status ?? 'unknown'),
        paidAt: toIso(row.paidAt as Date | string | null),
      }));
      if (format === 'csv') return csvResponse(reportScope, buildTransactionsCsv(items));
      return success({ scope: reportScope, format, month: month || null, items });
    }

    if (reportScope === 'reconciliation') {
      const links = (await prisma.paystackReconciliationLink.findMany({
        take: FETCH_CAP,
      })) as unknown as Record<string, unknown>[];
      const items = links.map((link) => ({
        paystackReference: String(link.paystackReference ?? ''),
        splynxLedgerId: (link.splynxLedgerId as string | null) ?? null,
        method: (link.method as string | null) ?? null,
        confidence: (link.confidence as number | null) ?? null,
        paystackAmountNaira: (link.paystackAmountNaira as number | null) ?? null,
        splynxAmountNaira: (link.splynxAmountNaira as number | null) ?? null,
        varianceNaira: (link.varianceNaira as number | null) ?? null,
        status: String(link.status ?? 'unknown'),
      }));
      if (format === 'csv') return csvResponse(reportScope, buildReconciliationCsv(items));
      return success({ scope: reportScope, format, month: month || null, items });
    }

    if (reportScope === 'exceptions') {
      const rows = (await prisma.reconciliationException.findMany({
        orderBy: { updatedAt: 'desc' },
        take: FETCH_CAP,
      })) as unknown as Record<string, unknown>[];
      const items = rows.map((row) => ({
        id: String(row.id ?? ''),
        kind: String(row.kind ?? ''),
        paystackReference: (row.paystackReference as string | null) ?? null,
        title: String(row.title ?? ''),
        amountNaira: (row.amountNaira as number | null) ?? null,
        ownerEmail: (row.ownerEmail as string | null) ?? null,
        status: String(row.status ?? 'open'),
        followUpAt: toIso(row.followUpAt as Date | string | null),
      }));
      if (format === 'csv') return csvResponse(reportScope, buildExceptionsCsv(items));
      return success({ scope: reportScope, format, month: month || null, items });
    }

    if (reportScope === 'customers') {
      const rows = (await prisma.paystackTransaction.findMany({
        orderBy: { paidAt: 'desc' },
        take: FETCH_CAP,
      })) as unknown as Record<string, unknown>[];
      const cohorts = new Map<
        string,
        {
          email: string | null;
          name: string;
          lifetimeNaira: number;
          frequency: number;
          lastPaidAt: string | null;
          region: string | null;
          segment: string | null;
        }
      >();
      for (const row of rows) {
        if (month && monthKeyOf(row.paidAt as Date | string | null) !== month) continue;
        const email = String(row.customerEmail ?? '')
          .trim()
          .toLowerCase();
        const key = email || `ref:${String(row.reference ?? '')}`;
        const amountNaira = Math.round((((row.amount as number | null) || 0) / 100) * 100) / 100;
        const paidIso = toIso(row.paidAt as Date | string | null);
        const entry = cohorts.get(key) ?? {
          email: (row.customerEmail as string | null) ?? null,
          name: String((row.customerName as string | null) || (row.customerEmail as string | null) || ''),
          lifetimeNaira: 0,
          frequency: 0,
          lastPaidAt: null,
          region: extractRegion(row as never),
          segment: extractSegment(row as never),
        };
        entry.lifetimeNaira = Math.round((entry.lifetimeNaira + amountNaira) * 100) / 100;
        entry.frequency += 1;
        if (paidIso && (!entry.lastPaidAt || paidIso > entry.lastPaidAt)) entry.lastPaidAt = paidIso;
        cohorts.set(key, entry);
      }
      const items = [...cohorts.values()]
        .map((c) => ({ ...c, status: c.frequency > 1 ? 'returning' : 'new' }))
        .sort((a, b) => b.lifetimeNaira - a.lifetimeNaira);
      if (format === 'csv') return csvResponse(reportScope, buildCustomersCsv(items));
      return success({ scope: reportScope, format, month: month || null, items });
    }

    if (month) {
      const snapshot = await prisma.paystackMonthlySnapshot.findUnique({ where: { month } });
      if (!snapshot) return notFound('Snapshot not found.');
      if (format === 'csv') return csvResponse(reportScope, snapshotCsv(snapshot.month, snapshot.totals));
      return success({ scope: reportScope, format, month, item: snapshot });
    }
    const snapshots = await prisma.paystackMonthlySnapshot.findMany({
      orderBy: { month: 'desc' },
      take: 24,
    });
    if (format === 'csv') {
      const rows: CsvRow[] = [];
      for (const snap of snapshots as unknown as { month: string; totals: unknown }[]) {
        const totals = asRecord(snap.totals) ?? {};
        for (const [metric, value] of Object.entries(totals)) {
          rows.push([snap.month, metric, typeof value === 'number' ? value : JSON.stringify(value)]);
        }
      }
      return csvResponse(reportScope, buildCsv(['month', 'metric', 'value'], rows));
    }
    return success({ scope: reportScope, format, month: null, items: snapshots });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-reports] GET error', { error: message });
    return serverError();
  }
}

function snapshotCsv(month: string, totals: unknown): string {
  const rows: CsvRow[] = [];
  for (const [metric, value] of Object.entries(asRecord(totals) ?? {})) {
    rows.push([month, metric, typeof value === 'number' ? value : JSON.stringify(value)]);
  }
  return buildCsv(['month', 'metric', 'value'], rows);
}
