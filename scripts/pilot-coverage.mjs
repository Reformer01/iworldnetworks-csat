/**
 * Read-only: Splynx payments mirror coverage by month (to distinguish real
 * paystack-only exceptions from ledger-coverage gaps).
 * Run on server: node scripts/pilot-coverage.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const j = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x instanceof Date ? x.toISOString() : x)));

const out = {};

out.paymentsMirrorByMonth = j(await prisma.$queryRaw`
  SELECT DATE_FORMAT(paidAt, '%Y-%m') AS mo, COUNT(*) AS c,
         MIN(paidAt) AS firstAt, MAX(paidAt) AS lastAt
  FROM SplynxPayment WHERE paidAt IS NOT NULL GROUP BY mo ORDER BY mo ASC LIMIT 40`);

out.paymentsMirrorRange = j(await prisma.$queryRaw`
  SELECT MIN(paidAt) AS minPaidAt, MAX(paidAt) AS maxPaidAt, COUNT(*) AS total,
         SUM(paymentType = '30') AS type30
  FROM SplynxPayment WHERE paidAt IS NOT NULL`);

out.paystackSuccessByMonthOld = j(await prisma.$queryRaw`
  SELECT DATE_FORMAT(CONVERT_TZ(paidAt,'+00:00','+01:00'), '%Y-%m') AS mo, COUNT(*) AS c
  FROM PaystackTransaction WHERE status='success' AND paidAt IS NOT NULL
  GROUP BY mo ORDER BY mo ASC LIMIT 12`);

out.exceptionsByMonth = j(await prisma.$queryRaw`
  SELECT DATE_FORMAT(createdAt, '%Y-%m-%d %H') AS hour, kind AS k, COUNT(*) AS c
  FROM ReconciliationException WHERE status='open' GROUP BY hour, k ORDER BY hour DESC LIMIT 20`);

console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
