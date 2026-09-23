import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const start = new Date(Date.UTC(2026, 8, 1) - 3600000);
const end = new Date(Date.UTC(2026, 9, 1) - 3600001);
for (const t of ['2', '30']) {
  const rows = await prisma.splynxPayment.findMany({
    where: { paymentType: t, paidAt: { gte: start, lt: end } },
    select: { receiptNumber: true, amount: true },
    take: 8,
  });
  console.log(t, JSON.stringify(rows.map((r) => [r.receiptNumber, r.amount])));
}
await prisma.$disconnect();
