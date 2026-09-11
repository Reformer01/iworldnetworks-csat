/** Quantify address/GPS matching potential for pending customers. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

function tokens(s: string): string[] {
  return s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  const pending = await prisma.customer.findMany({
    where: { deleted: false, matchState: 'pending' },
    select: { id: true, customerName: true, street: true, city: true },
  });
  const withStreet = pending.filter((c) => c.street && c.street.trim().length > 3);
  console.log('pending total:', pending.length, '| with street:', withStreet.length);

  const sites = await prisma.uispSite.findMany({
    where: { type: 'endpoint', address: { not: null } },
    select: { id: true, address: true },
  });
  console.log('endpoints with address:', sites.length);

  // Token-overlap between customer street+city and endpoint address.
  let hits = 0;
  const samples: string[] = [];
  for (const c of withStreet) {
    const ct = new Set([...tokens(c.street ?? ''), ...tokens(c.city ?? '')]);
    if (!ct.size) continue;
    let best = { n: 0, addr: '' };
    for (const s of sites) {
      const st = tokens(s.address ?? '');
      let n = 0;
      for (const t of st) if (ct.has(t)) n++;
      if (n > best.n) best = { n, addr: s.address ?? '' };
    }
    if (best.n >= 3) {
      hits++;
      if (samples.length < 8) samples.push(`${c.customerName} [${c.street}, ${c.city}] => ${best.addr} (${best.n})`);
    }
  }
  console.log('street-match candidates (>=3 shared tokens):', hits);
  console.log(samples.join('\n'));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
