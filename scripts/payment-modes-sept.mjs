import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const rows = await prisma.splynxPayment.findMany({
  where: { paidAt: { gte: new Date(Date.UTC(2026, 8, 1) - 3600000), lt: new Date(Date.UTC(2026, 9, 1) - 3600001) } },
  select: { paymentType: true, amount: true },
});
const by = {};
for (const r of rows) {
  const k = (r.paymentType || 'UNKNOWN').toString().slice(0, 60);
  by[k] = by[k] || { n: 0, sum: 0 };
  by[k].n++;
  by[k].sum = Math.round((by[k].sum + (r.amount || 0)) * 100) / 100;
}
console.log(JSON.stringify({ totalRows: rows.length, by }, null, 1));
await prisma.$disconnect();
