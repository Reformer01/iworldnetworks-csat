/**
 * Pilot reconciliation runner (WRITE) — September 2026.
 *
 *  1. Backfill PaystackTransaction.splynxCustomerId from raw.metadata.customer_id
 *  2. Purge stale paystack-only exceptions created against the empty ledger
 *  3. importSplynxIncomeLedger({ month })
 *  4. runReconciliation({ month })
 *  5. Print acceptance report (linked vs sums vs remaining exceptions)
 *
 * Usage (server): npx tsx scripts/pilot-recon-run.mjs 2026-09 [--apply]
 * Without --apply it only prints the plan (dry run).
 */
import 'dotenv/config';

const month = process.argv[2] || '2026-09';
const APPLY = process.argv.includes('--apply');

const { PrismaClient } = await import('@prisma/client');
const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const j = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x instanceof Date ? x.toISOString() : x)));

const out = { month, apply: APPLY };

// --- 1. Backfill splynxCustomerId from raw.metadata.customer_id -------------
function extractSplynxCustomerId(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const meta = raw.metadata;
  if (typeof meta === 'object' && meta !== null) {
    const cid = meta.customer_id;
    if (typeof cid === 'number' && Number.isFinite(cid)) return String(cid);
    if (typeof cid === 'string' && /^\d+$/.test(cid.trim())) return cid.trim();
    const referrer = meta.referrer;
    if (typeof referrer === 'string') {
      const m = referrer.match(/customer_id=(\d+)/);
      if (m) return m[1];
    }
  }
  return null;
}
const txs = await prisma.paystackTransaction.findMany({
  where: { splynxCustomerId: null },
  select: { id: true, reference: true, raw: true },
});
let toFill = [];
for (const t of txs) {
  const cid = extractSplynxCustomerId(t.raw);
  if (cid) toFill.push({ id: t.id, cid });
}
out.backfill = { scanned: txs.length, extractable: toFill.length };
if (APPLY) {
  let done = 0;
  for (const { id, cid } of toFill) {
    await prisma.paystackTransaction.update({ where: { id }, data: { splynxCustomerId: cid } }).catch(() => {});
    done++;
  }
  out.backfill.updated = done;
}

// --- 2. Purge stale exceptions created against the empty ledger -------------
const stale = await prisma.reconciliationException.findMany({
  where: { kind: 'paystack-only', status: 'open' },
  select: { id: true },
});
out.purge = { staleOpenPaystackOnly: stale.length };
if (APPLY) {
  const r = await prisma.reconciliationException.deleteMany({
    where: { kind: 'paystack-only', status: 'open', splynxLedgerId: null },
  });
  out.purge.deleted = r.count;
}

if (APPLY) {
  // --- 3. Ledger import (real module, TS) ---------------------------------
  const { importSplynxIncomeLedger } = await import('../src/lib/finance/splynx-ledger');
  out.ledgerImport = await importSplynxIncomeLedger({ month });

  // --- 4. Reconciliation run ----------------------------------------------
  const { runReconciliation } = await import('../src/lib/finance/reconciliation-runner');
  out.recon = await runReconciliation({ month });
}

// --- 5. Acceptance report ---------------------------------------------------
const [y, m] = month.split('-').map(Number);
const start = new Date(Date.UTC(y, m - 1, 1) - 3600000);
const end = new Date(Date.UTC(y, m, 1) - 3600001);
out.acceptance = {
  paystackSuccessNaira: await prisma.paystackTransaction
    .aggregate({ where: { status: 'success', paidAt: { gte: start, lte: end } }, _sum: { amount: true } })
    .then((r) => Math.round(((r._sum.amount ?? 0) / 100) * 100) / 100),
  ledgerMonthRows: await prisma.splynxIncomeLedger.count({ where: { paidAt: { gte: start, lte: end } } }),
  ledgerMonthNaira: await prisma.splynxIncomeLedger
    .aggregate({ where: { paidAt: { gte: start, lte: end } }, _sum: { amountNaira: true } })
    .then((r) => Math.round((r._sum.amountNaira ?? 0) * 100) / 100),
  linksByStatus: await prisma.paystackReconciliationLink.groupBy({ by: ['status'], _count: true }),
  exceptionsByKind: await prisma.$queryRaw`
    SELECT kind AS k, status AS s, COUNT(*) AS c FROM ReconciliationException GROUP BY kind, status ORDER BY c DESC LIMIT 20`,
  txWithCustomerId: await prisma.paystackTransaction.count({ where: { splynxCustomerId: { not: null } } }),
};

console.log(JSON.stringify(j(out), null, 1));
await prisma.$disconnect();
