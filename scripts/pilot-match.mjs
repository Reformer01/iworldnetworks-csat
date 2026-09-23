/**
 * Pilot match forensics — September 2026.
 * Read-only. Answers:
 *  (a) why 1778 paystack-only exceptions exist (email+amount+day vs Splynx payments)
 *  (b) what the 317 pending BTS customers look like
 *  (c) what endpointsNoTower 153 look like
 * Run on server: node scripts/pilot-match.mjs 2026-09
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
const normEmail = (e) => String(e || '').trim().toLowerCase();
const dayOf = (d) => (d ? new Date(new Date(d).getTime() + 3600000).toISOString().slice(0, 10) : null);

const out = { month };

// (a) Re-run email+amount+day matching in-memory over SEPTEMBER payments only
const payRows = await prisma.paystackTransaction.findMany({
  where: { status: 'success', paidAt: { gte: start, lte: end } },
  select: { reference: true, amount: true, customerEmail: true, paidAt: true },
  take: 5000,
});
const septPay = await prisma.splynxPayment.findMany({
  where: { paidAt: { gte: start, lte: end } },
  select: { paymentId: true, customerId: true, amount: true, receiptNumber: true, paidAt: true },
  take: 5000,
});
const cids = [...new Set(septPay.map((p) => p.customerId).filter(Boolean))];
const custs = await prisma.customer.findMany({
  where: { customerId: { in: cids } },
  select: { customerId: true, email: true, billingEmail: true },
});
const emailByCid = new Map(custs.map((c) => [c.customerId, normEmail(c.email || c.billingEmail)]));
// index splynx by email|amount|day and email|amount
const byEAD = new Map(); const byEA = new Map();
for (const p of septPay) {
  const e = emailByCid.get(p.customerId) || '';
  const a = Math.round(p.amount * 100) / 100;
  const d = dayOf(p.paidAt);
  const k1 = `${e}|${a.toFixed(2)}|${d}`;
  const k2 = `${e}|${a.toFixed(2)}`;
  if (!byEAD.has(k1)) byEAD.set(k1, []);
  byEAD.get(k1).push(p.paymentId);
  if (e) { if (!byEA.has(k2)) byEA.set(k2, []); byEA.get(k2).push(p.paymentId); }
}
let refHit = 0, eadHit = 0, eaHit = 0;
const stillOnly = [];
for (const t of payRows) {
  const a = Math.round((t.amount / 100) * 100) / 100;
  const e = normEmail(t.customerEmail);
  const d = dayOf(t.paidAt);
  if (byEAD.has(`${e}|${a.toFixed(2)}|${d}`)) { eadHit++; continue; }
  if (e && byEA.has(`${e}|${a.toFixed(2)}`)) { eaHit++; continue; }
  stillOnly.push({ reference: t.reference, email: e, amountNaira: a, day: d });
}
out.matcher = {
  paystackSuccess: payRows.length,
  matchedEmailAmountDay: eadHit,
  matchedEmailAmountWrongDay: eaHit,
  stillUnmatched: stillOnly.length,
  stillUnmatchedTop: stillOnly.slice(0, 15),
};
// day-shift analysis: for eaHit rows, how far apart are the days?
out.dayShiftHint = 'eaHit rows matched on email+amount but different WAT day — check Splynx date (midnight UTC, no time) vs Paystack timestamp (real time)';

// (b) pending 317 sample
const pending = await prisma.customer.findMany({
  where: { matchState: 'pending', deleted: false },
  select: { customerId: true, customerName: true, city: true, phone: true, email: true, matchScore: true },
  take: 30,
});
out.pendingSample = j(pending);
out.pendingCount = await prisma.customer.count({ where: { matchState: 'pending', deleted: false } });

// (c) endpoints with no tower sample
const noTower = await prisma.uispSite.findMany({
  where: { type: 'endpoint', btsName: null },
  select: { id: true, name: true, parentId: true, parentName: true, contactEmail: true, contactPhone: true },
  take: 20,
});
out.noTowerSample = j(noTower);

// (d) exception history: are the 1778 all September? or accumulated?
out.exceptionsByMonth = j(await prisma.$queryRaw`
  SELECT DATE_FORMAT(createdAt, '%Y-%m') AS mo, COUNT(*) AS c
  FROM ReconciliationException GROUP BY mo ORDER BY mo DESC LIMIT 6`);

console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
