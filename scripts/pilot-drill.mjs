/**
 * Pilot drill-down — the 3 unmatched September Paystack rows.
 * Read-only. For each: full Paystack row, Splynx payments same email / same amount,
 * customer record, and verdict hypothesis.
 * Run on server: node scripts/pilot-drill.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const j = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x instanceof Date ? x.toISOString() : x)));

const refs = ['6a96b0ad5aefa', '6a969e52712b6', '000017260921195609912717168758'];
for (const ref of refs) {
  const tx = await prisma.paystackTransaction.findUnique({ where: { reference: ref } });
  console.log('=== ' + ref + ' ===');
  console.log(JSON.stringify(j(tx), null, 1));
  if (!tx) continue;
  const email = (tx.customerEmail || '').trim().toLowerCase();
  const naira = Math.round((tx.amount / 100) * 100) / 100;
  // Same email, any amount, any time
  const sameEmailCust = await prisma.customer.findMany({
    where: { OR: [{ email }, { billingEmail: email }] },
    select: { customerId: true, customerName: true, email: true, billingEmail: true, status: true, lifecycle: true },
  });
  console.log('--- customers with this email: ' + sameEmailCust.length + ' ---');
  console.log(JSON.stringify(j(sameEmailCust), null, 1));
  // Same amount payments (±1), any email, Sept window ±7d
  const paidAt = tx.paidAt ? new Date(tx.paidAt) : null;
  const lo = paidAt ? new Date(paidAt.getTime() - 7 * 864e5) : new Date('2026-08-25');
  const hi = paidAt ? new Date(paidAt.getTime() + 7 * 864e5) : new Date('2026-09-08');
  const sameAmt = await prisma.splynxPayment.findMany({
    where: { amount: { gte: naira - 1, lte: naira + 1 }, paidAt: { gte: lo, lte: hi } },
    select: { paymentId: true, customerId: true, amount: true, paymentType: true, receiptNumber: true, paidAt: true },
  });
  console.log('--- mirror payments same amount ±1 within ±7d: ' + sameAmt.length + ' ---');
  console.log(JSON.stringify(j(sameAmt.slice(0, 10)), null, 1));
  if (sameEmailCust.length) {
    const cid = sameEmailCust[0].customerId;
    const custPay = await prisma.splynxPayment.findMany({
      where: { customerId: cid },
      select: { paymentId: true, amount: true, paymentType: true, receiptNumber: true, paidAt: true },
      orderBy: { paidAt: 'desc' }, take: 8,
    });
    console.log('--- recent payments for customer ' + cid + ' ---');
    console.log(JSON.stringify(j(custPay), null, 1));
  }
}
await prisma.$disconnect();
