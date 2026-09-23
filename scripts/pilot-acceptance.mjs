/**
 * Final acceptance report across ALL months — read-only.
 * Run on server: node scripts/pilot-acceptance.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const j = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x instanceof Date ? x.toISOString() : x)));

const out = {};

out.ledger = {
  total: await prisma.splynxIncomeLedger.count(),
  byMonth: j(await prisma.$queryRaw`
    SELECT DATE_FORMAT(paidAt, '%Y-%m') AS mo, COUNT(*) AS c, ROUND(SUM(amountNaira),2) AS naira
    FROM SplynxIncomeLedger GROUP BY mo ORDER BY mo DESC LIMIT 30`),
};

out.links = {
  total: await prisma.paystackReconciliationLink.count(),
  byStatus: j(await prisma.paystackReconciliationLink.groupBy({ by: ['status'], _count: true })),
  byMethod: j(await prisma.paystackReconciliationLink.groupBy({ by: ['method'], _count: true })),
};

out.exceptions = {
  total: await prisma.reconciliationException.count(),
  byKindStatus: j(await prisma.$queryRaw`
    SELECT kind AS k, status AS s, COUNT(*) AS c FROM ReconciliationException GROUP BY kind, status ORDER BY c DESC`),
  owned: await prisma.reconciliationException.count({ where: { ownerEmail: { not: null } } }),
};

out.paystack = {
  total: await prisma.paystackTransaction.count(),
  withCustomerId: await prisma.paystackTransaction.count({ where: { splynxCustomerId: { not: null } } }),
  successByMonth: j(await prisma.$queryRaw`
    SELECT DATE_FORMAT(CONVERT_TZ(paidAt,'+00:00','+01:00'), '%Y-%m') AS mo, COUNT(*) AS c,
           ROUND(SUM(amount)/100,2) AS naira
    FROM PaystackTransaction WHERE status='success' AND paidAt IS NOT NULL
    GROUP BY mo ORDER BY mo DESC LIMIT 30`),
};

// Month-level match rate: month of Paystack success rows vs links that reference them.
out.monthMatchRate = j(await prisma.$queryRaw`
  SELECT t.mo AS mo,
         t.cnt AS paystack_success,
         COALESCE(l.matched, 0) AS linked_matched,
         ROUND(COALESCE(l.matched,0) / t.cnt * 100, 1) AS pct
  FROM (
    SELECT DATE_FORMAT(CONVERT_TZ(paidAt,'+00:00','+01:00'), '%Y-%m') AS mo, COUNT(*) AS cnt
    FROM PaystackTransaction WHERE status='success' AND paidAt IS NOT NULL GROUP BY mo
  ) t
  LEFT JOIN (
    SELECT DATE_FORMAT(CONVERT_TZ(ps.paidAt,'+00:00','+01:00'), '%Y-%m') AS mo, COUNT(*) AS matched
    FROM PaystackReconciliationLink l
    JOIN PaystackTransaction ps ON ps.reference = l.paystackReference
    WHERE l.status='matched' GROUP BY mo
  ) l ON l.mo = t.mo
  ORDER BY t.mo DESC LIMIT 30`);

console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
