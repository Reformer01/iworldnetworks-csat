/** Verify Splynx internet-services access + sample fingerprints. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const { getCustomerServices } = await import('../src/lib/splynx-api');

  const pending = await prisma.customer.findMany({
    where: { deleted: false, matchState: 'pending', status: 'active' },
    select: { customerId: true, customerName: true },
    take: 6,
  });

  let ok = 0;
  let withMac = 0;
  let withIp = 0;
  let withSector = 0;
  for (const c of pending) {
    try {
      const svcs = await getCustomerServices(c.customerId);
      ok++;
      for (const s of svcs) {
        if (s.mac) withMac++;
        if (s.ipv4) withIp++;
        if (s.sector_name) withSector++;
      }
      console.log(`${c.customerName}: ${svcs.length} svc`, svcs.slice(0, 2).map((s) => ({ mac: s.mac, ip: s.ipv4, sector: s.sector_name, router: s.router_name })));
    } catch (e) {
      console.log(`${c.customerName}: ERROR ${(e as Error).message.slice(0, 80)}`);
    }
  }
  console.log(`ok=${ok}/6 withMac=${withMac} withIp=${withIp} withSector=${withSector}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
