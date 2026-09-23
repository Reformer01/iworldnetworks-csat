/**
 * Pilot payment forensics — September 2026.
 * Read-only. Answers: what are payment types 30/2? which rows match Paystack?
 * Run on server: node scripts/pilot-forensics.mjs 2026-09
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
const j = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x instanceof Date ? x.toISOString() : x)));

const out = { month };

// 1. Raw sample of each paymentType in September — reveal what 30/2 mean
for (const t of ['30', '2']) {
  out['type_' + t] = j(await prisma.splynxPayment.findMany({
    where: { paidAt: { gte: start, lte: end }, paymentType: t },
    select: { paymentId: true, customerId: true, amount: true, paymentType: true, receiptNumber: true, note: true, paidAt: true, raw: true },
    take: 5, orderBy: { paidAt: 'desc' },
  }));
}

// 2. Same for ALL payment types across full mirror (not just Sept): reveal vocabulary
out.allTypes = j(await prisma.$queryRaw`
  SELECT paymentType AS t, COUNT(*) AS c FROM SplynxPayment GROUP BY paymentType ORDER BY c DESC LIMIT 25`);

// 3. Customer identity check: do Sept payment customerIds resolve to customers? emails present?
const septPayments = await prisma.splynxPayment.findMany({
  where: { paidAt: { gte: start, lte: end } },
  select: { paymentId: true, customerId: true, amount: true, receiptNumber: true, paidAt: true },
  take: 5000,
});
const cids = [...new Set(septPayments.map((p) => p.customerId).filter(Boolean))];
const custs = await prisma.customer.findMany({
  where: { customerId: { in: cids } },
  select: { customerId: true, email: true, billingEmail: true, customerName: true },
});
const emailByCid = new Map(custs.map((c) => [c.customerId, c.email || c.billingEmail || null]));
let withEmail = 0;
const noEmailSamples = [];
for (const p of septPayments) {
  if (emailByCid.get(p.customerId)) withEmail++;
  else if (noEmailSamples.length < 10) noEmailSamples.push(p);
}
out.identity = {
  septPayments: septPayments.length,
  distinctCustomerIds: cids.length,
  customersResolved: custs.length,
  paymentsWithEmail: withEmail,
  noEmailSamples: j(noEmailSamples),
  customersMissing: cids.length - custs.length,
};

// 4. Paystack side: channel + reference vocabulary in September
out.paystackChannels = j(await prisma.$queryRaw`
  SELECT channel AS c, COUNT(*) AS n, ROUND(SUM(amount)/100,2) AS naira
  FROM PaystackTransaction WHERE paidAt >= ${start} AND paidAt <= ${end} GROUP BY channel ORDER BY n DESC`);
out.paystackRefs = j(await prisma.paystackTransaction.findMany({
  where: { status: 'success', paidAt: { gte: start, lte: end } },
  select: { reference: true, amount: true, customerEmail: true, channel: true, paidAt: true },
  take: 10, orderBy: { paidAt: 'desc' },
}));

// 5. Amount-bridge test: do Sept Paystack amounts match Sept Splynx payment amounts?
const payRows = await prisma.paystackTransaction.findMany({
  where: { status: 'success', paidAt: { gte: start, lte: end } },
  select: { reference: true, amount: true, customerEmail: true },
  take: 5000,
});
const splynxAmounts = new Map();
for (const p of septPayments) {
  const k = Math.round(p.amount * 100) / 100;
  splynxAmounts.set(k, (splynxAmounts.get(k) ?? 0) + 1);
}
let amountHits = 0;
for (const t of payRows) {
  const naira = Math.round((t.amount / 100) * 100) / 100;
  if (splynxAmounts.has(naira)) amountHits++;
}
out.bridge = {
  paystackSuccessRows: payRows.length,
  paystackRowsWithExactAmountInSplynx: amountHits,
  exactAmountHitRate: payRows.length ? Math.round((amountHits / payRows.length) * 1000) / 10 : 0,
};

// 6. Email-bridge test: Paystack emails vs customer emails
const payEmails = new Set(payRows.map((t) => (t.customerEmail || '').trim().toLowerCase()).filter(Boolean));
const custEmails = new Set((await prisma.customer.findMany({
  where: { deleted: false }, select: { email: true }, take: 10000,
})).map((c) => (c.email || '').trim().toLowerCase()).filter(Boolean));
let emailHits = 0;
for (const e of payEmails) if (custEmails.has(e)) emailHits++;
out.emailBridge = {
  paystackDistinctEmails: payEmails.size,
  sampleCustomerEmails: custEmails.size,
  paystackEmailsFoundInCustomers: emailHits,
};

console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
