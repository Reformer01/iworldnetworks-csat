import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, notFound, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceViewer, requireFinanceManager } from '@/lib/finance-access';
import { buildPaystackOverview, extractSegment, isValidPaystackMonth } from '@/lib/finance/paystack-aggregates';
import { buildMonthlySnapshotPayload } from '@/lib/finance/paystack-report';

export const dynamic = 'force-dynamic';

const FETCH_CAP = 5000;
const LIST_CAP = 24;

function monthKeyOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
    const month = (searchParams.get('month') || '').trim();
    if (month) {
      if (!isValidPaystackMonth(month)) return error('month must be YYYY-MM');
      const snapshot = await prisma.paystackMonthlySnapshot.findUnique({ where: { month } });
      if (!snapshot) return notFound('Snapshot not found.');
      return success({ item: snapshot });
    }
    const items = await prisma.paystackMonthlySnapshot.findMany({
      orderBy: { month: 'desc' },
      take: LIST_CAP,
    });
    return success({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-snapshots] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const managerBlock = requireFinanceManager(admin);
    if (managerBlock) return managerBlock;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const month = typeof body.month === 'string' ? body.month.trim() : '';
    if (!isValidPaystackMonth(month)) return error('month must be YYYY-MM');

    const [start, end] = [new Date(`${month}-01T00:00:00.000Z`), new Date(`${month}-01T00:00:00.000Z`)];
    end.setUTCMonth(end.getUTCMonth() + 1);

    const [transactions, links, exceptions] = await Promise.all([
      prisma.paystackTransaction.findMany({
        where: { paidAt: { gte: start, lt: end } },
        orderBy: { paidAt: 'desc' },
        take: FETCH_CAP,
      }),
      prisma.paystackReconciliationLink.findMany({ take: FETCH_CAP }),
      prisma.reconciliationException.findMany({ take: FETCH_CAP }),
    ]);

    const overview = buildPaystackOverview(
      transactions as unknown as Parameters<typeof buildPaystackOverview>[0],
      links as unknown as Parameters<typeof buildPaystackOverview>[1],
      month,
    );

    const segmentMap = new Map<string, { collectedNaira: number; count: number }>();
    for (const row of transactions as unknown as Record<string, unknown>[]) {
      if (String((row as { status?: unknown }).status ?? '').toLowerCase() !== 'success') continue;
      if (monthKeyOf((row as { paidAt?: Date | string | null }).paidAt) !== month) continue;
      const key = extractSegment(row as never) ?? 'Unknown';
      const entry = segmentMap.get(key) ?? { collectedNaira: 0, count: 0 };
      entry.collectedNaira = round2(entry.collectedNaira + (((row as { amount?: unknown }).amount as number) || 0) / 100);
      entry.count += 1;
      segmentMap.set(key, entry);
    }
    const segments = [...segmentMap.entries()]
      .map(([segment, v]) => ({ segment, collectedNaira: v.collectedNaira, count: v.count }))
      .sort((a, b) => b.collectedNaira - a.collectedNaira);

    const reconciliation: Record<string, number> = { total: (links as unknown[]).length };
    for (const link of links as unknown as Record<string, unknown>[]) {
      const status = String(link.status ?? 'unknown').toLowerCase();
      reconciliation[status] = (reconciliation[status] ?? 0) + 1;
    }

    const exceptionRows = exceptions as unknown as Record<string, unknown>[];
    const exceptionsCount: Record<string, number> = { total: exceptionRows.length };
    for (const row of exceptionRows) {
      const status = String(row.status ?? 'open').toLowerCase();
      exceptionsCount[status] = (exceptionsCount[status] ?? 0) + 1;
    }

    const payload = buildMonthlySnapshotPayload({
      month,
      totals: overview.kpis,
      channels: overview.channels,
      regions: overview.regions,
      segments,
      reconciliation,
      exceptions: exceptionsCount,
    });

    const existing = await prisma.paystackMonthlySnapshot.findUnique({ where: { month } });
    const snapshot = existing
      ? await prisma.paystackMonthlySnapshot.update({
          where: { month },
          data: {
            totals: payload.totals as never,
            channels: payload.channels as never,
            regions: payload.regions as never,
            segments: payload.segments as never,
            reconciliation: payload.reconciliation as never,
            exceptions: payload.exceptions as never,
            savedBy: admin.email,
          },
        })
      : await prisma.paystackMonthlySnapshot.create({
          data: {
            month,
            totals: payload.totals as never,
            channels: payload.channels as never,
            regions: payload.regions as never,
            segments: payload.segments as never,
            reconciliation: payload.reconciliation as never,
            exceptions: payload.exceptions as never,
            savedBy: admin.email,
          },
        });
    return success(snapshot);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-snapshots] POST error', { error: message });
    return serverError();
  }
}
