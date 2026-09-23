/**
 * Pilot inventory — Phase 0 baseline for reconciliation pilot.
 * Run on server: node scripts/pilot-inventory.mjs [YYYY-MM]
 * Read-only: counts only, no writes.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const month = process.argv[2] || '2026-09';
const [y, m] = month.split('-').map(Number);
// WAT month window (UTC+1, no DST): month start 00:00 WAT .. month end 23:59:59.999 WAT
const start = new Date(Date.UTC(y, m - 1, 1) - 3600000);
const end = new Date(Date.UTC(y, m, 1) - 3600001);

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const j = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)));

const out = { month, watWindow: { start: start.toISOString(), end: end.toISOString() } };

out.customers = {
  total: await prisma.customer.count(),
  ...(await prisma.customer.groupBy({ by: ['lifecycle'], _count: true }).then((r) => ({ byLifecycle: j(r) }))),
  ...(await prisma.customer.groupBy({ by: ['matchState'], _count: true }).then((r) => ({ byMatchState: j(r) }))),
  deleted: await prisma.customer.count({ where: { deleted: true } }),
  noEmail: await prisma.customer.count({ where: { deleted: false, email: null } }),
  duplicateEmails: await prisma.$queryRaw`
    SELECT LOWER(TRIM(email)) AS email, COUNT(*) AS c
    FROM Customer WHERE deleted = 0 AND email IS NOT NULL AND email != ''
    GROUP BY LOWER(TRIM(email)) HAVING c > 1 ORDER BY c DESC LIMIT 10`,
};

out.invoices = {
  total: await prisma.invoice.count(),
  paid: await prisma.invoice.count({ where: { isPaid: true } }),
  withItems: await prisma.$queryRaw`SELECT COUNT(*) AS c FROM Invoice WHERE items IS NOT NULL AND JSON_LENGTH(items) > 0`,
};

out.payments = {
  total: await prisma.splynxPayment.count(),
  month: await prisma.splynxPayment.count({ where: { paidAt: { gte: start, lte: end } } }),
  monthByType: await prisma.$queryRaw`
    SELECT paymentType AS t, COUNT(*) AS c, ROUND(SUM(amount),2) AS naira
    FROM SplynxPayment WHERE paidAt >= ${start} AND paidAt <= ${end} GROUP BY paymentType ORDER BY c DESC LIMIT 20`,
};

out.paystack = {
  total: await prisma.paystackTransaction.count(),
  month: await prisma.paystackTransaction.count({ where: { paidAt: { gte: start, lte: end } } }),
  monthSuccess: await prisma.paystackTransaction.count({ where: { status: 'success', paidAt: { gte: start, lte: end } } }),
  monthSuccessNaira: await prisma.paystackTransaction.aggregate({
    where: { status: 'success', paidAt: { gte: start, lte: end } },
    _sum: { amount: true },
  }).then((r) => Math.round(((r._sum.amount ?? 0) / 100) * 100) / 100),
};

out.ledger = {
  total: await prisma.splynxIncomeLedger.count(),
  month: await prisma.splynxIncomeLedger.count({ where: { paidAt: { gte: start, lte: end } } }),
  monthBySource: await prisma.$queryRaw`
    SELECT source AS s, COUNT(*) AS c, ROUND(SUM(amountNaira),2) AS naira
    FROM SplynxIncomeLedger WHERE paidAt >= ${start} AND paidAt <= ${end} GROUP BY source`,
};

out.recon = {
  links: await prisma.paystackReconciliationLink.count(),
  linksByStatus: await prisma.paystackReconciliationLink.groupBy({ by: ['status'], _count: true }),
  exceptions: await prisma.reconciliationException.count(),
  exceptionsOpen: await prisma.reconciliationException.count({ where: { status: 'open' } }),
  exceptionsByKind: await prisma.$queryRaw`
    SELECT kind AS k, status AS s, COUNT(*) AS c FROM ReconciliationException GROUP BY kind, status ORDER BY c DESC LIMIT 30`,
};

out.uisp = {
  sites: await prisma.uispSite.count(),
  sitesByType: await prisma.uispSite.groupBy({ by: ['type'], _count: true }),
  endpointsNoTower: await prisma.uispSite.count({ where: { type: 'endpoint', btsName: null } }),
  meta: await prisma.uispMeta.findUnique({ where: { id: 'sync' } }),
};

out.sync = {
  lock: await prisma.syncLock.findUnique({ where: { id: 'splynx-hourly-sync' } }),
  splynxMeta: await prisma.splynxMeta.findUnique({ where: { id: 'sync' } }),
};

console.log(JSON.stringify(j(out), null, 1));
await prisma.$disconnect();
