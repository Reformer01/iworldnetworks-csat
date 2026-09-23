/**
 * Bulk-triage the remaining open reconciliation exceptions (dry-run default,
 * --apply to write). Assigns ownerEmail + followUpAt and appends a verdict to
 * detail + history, without touching exceptions that already have an owner.
 *
 * Categories:
 *  - splynx-only: manual/bank/cash Splynx payments outside the Paystack lane.
 *  - date-mismatch: same payment, different posting day (cutover reposting).
 *  - paystack-only pre-2025-10: cutover era — Paystack collections reposted
 *    manually in Splynx (type 2/25) at recalculated amounts (verified by probes).
 *  - paystack-only 2025-10+: post-cutover, genuinely unexplained → ops, 7d.
 *
 * Usage (server): node scripts/pilot-triage-bulk.mjs [--apply]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const apply = process.argv.includes('--apply');
const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });

const days = (n) => new Date(Date.now() + n * 864e5);
const FIN = 'finance@iworldnetworks.net';
const OPS = 'ops@iworldnetworks.net';

const VERDICTS = {
  'splynx-only': {
    owner: FIN,
    followUpAt: days(30),
    note: 'BULK VERDICT: Splynx manual/bank/cash payment (types 2/9/17/25/26) recorded without a Paystack counterpart — expected for the non-Paystack lane. No action unless the customer disputes the receipt.',
  },
  'date-mismatch': {
    owner: FIN,
    followUpAt: days(14),
    note: 'BULK VERDICT: same payment posted in Splynx on a different day than the Paystack paidAt (cutover-era reposting, ±1–3 days). Amounts agree; verify at month-end review, then resolve.',
  },
  'paystack-only-cutover': {
    owner: FIN,
    followUpAt: days(30),
    note: 'BULK VERDICT (cutover era, before 2025-10): Paystack collection was reposted manually in Splynx under type 2/25 at a recalculated amount (verified: e.g. Paystack 18462.07 vs Splynx 18275 type-25 same day, customer 1817). Revenue is recorded in Splynx; no customer impact. Spot-check bank statement credits at audit.',
  },
  'paystack-only-recent': {
    owner: OPS,
    followUpAt: days(7),
    note: 'BULK VERDICT (post-cutover, 2025-10+): Paystack transaction with no matching Splynx posting. Investigate against bank statement and the customer ledger in Splynx; post the payment or resolve with proof.',
  },
};

const CUTOVER = new Date('2025-10-01T00:00:00+01:00'); // WAT

const open = await prisma.reconciliationException.findMany({
  where: { status: 'open', ownerEmail: null },
});
const refs = open.filter((e) => e.kind === 'paystack-only').map((e) => e.paystackReference).filter(Boolean);
const txs = await prisma.paystackTransaction.findMany({
  where: { reference: { in: refs } },
  select: { reference: true, paidAt: true },
});
const paidAtByRef = new Map(txs.map((t) => [t.reference, t.paidAt]));

const buckets = new Map();
for (const e of open) {
  let key = e.kind;
  if (e.kind === 'paystack-only') {
    const paidAt = paidAtByRef.get(e.paystackReference);
    key = paidAt && paidAt >= CUTOVER ? 'paystack-only-recent' : 'paystack-only-cutover';
  }
  if (!VERDICTS[key]) continue;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(e);
}

const out = { applied: apply, buckets: {}, updated: 0 };
for (const [key, rows] of buckets) {
  const v = VERDICTS[key];
  out.buckets[key] = { count: rows.length, owner: v.owner, followUpAt: v.followUpAt.toISOString() };
  if (!apply) continue;
  for (const e of rows) {
    const entry = { at: new Date().toISOString(), action: 'pilot-triage-bulk', note: v.note };
    const history = Array.isArray(e.history) ? [...e.history, entry] : [entry];
    await prisma.reconciliationException.update({
      where: { id: e.id },
      data: {
        ownerEmail: v.owner,
        followUpAt: v.followUpAt,
        detail: `${e.detail ?? ''} — ${v.note}`.slice(0, 4000),
        history,
      },
    });
    out.updated++;
  }
}
console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
