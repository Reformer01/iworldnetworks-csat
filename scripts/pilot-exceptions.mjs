/**
 * Read-only: inspect the remaining reconciliation exceptions and their
 * Splynx ledger rows (payment_type, comment, added_by) for verdicts.
 * Run on server: node scripts/pilot-exceptions.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });
const j = (v) => JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x instanceof Date ? x.toISOString() : x)));

const exceptions = await prisma.reconciliationException.findMany({ where: { status: 'open' } });
const out = [];
for (const e of exceptions) {
  let ledger = null;
  if (e.splynxLedgerId) {
    const row = await prisma.splynxIncomeLedger.findUnique({ where: { id: e.splynxLedgerId } });
    ledger = row
      ? {
          reference: row.reference,
          customerId: row.customerId,
          customerEmail: row.customerEmail,
          amountNaira: row.amountNaira,
          paidAt: row.paidAt,
          paymentType: (row.raw ?? null)?.payment_type ?? null,
          comment: (row.raw ?? null)?.comment ?? null,
          addedBy: (row.raw ?? null)?.added_by ?? null,
          field5: (row.raw ?? null)?.field_5 ?? null,
        }
      : null;
  }
  out.push({
    kind: e.kind,
    title: e.title,
    detail: e.detail,
    amountNaira: e.amountNaira,
    paystackReference: e.paystackReference,
    splynxLedgerId: e.splynxLedgerId,
    ledger,
  });
}
console.log(JSON.stringify(out, null, 1));
await prisma.$disconnect();
