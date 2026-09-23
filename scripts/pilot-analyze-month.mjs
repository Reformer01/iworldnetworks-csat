/**
 * Sample the remaining paystack-only exceptions for a given month (WAT):
 * for each, was there a Splynx payment of the same amount within ±3 days
 * (date drift) or same amount same email (amount mismatch)? Read-only.
 * Usage (server): node scripts/pilot-analyze-month.mjs 2025-05
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const month = process.argv[2] || '2025-05';
const [y, m] = month.split('-').map(Number);
const start = new Date(Date.UTC(y, m - 1, 1) - 3600000);
const end = new Date(Date.UTC(y, m, 1) - 3600001);

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const j = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x instanceof Date ? x.toISOString() : x)));

const linkedRefs = new Set((await prisma.paystackReconciliationLink.findMany({ select: { paystackReference: true } })).map((l) => l.paystackReference));

const txs = await prisma.paystackTransaction.findMany({
  where: { status: 'success', paidAt: { gte: start, lte: end } },
  select: { reference: true, amount: true, customerEmail: true, customerName: true, paidAt: true, channel: true },
});
const unlinked = txs.filter((t) => !linkedRefs.has(t.reference));

// Splynx payments across a wider window (±10 days) for drift analysis
const spay = await prisma.splynxPayment.findMany({
  where: { paidAt: { gte: new Date(start.getTime() - 10 * 864e5), lte: new Date(end.getTime() + 10 * 864e5) } },
  select: { paymentId: true, customerId: true, amount: true, paymentType: true, receiptNumber: true, paidAt: true },
});
const custIds = [...new Set(spay.map((p) => p.customerId).filter((v) => !!v))];
const custs = await prisma.customer.findMany({
  where: { customerId: { in: custIds } },
  select: { customerId: true, email: true, billingEmail: true },
});
const emailByCid = new Map(custs.map((c) => [c.customerId, (c.email || c.billingEmail || '').trim().toLowerCase()]));
const cidByEmail = new Map();
for (const [cid, e] of emailByCid) {
  if (e && !cidByEmail.has(e)) cidByEmail.set(e, cid);
}

const out = { month, paystackSuccess: txs.length, unlinked: unlinked.length, unlinkedNaira: Math.round(unlinked.reduce((s, t) => s + t.amount / 100, 0) * 100) / 100 };
const analysis = [];
for (const t of unlinked.slice(0, 500)) {
  const naira = Math.round((t.amount / 100) * 100) / 100;
  const email = (t.customerEmail || '').trim().toLowerCase();
  const cid = cidByEmail.get(email);
  // same amount, same customer (by email→cid), within ±10 days?
  const cand = cid
    ? spay.filter((p) => p.customerId === cid && Math.abs(p.amount - naira) <= 1)
    : [];
  const exactCid = cand.find((p) => p.customerId === cid);
  const sameEmailAnyAmount = cid
    ? spay.filter((p) => p.customerId === cid && p.paidAt >= start && p.paidAt <= end)
    : [];
  analysis.push({
    ref: t.reference,
    email,
    naira,
    day: t.paidAt ? t.paidAt.toISOString().slice(0, 10) : null,
    channel: t.channel,
    splynxCid: cid ?? null,
    verdict: exactCid
      ? 'OUT-OF-MONTH-DRIFT: same customer+amount found ±10d around month'
      : sameEmailAnyAmount.length
        ? 'SAME-CUSTOMER-NO-AMOUNT: customer paid something that month, amount differs'
        : cid
          ? 'CUSTOMER-KNOWN-NO-PAYMENT: customer exists, no Splynx payment in window'
          : 'NO-CUSTOMER: Paystack email not in customer mirror',
    splynxCandidates: cand.slice(0, 3).map((p) => ({ id: p.paymentId, naira: p.amount, day: p.paidAt?.toISOString().slice(0, 10), type: p.paymentType })),
  });
}
out.analysis = analysis;
console.log(JSON.stringify(j(out), null, 1));
await prisma.$disconnect();
