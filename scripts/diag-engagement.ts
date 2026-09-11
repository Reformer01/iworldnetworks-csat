/** Debug: replicate the engagement API queries. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const g = await prisma.engagementLog.groupBy({ by: ['staffName'], _count: { _all: true } });
  console.log('groupBy:', JSON.stringify(g));
  const logs = await prisma.engagementLog.findMany({ orderBy: { updatedAt: 'desc' }, take: 2 });
  console.log('sample:', JSON.stringify(logs[0]?.customerName), logs.length);
  await prisma.$disconnect();
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
