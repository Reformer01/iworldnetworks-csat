/** Check if Splynx now returns service data (MAC/IP) for pending customers. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const { getCustomerServices } = await import('../src/lib/splynx-api');

  const pending = await prisma.customer.findMany({
    where: { deleted: false, matchState: 'pending', status: 'active' },
    select: { customerId: true, customerName: true },
    take: 10,
  });

  let ok = 0, err = 0, withMac = 0, withIp = 0;
  for (const c of pending) {
    try {
      const svcs = await getCustomerServices(c.customerId);
      ok++;
      for (const s of svcs) {
        if (s.mac) withMac++;
        if (s.ipv4) withIp++;
      }
      const sample = svcs[0];
      if (sample) console.log(`${c.customerName}: mac=${sample.mac || '—'} ip=${sample.ipv4 || '—'} sector=${sample.sector_id || '—'}`);
    } catch (e) {
      err++;
      console.log(`${c.customerName}: ERROR ${(e as Error).message.slice(0, 60)}`);
    }
  }
  console.log(`\nok=${ok} err=${err} withMac=${withMac} withIp=${withIp}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
