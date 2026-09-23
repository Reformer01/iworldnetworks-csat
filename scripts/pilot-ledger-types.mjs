/**
 * Read-only: Sept ledger rows grouped by Splynx payment_type from raw JSON.
 * Run on server: node scripts/pilot-ledger-types.mjs 2026-09
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const month = process.argv[2] || '2026-09';
const [y, m] = month.split('-').map(Number);
const start = new Date(Date.UTC(y, m - 1, 1) - 3600000);
const end = new Date(Date.UTC(y, m, 1) - 3600001);
const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const rows = await prisma.splynxIncomeLedger.findMany({
  where: { paidAt: { gte: start, lte: end } },
  select: { amountNaira: true, reference: true, raw: true },
});
const by = {};
for (const r of rows) {
  const t = String(r.raw?.payment_type ?? 'UNKNOWN');
  by[t] = by[t] || { n: 0, sum: 0 };
  by[t].n++;
  by[t].sum = Math.round((by[t].sum + (r.amountNaira || 0)) * 100) / 100;
}
const t30 = rows.filter((r) => String(r.raw?.payment_type) === '30');
console.log(JSON.stringify({
  month,
  totalRows: rows.length,
  byPaymentType: by,
  type30Rows: t30.length,
  type30Naira: Math.round(t30.reduce((s, r) => s + r.amountNaira, 0) * 100) / 100,
}, null, 1));
await prisma.$disconnect();
