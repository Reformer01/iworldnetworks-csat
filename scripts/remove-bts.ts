import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.production', override: true });

if (process.env.DATABASE_URL?.startsWith('mysql://')) {
  process.env.DATABASE_URL = `mariadb://${process.env.DATABASE_URL.slice('mysql://'.length)}`;
}

import { EXCLUDED_BTS_NAMES, getExcludedUispSiteIds, isExcludedBtsName } from '../src/lib/uisp-exclusions';

let prismaClient: typeof import('../src/lib/prisma').prisma | undefined;

function isExcludedCustomer(customer: { btsId: string | null; btsName: string | null }, rootIds: Set<string>): boolean {
  return (customer.btsId !== null && rootIds.has(customer.btsId)) || isExcludedBtsName(customer.btsName);
}

async function main() {
  // Load Prisma only after the production mysql:// URL has been normalized.
  prismaClient = (await import('../src/lib/prisma')).prisma;
  const prisma = prismaClient;
  const apply = process.argv.includes('--apply');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN (use --apply to write)'}`);
  console.log(`Excluded BTS roots: ${EXCLUDED_BTS_NAMES.join(' | ')}`);

  const sites = await prisma.uispSite.findMany({
    select: { id: true, name: true, type: true, parentId: true, btsId: true, btsName: true },
  });
  const excludedSiteIds = getExcludedUispSiteIds(
    sites.map((site) => ({
      id: site.id,
      identification: {
        id: site.id,
        name: site.name,
        type: site.type,
        parent: site.parentId ? { id: site.parentId } : null,
      },
    })),
  );
  const roots = sites.filter((site) => site.type === 'site' && isExcludedBtsName(site.name));
  const rootIds = new Set(roots.map((site) => site.id));

  const devices = excludedSiteIds.size
    ? await prisma.uispDevice.findMany({ where: { siteId: { in: [...excludedSiteIds] } }, select: { id: true, siteId: true, name: true } })
    : [];
  const customers = await prisma.customer.findMany({
    where: { OR: [{ btsName: { not: null } }, ...(rootIds.size ? [{ btsId: { in: [...rootIds] } }] : [])] } as never,
    select: { id: true, customerId: true, customerName: true, btsId: true, btsName: true, lifecycle: true, mrrTotal: true },
  });
  const affectedCustomers = customers.filter((customer) => isExcludedCustomer(customer, rootIds));

  console.log(`\nMatched roots: ${roots.length}`);
  for (const root of roots) console.log(` - ${root.id} ${JSON.stringify(root.name)}`);
  console.log(`Matched UISP site rows: ${excludedSiteIds.size}`);
  console.log(`Matched UISP devices: ${devices.length}`);
  console.log(`Matched customers to unassign: ${affectedCustomers.length}`);
  for (const customer of affectedCustomers.slice(0, 25)) {
    console.log(
      ` - ${customer.customerId} ${customer.customerName ?? ''} | ${customer.btsName ?? customer.btsId ?? ''} | MRR ${customer.mrrTotal ?? 0}`,
    );
  }

  if (!apply) {
    console.log('\nDry run complete. No rows changed.');
    return;
  }

  if (affectedCustomers.length > 0) {
    await prisma.customer.updateMany({
      where: { id: { in: affectedCustomers.map((customer) => customer.id) } },
      data: { btsId: null, btsName: null },
    });
  }
  if (devices.length > 0) {
    await prisma.uispDevice.deleteMany({ where: { id: { in: devices.map((device) => device.id) } } });
  }
  if (excludedSiteIds.size > 0) {
    await prisma.uispSite.deleteMany({ where: { id: { in: [...excludedSiteIds] } } });
  }

  console.log(`\nRemoved ${excludedSiteIds.size} UISP site rows and ${devices.length} devices.`);
  console.log(`Unassigned ${affectedCustomers.length} customers; billing and MRR data were preserved.`);
}

main()
  .catch((error) => {
    console.error('Removal failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prismaClient?.$disconnect());
