/** Of the address-matched endpoints, how many have tower ancestry? */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

function tokens(s: string): string[] {
  return s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  const sites = await prisma.uispSite.findMany({
    select: { id: true, name: true, type: true, btsId: true, btsName: true, address: true },
  });
  const endpoints = sites.filter((s) => s.type === 'endpoint');
  const withTower = endpoints.filter((e) => e.btsName);
  console.log('endpoints:', endpoints.length, '| with tower ancestry:', withTower.length, '| WITHOUT:', endpoints.length - withTower.length);

  // Sample endpoints without ancestry — who are their parents?
  const noTower = endpoints.filter((e) => !e.btsName).slice(0, 5);
  const byId = new Map(sites.map((s) => [s.id, s]));
  for (const e of noTower) {
    console.log('no-tower endpoint:', e.name);
  }

  // Full pipeline simulation: pending -> address match -> tower
  const pending = await prisma.customer.findMany({
    where: { deleted: false, matchState: 'pending' },
    select: { id: true, customerName: true, street: true, city: true },
  });

  let resolvable = 0;
  for (const c of pending) {
    const ct = new Set([...tokens(c.street ?? ''), ...tokens(c.city ?? '')]);
    if (!ct.size) continue;
    let best = { n: 0, tower: '' };
    for (const s of endpoints) {
      const st = tokens(s.address ?? '');
      let n = 0;
      for (const t of st) if (ct.has(t)) n++;
      if (n > best.n) best = { n, tower: s.btsName ?? '' };
    }
    if (best.n >= 3 && best.tower) resolvable++;
  }
  console.log('pending customers address-resolvable TO A TOWER:', resolvable, '/', pending.length);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
