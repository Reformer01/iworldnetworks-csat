/**
 * Dump September Splynx mirror payments + customer emails for offline
 * reconciliation against a Paystack export.
 * Usage (on the server): node scripts/dump-mirror-sept.mjs 2026-09
 * Writes: /tmp/mirror-<month>.csv  (reference,email,amountNaira,paidAt)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import fs from 'fs';

const month = process.argv[2] || new Date().toISOString().slice(0, 7);
const [y, m] = month.split('-').map(Number);
// WAT month window (UTC+1, no DST)
const start = new Date(Date.UTC(y, m - 1, 1) - 3600000);
const end = new Date(Date.UTC(y, m, 1) - 3600001);

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });

const payments = await prisma.splynxPayment.findMany({
  where: { paidAt: { gte: start, lte: end } },
  select: { receiptNumber: true, customerId: true, amount: true, paidAt: true, paymentType: true },
});
const cids = [...new Set(payments.map((p) => p.customerId).filter(Boolean))];
const customers = await prisma.customer.findMany({
  where: { customerId: { in: cids } },
  select: { customerId: true, email: true, billingEmail: true },
});
const emailByCid = new Map(customers.map((c) => [c.customerId, c.email || c.billingEmail || '']));

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const lines = ['reference,email,amountNaira,paidAt'];
for (const p of payments) {
  lines.push([esc(p.receiptNumber), esc(emailByCid.get(p.customerId) ?? ''), p.amount, p.paidAt ? p.paidAt.toISOString() : ''].join(','));
}
const out = `/tmp/mirror-${month}.csv`;
fs.writeFileSync(out, lines.join('\n'));
console.log(JSON.stringify({ month, rows: payments.length, file: out }));
await prisma.$disconnect();
