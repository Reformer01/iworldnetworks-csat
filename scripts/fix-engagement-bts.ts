/**
 * BTS data accuracy pass for engagement logs:
 *  1. Where a log is linked to a unified Customer, adopt the Customer's
 *     authoritative btsName (product of the matching pipeline).
 *  2. Where not linked, try to normalize the sheet's BTS/Site name against
 *     real UISP tower names (fuzzy token match) and store the canonical name.
 * Usage: npx tsx scripts/fix-engagement-bts.ts
 */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

function norm(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function tokens(s: string): string[] {
  return norm(s).split(' ').filter((t) => t.length >= 3);
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  const logs = await prisma.engagementLog.findMany({
    select: { id: true, customerId: true, customerName: true, btsName: true },
  });

  // Canonical tower names.
  const towers = await prisma.uispSite.findMany({
    where: { type: 'site', btsName: { not: null } },
    select: { btsName: true },
  });
  const towerByNorm = new Map<string, string>();
  for (const t of towers) {
    if (t.btsName) towerByNorm.set(norm(t.btsName), t.btsName);
  }

  // Authoritative customer BTS.
  const customers = await prisma.customer.findMany({
    where: { deleted: false, btsName: { not: null } },
    select: { id: true, btsName: true },
  });
  const btsByCustomerId = new Map(customers.map((c) => [c.id, c.btsName as string]));

  let fromCustomer = 0;
  let normalized = 0;
  let kept = 0;
  let cleared = 0;
  const updates: Array<{ id: string; btsName: string | null }> = [];

  for (const log of logs) {
    let next: string | null = null;

    if (log.customerId && btsByCustomerId.has(log.customerId)) {
      next = btsByCustomerId.get(log.customerId)!;
      if (next !== log.btsName) fromCustomer++;
      else kept++;
    } else if (log.btsName) {
      const n = norm(log.btsName);
      if (towerByNorm.has(n)) {
        next = towerByNorm.get(n)!;
        if (next !== log.btsName) normalized++;
        else kept++;
      } else {
        // Fuzzy: >= half the sheet tokens found in some tower name.
        const lt = tokens(log.btsName);
        let best: { name: string; hits: number } | null = null;
        for (const [tnorm, tname] of towerByNorm) {
          const tt = new Set(tokens(tnorm));
          const hits = lt.filter((t) => tt.has(t)).length;
          if (hits > 0 && (!best || hits > best.hits)) best = { name: tname, hits };
        }
        if (best && best.hits >= Math.max(1, Math.ceil(lt.length / 2))) {
          next = best.name;
          normalized++;
        } else {
          next = null; // unverifiable — clear it rather than keep wrong data
          cleared++;
        }
      }
    }

    if (next !== log.btsName) updates.push({ id: log.id, btsName: next });
    else if (next !== null) kept++;
  }

  console.log(`logs=${logs.length} fromCustomer=${fromCustomer} normalized=${normalized} cleared=${cleared} unchanged=${kept}`);
  for (let i = 0; i < updates.length; i += 100) {
    await Promise.all(
      updates.slice(i, i + 100).map((u) =>
        prisma.engagementLog.update({ where: { id: u.id }, data: { btsName: u.btsName } }).catch(() => undefined),
      ),
    );
  }
  console.log(`applied ${updates.length} updates`);

  const withBts = await prisma.engagementLog.count({ where: { btsName: { not: null } } });
  console.log(`logs with verified BTS: ${withBts}/${logs.length} (${((withBts / logs.length) * 100).toFixed(1)}%)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
