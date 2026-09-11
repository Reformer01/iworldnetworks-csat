/** Trace the address path for sample pending customers. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

function addrTokens(s: string): string[] {
  return s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  const sites = await prisma.uispSite.findMany({
    where: { type: 'endpoint', address: { not: null } },
    select: { id: true, name: true, btsId: true, btsName: true, address: true },
  });

  const pending = await prisma.customer.findMany({
    where: { deleted: false, matchState: 'pending', status: 'active' },
    select: { id: true, customerName: true, street: true, city: true },
    take: 400,
  });

  let shown = 0;
  for (const c of pending) {
    const ct = new Set([...addrTokens(c.city ?? ''), ...addrTokens(c.street ?? '')]);
    if (!ct.size) continue;
    const perTower = new Map<string, { n: number; btsName: string | null; hasAncestry: boolean; epName: string }>();
    for (const s of sites) {
      const st = addrTokens(s.address ?? '');
      let n = 0;
      for (const t of st) if (ct.has(t)) n++;
      if (n === 0) continue;
      const k = s.btsId ?? s.id;
      const cur = perTower.get(k);
      if (!cur || n > cur.n) perTower.set(k, { n, btsName: s.btsName, hasAncestry: !!(s.btsId && s.btsName), epName: s.name });
    }
    const ranked = [...perTower.values()].sort((a, b) => b.n - a.n);
    const best = ranked[0];
    const second = ranked[1]?.n ?? 0;
    if (best && best.n >= 6 && shown < 8) {
      shown++;
      console.log(`${c.customerName} | best=${best.n}v${second} tower="${best.btsName}" ancestry=${best.hasAncestry} ep="${best.epName.slice(0, 30)}"`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
