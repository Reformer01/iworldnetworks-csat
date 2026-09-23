/**
 * Historical backfill driver — enqueues:
 *   1. a FULL Paystack sync (every page, all statuses)
 *   2. reconciliation (ledger import + matching) for every month present in
 *      PaystackTransaction data
 *
 * Jobs land on the existing BullMQ queues consumed by the running pm2 app
 * (concurrency 1, so they run one at a time in the background).
 *
 * Usage (server): npx tsx scripts/pilot-backfill-history.mjs [--months=2026-01,2026-02]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { getPaystackSyncQueue } from '../src/lib/queues/paystack-sync-queue';
import { getReconciliationQueue } from '../src/lib/queues/reconciliation-queue';

const arg = process.argv.find((a) => a.startsWith('--months='));
const url = (process.env.DATABASE_URL ?? '').replace(/^mysql:\/\//, 'mariadb://');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url), log: [] });

// Months that actually have Paystack transactions (WAT month key per row).
const rows = await prisma.paystackTransaction.findMany({ where: { paidAt: { not: null } }, select: { paidAt: true } });
const monthSet = new Set();
for (const r of rows) {
  const w = new Date(new Date(r.paidAt).getTime() + 3600000);
  monthSet.add(`${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}`);
}
const months = arg
  ? arg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean)
  : [...monthSet].sort();

const paystackQueue = getPaystackSyncQueue();
const reconQueue = getReconciliationQueue();

await paystackQueue.add('full-backfill', {
  maxPages: 1,
  statuses: ['success', 'failed', 'abandoned'],
  full: true,
});

for (const month of months) {
  await reconQueue.add('reconcile', { kind: 'reconcile', month });
}

console.log(
  JSON.stringify(
    {
      paystackMonthsFound: [...monthSet].sort(),
      queuedFullPaystackSync: true,
      queuedReconcileMonths: months,
      paystackJobCounts: await paystackQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      reconJobCounts: await reconQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    },
    null,
    1,
  ),
);

await paystackQueue.close();
await reconQueue.close();
await prisma.$disconnect();
process.exit(0);
