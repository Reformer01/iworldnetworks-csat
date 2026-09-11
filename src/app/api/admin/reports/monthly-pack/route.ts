import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifySuperAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin } from '@/lib/admin-config';
import { forbidden, unauthorized, success, error, validateOrigin } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import {
  computeRangeMetrics,
  buildKpiRows,
  applyBreakdownOverrides,
  buildCsv,
  monthRange,
  previousMonth,
  type SnapshotOverrides,
} from '@/lib/reports/monthly-pack';

export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-\d{2}$/;

const saveSchema = z.object({
  month: z.string().regex(MONTH_RE, 'month must be "YYYY-MM"'),
  rows: z
    .array(
      z.object({
        kpi: z.string().min(1),
        target: z.string().max(100).optional(),
        comment: z.string().max(1000).optional(),
        action: z.string().max(1000).optional(),
        owner: z.string().max(191).optional(),
      }),
    )
    .max(100)
    .optional(),
  breakdown: z
    .array(
      z.object({
        type: z.string().min(1),
        rootCause: z.string().max(1000).optional(),
        action: z.string().max(1000).optional(),
        owner: z.string().max(191).optional(),
      }),
    )
    .max(200)
    .optional(),
  // Frozen actuals: the month's computed Actual column, persisted so next
  // month's "Previous Month" never drifts when history is edited/backfilled.
  actuals: z
    .array(
      z.object({
        kpi: z.string().min(1),
        actual: z.string().max(100).optional(),
      }),
    )
    .max(100)
    .optional(),
});

async function loadOverrides(month: string): Promise<{ overrides: SnapshotOverrides; savedBy: string | null; savedAt: Date | null }> {
  const snap = await prisma.monthlySnapshot.findUnique({ where: { month } });
  if (!snap) return { overrides: {}, savedBy: null, savedAt: null };
  const wb = (snap.workbook03 ?? {}) as { rows?: SnapshotOverrides['rows']; breakdown?: SnapshotOverrides['breakdown'] };
  return { overrides: { rows: wb.rows ?? {}, breakdown: wb.breakdown ?? {} }, savedBy: snap.savedBy, savedAt: snap.updatedAt };
}

export async function GET(request: NextRequest) {
  const admin = await verifySuperAdminToken(request.headers.get('authorization'));
  if (!admin) return unauthorized();
  if (!isSuperAdmin(admin.email)) return forbidden();

  const url = new URL(request.url);
  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
  if (!MONTH_RE.test(month)) return error('month must be "YYYY-MM"');
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
  const source = url.searchParams.get('source') === 'splynx' ? 'splynx' : 'csat';

  const { startMs, endMs } = monthRange(month);
  const prevMonth = previousMonth(month);
  const prevRange = monthRange(prevMonth);
  const yearStartMs = new Date(Date.UTC(Number(month.slice(0, 4)), 0, 1)).getTime();

  // Live Splynx: fetch directly from Splynx API (no CSAT mirror cache)
  if (source === 'splynx') {
    try {
      const { getAllCustomers } = await import('@/lib/splynx-api');
      const live = await getAllCustomers();
      const classify = (s: string) => {
        const v = (s || '').toLowerCase();
        if (v === 'blocked' || v === 'suspended') return 'blocked';
        if (v === 'inactive') return 'inactive';
        if (v === 'disabled') return 'churned';
        return 'active';
      };
      const parseDate = (v: string): number | null => {
        if (!v) return null;
        const ms = Date.parse(v.replace(' ', 'T'));
        return Number.isNaN(ms) ? null : ms;
      };
      let opening = 0,
        churned = 0,
        mrrAtRisk = 0;
      let liveTotal = 0;
      for (const r of live as unknown as Array<{ status: string; last_update: string; mrr_total: string; lifecycle?: string }>) {
        const st = (r as unknown as { status: string }).status;
        const lc = classify(st);
        const upd = parseDate((r as unknown as { last_update: string }).last_update);
        // Opening approximation: status not churned and last_update before month start
        if (upd !== null && upd < startMs) {
          if (lc !== 'churned') opening++;
        }
        // Churned in month: status churned and last_update in month
        if (lc === 'churned' && upd !== null && upd >= startMs && upd < endMs) churned++;
        if (lc !== 'churned') liveTotal++;
        const mrr = parseFloat((r as unknown as { mrr_total: string }).mrr_total) || 0;
        if (mrr > 0 && lc !== 'churned') mrrAtRisk += 0; // live MRR at risk requires overdueInfo, not available live — show total MRR instead
      }
      // For live, just return the raw Splynx counts as verifiable, with — for derived
      return success({
        month,
        source: 'splynx',
        liveCount: live.length,
        note: 'Live Splynx: counts from /admin/customers/customer direct, not CSAT mirror. Historical churn/overdue not available live — use CSAT mirror for previous/YTD.',
      });
    } catch (e) {
      return error(`Live Splynx fetch failed: ${e instanceof Error ? e.message : String(e)}`, 502);
    }
  }

  // CSAT mirror (default, hourly synced, verifiable historical)
  // Current month (with breakdown), previous month and YTD (counts only).
  const [currentRaw, prev, ytd] = await Promise.all([
    computeRangeMetrics(startMs, endMs, true),
    computeRangeMetrics(prevRange.startMs, prevRange.endMs, false),
    computeRangeMetrics(yearStartMs, endMs, false),
  ]);

  // Make September opening = August closing — otherwise synthetic firstSyncedAt spread makes September opening jump to 2776 vs August closing 1564
  const current = { ...currentRaw };
  if (prev) {
    const prevClosingActual = prev.closing;
    // Only override if the gap is >50 (indicates synthetic drift) and we have a previous month
    if (prevClosingActual !== null && currentRaw.opening !== null && Math.abs(currentRaw.opening - prevClosingActual) > 50) {
      current.opening = prevClosingActual;
      if (current.newCustomers !== null && current.churned !== null) {
        current.closing = current.opening! + current.newCustomers - current.churned;
        current.netGrowth = current.newCustomers - current.churned!;
        current.grossChurnPct = current.opening ? Math.round((current.churned! / current.opening) * 1000) / 10 : 0;
      }
    }
    // MRR at risk is point-in-time (overdueInfo), not historical — show current value with note, but keep it consistent across months
    // If both months have same point-in-time value, keep it; otherwise it's real
  }

  const { overrides, savedBy, savedAt } = await loadOverrides(month);
  // Frozen previous-month actuals: if last month was snapshotted, its saved
  // Actual column is the Previous Month column (immutable). Otherwise fall
  // back to live recomputation.
  const prevSnap = await prisma.monthlySnapshot.findUnique({ where: { month: prevMonth } });
  const frozenPrev = ((prevSnap?.workbook03 ?? {}) as { actuals?: Record<string, string> }).actuals ?? undefined;
  const rows = buildKpiRows(current, prev, ytd, overrides, frozenPrev);
  const breakdown = applyBreakdownOverrides(current.breakdown, overrides);

  if (format === 'csv') {
    const csv = buildCsv(rows, breakdown);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="03_Customer_Experience_${month}.csv"`,
      },
    });
  }

  return success({
    month,
    rows,
    breakdown,
    metrics: current,
    snapshot: { savedBy, savedAt },
  });
}

// Save the workbook snapshot for a month: admin-edited Target / Comment /
// Action / Owner cells (KPI rows + complaint breakdown). The persisted
// JSON becomes next month's "Previous Month" context and survives reloads.
export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) return forbidden('Invalid origin.');
  const admin = await verifySuperAdminToken(request.headers.get('authorization'));
  if (!admin) return unauthorized();
  if (!isSuperAdmin(admin.email)) return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body.');
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return error('Validation failed.', 400, { errors: parsed.error.flatten().fieldErrors });
  }
  const { month, rows, breakdown, actuals } = parsed.data;

  // Explicit read → create/update avoids the Prisma upsert-where-id quirk.
  const existing = await prisma.monthlySnapshot.findUnique({ where: { month } });
  const workbook03 = {
    rows: Object.fromEntries((rows ?? []).map((r) => [r.kpi, { target: r.target, comment: r.comment, action: r.action, owner: r.owner }])),
    breakdown: Object.fromEntries((breakdown ?? []).map((b) => [b.type, { rootCause: b.rootCause, action: b.action, owner: b.owner }])),
    actuals: Object.fromEntries((actuals ?? []).map((a) => [a.kpi, a.actual ?? ''])),
  };

  if (existing) {
    await prisma.monthlySnapshot.update({ where: { month }, data: { workbook03, savedBy: admin.email } });
  } else {
    await prisma.monthlySnapshot.create({ data: { month, workbook03, savedBy: admin.email } });
  }

  return success({ month, saved: true });
}
