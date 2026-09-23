/**
 * Stale-exception reaper — write, idempotent.
 *
 * The reconciliation runner skips references that already have a link, so an
 * exception raised in an earlier run (e.g. against an empty ledger) stays open
 * forever even after the payment later matches. This pass closes them:
 *
 *   paystack-only  -> drop when a matched/date-mismatch link now exists for
 *                     that paystackReference
 *   splynx-only    -> drop when its splynxLedgerId is now referenced by a link
 *
 * Real, still-unexplained exceptions are left untouched.
 *
 * Usage (server): node scripts/pilot-reap-exceptions.mjs [--apply]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const APPLY = process.argv.includes('--apply');
const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });

const links = await prisma.paystackReconciliationLink.findMany({ select: { paystackReference: true, splynxLedgerId: true, status: true } });
const refsWithLink = new Set(links.map((l) => l.paystackReference));
const ledgerIdsWithLink = new Set(links.map((l) => l.splynxLedgerId).filter((v) => !!v));

const open = await prisma.reconciliationException.findMany({
  where: { status: 'open', kind: { in: ['paystack-only', 'splynx-only'] } },
  select: { id: true, kind: true, paystackReference: true, splynxLedgerId: true, amountNaira: true, title: true },
});

const stale = open.filter((e) =>
  e.kind === 'paystack-only'
    ? !!e.paystackReference && refsWithLink.has(e.paystackReference)
    : !!e.splynxLedgerId && ledgerIdsWithLink.has(e.splynxLedgerId),
);

const out = { openConsidered: open.length, stale: stale.length, applied: APPLY };
if (APPLY && stale.length) {
  // Resolve rather than delete: keeps the audit trail of what was raised.
  const res = await prisma.reconciliationException.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: 'resolved-auto', followUpAt: null, detail: 'Auto-resolved: counterpart now linked (see PaystackReconciliationLink).' },
  });
  out.resolved = res.count;
}
if (!APPLY) {
  out.sample = stale.slice(0, 10).map((s) => ({ kind: s.kind, ref: s.paystackReference, ledger: s.splynxLedgerId, naira: s.amountNaira, title: s.title }));
}
console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
