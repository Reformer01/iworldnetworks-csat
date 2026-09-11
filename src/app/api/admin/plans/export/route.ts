import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { CUSTOMERS_COLLECTION } from '@/lib/splynx-mirror-types';
import { getSegmentForPlan } from '@/lib/sales-staff';
import { withCache } from '@/lib/route-cache';

export const dynamic = 'force-dynamic';

const FETCH_LIMIT = 5000;

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
    const rows = await withCache(
      `customers-snapshot-${FETCH_LIMIT}`,
      10 * 60 * 1000,
      async () => {
        const snapshot = await db.collection(CUSTOMERS_COLLECTION).orderBy('customerId', 'desc').limit(FETCH_LIMIT).get();
        return snapshot.docs.filter((doc) => !doc.data().deleted).map((doc) => doc.data() as Record<string, unknown>);
      },
      10 * 60 * 1000,
    );

    // Aggregate by plan name (empty/unknown plans are skipped).
    const byPlan = new Map<
      string,
      { plan: string; segment: string; customers: number; active: number; mrrTotal: number }
    >();
    for (const row of rows) {
      const plan = String(row.servicePlan || '').trim();
      if (!plan) continue;
      const entry = byPlan.get(plan) || {
        plan,
        segment: getSegmentForPlan(plan),
        customers: 0,
        active: 0,
        mrrTotal: 0,
      };
      entry.customers++;
      if (row.status === 'active') entry.active++;
      entry.mrrTotal += Number(row.mrrTotal) || 0;
      byPlan.set(plan, entry);
    }

    const summary = [...byPlan.values()].sort((a, b) => b.mrrTotal - a.mrrTotal);

    const header = ['plan', 'segment', 'customers', 'active', 'mrrTotal'];
    const lines = [header.join(',')];
    for (const entry of summary) {
      lines.push(
        [
          csvEscape(entry.plan),
          csvEscape(entry.segment),
          csvEscape(entry.customers),
          csvEscape(entry.active),
          csvEscape(entry.mrrTotal),
        ].join(','),
      );
    }

    const csv = '\uFEFF' + lines.join('\r\n');
    const dateStamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="splynx-plans-${dateStamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-plans-export] GET error', { error: message });
    return serverError();
  }
}
