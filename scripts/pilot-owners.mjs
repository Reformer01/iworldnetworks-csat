/**
 * Write: assign ownerEmail + followUpAt + verdicts to the Sept pilot exceptions.
 * Run on server: node scripts/pilot-owners.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });

const week = (d) => new Date(Date.now() + d * 864e5);

const updates = [
  // Splynx-only: same customer as a matched Paystack payment same day (2272), admin-entered Paystack-type row
  { ref: '2026-01-00280', owner: 'finance@iworldnetworks.net', note: 'VERDICT: admin-entered Splynx Paystack-type payment for customer 2272 same day as Paystack tx 6a96b0ad5aefa (72000 vs 72500). Confirm which side is the true posting; then resolve one side.' },
  { ref: '2026-30-07539', owner: 'ops@iworldnetworks.net', note: 'VERDICT: Paystack API payment (Bank Statement 8439) with no Paystack transaction in mirror — check Paystack dashboard for missing/failed sync on 2026-09-01; backfill via full Paystack sync if found.' },
  { ref: '2026-01-00282', owner: 'ops@iworldnetworks.net', note: 'VERDICT: admin-entered Paystack-type payment (customer 1369) with no Paystack transaction — verify against bank statement; likely offline Paystack terminal or manual receipt. Attach proof then resolve.' },
  { ref: '2026-01-00291', owner: 'ops@iworldnetworks.net', note: 'VERDICT: admin-entered Paystack-type payment (customer 2308, 2026-09-07) with no Paystack transaction — verify against bank statement; attach proof then resolve.' },
  { ref: '6a96b0ad5aefa', owner: 'finance@iworldnetworks.net', note: 'VERDICT: Paystack 72000 on 2026-09-01 for customer 2272 whose Splynx row is 72500 (500 variance). Pair with splynx-only 2026-01-00280; decide which figure is correct, then resolve both.' },
  { ref: '000017260921195609912717168758', owner: 'finance@iworldnetworks.net', note: 'VERDICT: dedicated_nuban 27500 on 2026-09-21 19:56 WAT for customer 2034 whose last Splynx payment is 2026-08-24 — genuine paystack-only; confirm bank statement credit and post to Splynx, then resolve.' },
];

for (const u of updates) {
  const isPaystack = !u.ref.startsWith('2026');
  const existing = await prisma.reconciliationException.findFirst({
    where: isPaystack ? { paystackReference: u.ref } : { title: { contains: u.ref } },
  });
  if (!existing) {
    console.log('skip (not found):', u.ref);
    continue;
  }
  const entry = { at: new Date().toISOString(), action: 'pilot-triage', note: u.note };
  const history = Array.isArray(existing.history) ? [...existing.history, entry] : [entry];
  await prisma.reconciliationException.update({
    where: { id: existing.id },
    data: {
      ownerEmail: u.owner,
      followUpAt: week(7),
      detail: `${existing.detail ?? ''} — ${u.note}`.slice(0, 4000),
      history,
    },
  });
  console.log('assigned:', u.ref, '->', u.owner);
}
await prisma.$disconnect();
