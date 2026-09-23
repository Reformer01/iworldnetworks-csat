/** One-off probe: what did customer X pay via Splynx around a given date? */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
const [cid, from, to] = process.argv.slice(2);
const u = (process.env.DATABASE_URL || '').replace(/^mysql:\/\//, 'mariadb://');
const p = new PrismaClient({ adapter: new PrismaMariaDb(u), log: [] });
const rows = await p.splynxPayment.findMany({
  where: { customerId: cid, paidAt: { gte: new Date(from), lte: new Date(to) } },
  orderBy: { paidAt: 'asc' },
  select: { paymentId: true, paymentType: true, amount: true, paidAt: true, receiptNumber: true, note: true },
});
console.log(JSON.stringify(rows.map((r) => ({ ...r, paidAt: r.paidAt?.toISOString() })), null, 1));
await p.$disconnect();
