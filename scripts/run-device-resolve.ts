/**
 * One-shot: run device-first BTS resolution on production.
 * Usage (server): npx tsx scripts/run-device-resolve.ts
 */
import { config } from 'dotenv';
config({ path: '.env' });

async function main() {
  const { runDeviceResolution } = await import('../src/lib/matching/deviceResolve');
  const stats = await runDeviceResolution();
  console.log('device-resolve stats:', JSON.stringify(stats, null, 2));
  const { prisma } = await import('../src/lib/prisma');
  const grouped = await prisma.customer.groupBy({ by: ['matchState'], _count: { _all: true }, where: { deleted: false } });
  console.log('coverage:', JSON.stringify(grouped));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
