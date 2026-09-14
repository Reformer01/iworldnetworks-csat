import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceViewer } from '@/lib/finance-access';
import { extractRegion, extractSegment, isValidPaystackMonth } from '@/lib/finance/paystack-aggregates';

export const dynamic = 'force-dynamic';

const FETCH_CAP = 5000;

function parsePage(raw: string | null): number | null {
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function parsePerPage(raw: string | null): number | null {
  if (raw == null || raw === '') return 20;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(200, Math.max(1, Math.floor(n)));
}

function monthKeyOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
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
    const query = (searchParams.get('query') || '').trim().toLowerCase();
    if (month && !isValidPaystackMonth(month)) return error('month must be YYYY-MM');
    const page = parsePage(searchParams.get('page'));
    if (page == null) return error('page must be an integer >= 1');
    const perPage = parsePerPage(searchParams.get('perPage'));
    if (perPage == null) return error('perPage must be a number');

    const rows = await prisma.paystackTransaction.findMany({
      orderBy: { paidAt: 'desc' },
      take: FETCH_CAP,
    });

    const cohorts = new Map<
      string,
      {
        email: string | null;
        name: string;
        totalNaira: number;
        count: number;
        firstPaidAt: string | null;
        lastPaidAt: string | null;
        region: string | null;
        segment: string | null;
      }
    >();

    for (const row of rows as unknown as Parameters<typeof extractRegion>[0][]) {
      if (month && monthKeyOf(row.paidAt) !== month) continue;
      const email = ((row.customerEmail as string | null) || '').trim().toLowerCase();
      const key = email || `ref:${row.reference}`;
      if (query) {
        const hay = [row.customerEmail, row.customerName, row.reference].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(query)) continue;
      }
      const amountNaira = Math.round((((row.amount as number | null) || 0) / 100) * 100) / 100;
      const paidIso = toIso(row.paidAt as Date | string | null);
      const entry = cohorts.get(key) ?? {
        email: (row.customerEmail as string | null) ?? null,
        name: ((row.customerName as string | null) || (row.customerEmail as string | null) || '') as string,
        totalNaira: 0,
        count: 0,
        firstPaidAt: null,
        lastPaidAt: null,
        region: extractRegion(row),
        segment: extractSegment(row),
      };
      entry.email = entry.email ?? (row.customerEmail as string | null) ?? null;
      entry.totalNaira = Math.round((entry.totalNaira + amountNaira) * 100) / 100;
      entry.count += 1;
      if (paidIso && (!entry.firstPaidAt || paidIso < entry.firstPaidAt)) entry.firstPaidAt = paidIso;
      if (paidIso && (!entry.lastPaidAt || paidIso > entry.lastPaidAt)) entry.lastPaidAt = paidIso;
      if (!entry.region) entry.region = extractRegion(row);
      if (!entry.segment) entry.segment = extractSegment(row);
      cohorts.set(key, entry);
    }

    const items = [...cohorts.values()]
      .map((c) => ({
        email: c.email,
        name: c.name,
        lifetimeNaira: c.totalNaira,
        frequency: c.count,
        lastPaidAt: c.lastPaidAt,
        firstPaidAt: c.firstPaidAt,
        region: c.region,
        segment: c.segment,
        status: c.count > 1 ? 'returning' : 'new',
      }))
      .sort((a, b) => b.lifetimeNaira - a.lifetimeNaira);

    const total = items.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
    const start = (page - 1) * perPage;
    return success({ page, perPage, total, totalPages, items: items.slice(start, start + perPage) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-customers] GET error', { error: message });
    return serverError();
  }
}
