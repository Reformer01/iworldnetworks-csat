/** Quick coverage check. */
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const g = await prisma.customer.groupBy({ by: ['matchState'], _count: { _all: true }, where: { deleted: false } });
  const m = await prisma.customer.groupBy({ by: ['matchMethod'], _count: { _all: true }, where: { deleted: false, matchState: 'matched' } });
  console.log('coverage:', JSON.stringify(g));
  console.log('by method:', JSON.stringify(m));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
