/**
 * Freeze Paystack monthly-close snapshots directly against the DB, replicating
 * the POST /api/admin/finance/paystack/snapshots logic (which requires a
 * Firebase finance-manager token). Bundles the shared TS modules with esbuild.
 *
 * Differences from the HTTP route (intentional fixes):
 *  - reconciliation/exception counts are MONTH-SCOPED (route counts globals
 *    with a 5000-row cap, which under-reports now that links exceed it).
 *  - FETCH_CAP raised to cover the largest month.
 *
 * Freezes every month that has Paystack activity EXCEPT the current month.
 * Dry-run by default; --apply writes. Idempotent (upsert per month).
 * Usage (server): node scripts/pilot-snapshot-freeze.mjs [--apply]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';

const apply = process.argv.includes('--apply');
const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const FETCH_CAP = 20000;

await esbuild.build({
  entryPoints: ['src/lib/finance/paystack-aggregates.ts', 'src/lib/finance/paystack-report.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: 'node_modules/.cache/pilot-freeze',
  outExtension: { '.js': '.mjs' },
  write: true,
  logLevel: 'silent',
});
const agg = await import(pathToFileURL('node_modules/.cache/pilot-freeze/paystack-aggregates.mjs').href);
const rep = await import(pathToFileURL('node_modules/.cache/pilot-freeze/paystack-report.mjs').href);
const { buildPaystackOverview, extractSegment } = agg;
const { buildMonthlySnapshotPayload } = rep;

const monthKeyOf = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const round2 = (n) => Math.round(n * 100) / 100;

// All months with any Paystack transaction, excluding the current WAT month.
const monthsRaw = await prisma.$queryRawUnsafe(
  "SELECT DISTINCT DATE_FORMAT(paidAt, '%Y-%m') AS mo FROM PaystackTransaction WHERE paidAt IS NOT NULL ORDER BY mo",
);
const nowWat = new Date(Date.now() + 3600000);
const currentMonth = `${nowWat.getUTCFullYear()}-${String(nowWat.getUTCMonth() + 1).padStart(2, '0')}`;
const months = monthsRaw.map((r) => r.mo).filter((m) => m && m < currentMonth);

const out = { applied: apply, currentMonthSkipped: currentMonth, frozen: [], skipped: [] };
for (const month of months) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const transactions = await prisma.paystackTransaction.findMany({
    where: { paidAt: { gte: start, lt: end } },
    orderBy: { paidAt: 'desc' },
    take: FETCH_CAP,
  });
  if (!transactions.length) {
    out.skipped.push(month);
    continue;
  }
  const refs = new Set(transactions.map((t) => t.reference));
  const [linksAll, exceptionsAll] = await Promise.all([
    prisma.paystackReconciliationLink.findMany({ where: { paystackReference: { in: [...refs] } } }),
    prisma.reconciliationException.findMany({ where: { paystackReference: { in: [...refs] } } }),
  ]);

  // Also pull splynx-only exceptions for the month via ledger paidAt.
  const splynxOnly = await prisma.reconciliationException.findMany({
    where: { kind: 'splynx-only', splynxLedgerId: { not: null } },
    select: { id: true, splynxLedgerId: true, status: true },
  });
  const ledgerIds = splynxOnly.map((e) => e.splynxLedgerId);
  const ledgerRows = ledgerIds.length
    ? await prisma.splynxIncomeLedger.findMany({ where: { id: { in: ledgerIds } }, select: { id: true, paidAt: true } })
    : [];
  const ledgerMonth = new Map(ledgerRows.map((r) => [r.id, monthKeyOf(r.paidAt)]));
  const splynxMonthExceptions = splynxOnly.filter((e) => ledgerMonth.get(e.splynxLedgerId) === month);

  const overview = buildPaystackOverview(transactions, linksAll, month);

  const segmentMap = new Map();
  for (const row of transactions) {
    if (String(row.status ?? '').toLowerCase() !== 'success') continue;
    if (monthKeyOf(row.paidAt) !== month) continue;
    const key = extractSegment(row) ?? 'Unknown';
    const entry = segmentMap.get(key) ?? { collectedNaira: 0, count: 0 };
    entry.collectedNaira = round2(entry.collectedNaira + (row.amount || 0) / 100);
    entry.count += 1;
    segmentMap.set(key, entry);
  }
  const segments = [...segmentMap.entries()]
    .map(([segment, v]) => ({ segment, collectedNaira: v.collectedNaira, count: v.count }))
    .sort((a, b) => b.collectedNaira - a.collectedNaira);

  const reconciliation = { total: linksAll.length };
  for (const link of linksAll) {
    const s = String(link.status ?? 'unknown').toLowerCase();
    reconciliation[s] = (reconciliation[s] ?? 0) + 1;
  }

  const monthExceptions = [...exceptionsAll, ...splynxMonthExceptions.map((e) => ({ status: e.status }))];
  const exceptionsCount = { total: monthExceptions.length };
  for (const row of monthExceptions) {
    const s = String(row.status ?? 'open').toLowerCase();
    exceptionsCount[s] = (exceptionsCount[s] ?? 0) + 1;
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

  out.frozen.push({
    month,
    successCount: payload.totals?.successCount ?? null,
    collectedNaira: payload.totals?.collectedNaira ?? null,
    links: reconciliation.total,
    matched: reconciliation.matched ?? 0,
    exceptions: exceptionsCount.total,
    openExceptions: exceptionsCount.open ?? 0,
  });

  if (apply) {
    const data = {
      totals: payload.totals,
      channels: payload.channels,
      regions: payload.regions,
      segments: payload.segments,
      reconciliation: payload.reconciliation,
      exceptions: payload.exceptions,
      savedBy: 'pilot-snapshot-freeze',
    };
    await prisma.paystackMonthlySnapshot.upsert({
      where: { month },
      create: { month, ...data },
      update: data,
    });
  }
}
console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
