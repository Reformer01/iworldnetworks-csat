/** Audit: do device-resolved matches agree with customer city regions? */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const { customerRegionKey } = await import('../src/lib/matching/score');

  // For each device-matched customer, compare customer city region vs tower region.
  const rows = await prisma.$queryRawUnsafe<Array<{ btsName: string | null; city: string | null; method: string }>>(
    `SELECT c.btsName, c.city, c.matchMethod FROM Customer c
     WHERE c.deleted = 0 AND c.matchState = 'matched'
       AND c.matchMethod IN ('address', 'device-name', 'device-mac', 'device-ip', 'phone')`,
  );

  const towers = await prisma.uispSite.findMany({
    where: { type: 'site', btsName: { not: null } },
    select: { btsName: true, region: true },
  });
  const regionByTower = new Map(towers.map((t) => [t.btsName!, t.region]));

  let agree = 0, disagree = 0, unknown = 0;
  const byMethod: Record<string, { agree: number; disagree: number }> = {};
  const disagreements: string[] = [];

  for (const r of rows) {
    const custRegion = customerRegionKey(r.city);
    const towerRegion = regionByTower.get(r.btsName ?? '') ?? null;
    if (!custRegion || !towerRegion) { unknown++; continue; }
    const m = (byMethod[r.method ?? '?'] ??= { agree: 0, disagree: 0 });
    if (custRegion === towerRegion) { agree++; m.agree++; }
    else {
      disagree++; m.disagree++;
      if (disagreements.length < 8) disagreements.push(`${r.method}: ${r.city} -> ${r.btsName} (${towerRegion})`);
    }
  }

  console.log(`device-resolved: ${rows.length} | region-agree=${agree} disagree=${disagree} unknown=${unknown}`);
  console.log('by method:', JSON.stringify(byMethod));
  console.log('sample disagreements:\n' + disagreements.join('\n'));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
