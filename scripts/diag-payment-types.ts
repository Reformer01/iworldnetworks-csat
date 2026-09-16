/** Read-only: group SplynxPayment mirror rows by paymentType to see real Splynx values. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL ?? '');
  const prisma = new PrismaClient({ adapter, log: ['error'] });
  try {
    const groups = await prisma.splynxPayment.groupBy({
      by: ['paymentType'],
      _count: { _all: true },
      _sum: { amount: true },
      orderBy: { _count: { paymentType: 'desc' } },
    });
    console.log('=== paymentType values in SplynxPayment mirror ===');
    for (const g of groups) {
      const total = (g._sum.amount ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
      console.log(`${JSON.stringify(g.paymentType)}  count=${g._count._all}  total=₦${total}`);
    }
    for (const g of groups.slice(0, 6)) {
      const samples = await prisma.splynxPayment.findMany({
        where: { paymentType: g.paymentType },
        select: { receiptNumber: true, note: true },
        take: 5,
        orderBy: { paymentId: 'desc' },
      });
      console.log(`\nSamples for ${JSON.stringify(g.paymentType)}:`);
      for (const s of samples) console.log(`  receipt=${s.receiptNumber} note=${(s.note ?? '').slice(0, 60)}`);
    }
    const total = await prisma.splynxPayment.count();
    console.log(`\nTotal mirror rows: ${total}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

