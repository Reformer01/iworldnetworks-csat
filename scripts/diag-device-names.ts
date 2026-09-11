/**
 * Diagnostic: can pending customers be resolved via UISP device/site names?
 * Scores token-overlap between customer name and UispDevice.name / UispSite.name.
 */
import { config } from 'dotenv';
config({ path: '.env' });

function tokens(s: string): string[] {
  return s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3);
}

function affinity(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (!sa.size || !sb.size) return 0;
  let hits = 0;
  for (const t of sa) if (sb.has(t)) hits++;
  return hits / Math.min(sa.size, sb.size);
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  const pending = await prisma.customer.findMany({
    where: { deleted: false, matchState: 'pending', status: 'active' },
    select: { id: true, customerName: true },
  });

  const sites = await prisma.uispSite.findMany({
    select: { id: true, name: true, type: true, btsId: true, btsName: true },
  });
  const siteById = new Map(sites.map((s) => [s.id, s]));

  const devices = await prisma.uispDevice.findMany({
    select: { id: true, name: true, siteId: true },
  });

  let strong = 0, weak = 0, none = 0;
  const samples: string[] = [];
  for (const c of pending) {
    let best = { aff: 0, label: '' };
    for (const d of devices) {
      const a1 = affinity(c.customerName ?? '', d.name);
      if (a1 > best.aff) best = { aff: a1, label: `dev:${d.name}` };
      const site = d.siteId ? siteById.get(d.siteId) : null;
      if (site) {
        const a2 = affinity(c.customerName ?? '', site.name);
        if (a2 > best.aff) best = { aff: a2, label: `site:${site.name}` };
      }
    }
    // also direct site-name match (customer premises named after customer)
    for (const s of sites) {
      const a = affinity(c.customerName ?? '', s.name);
      if (a > best.aff) best = { aff: a, label: `direct:${s.name}` };
    }
    if (best.aff >= 0.75) {
      strong++;
      if (samples.length < 10) samples.push(`${c.customerName} => ${best.label} (${best.aff.toFixed(2)})`);
    } else if (best.aff >= 0.5) weak++;
    else none++;
  }

  console.log(JSON.stringify({ pendingActive: pending.length, strong: strong, weak, none }, null, 1));
  console.log(samples.join('\n'));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
