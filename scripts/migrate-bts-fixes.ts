import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.production', override: true });

if (process.env.DATABASE_URL?.startsWith('mysql://')) {
  process.env.DATABASE_URL = `mariadb://${process.env.DATABASE_URL.slice('mysql://'.length)}`;
}

// One-time fixes per Aug 27 meeting:
// 1. Lagos → Ota alias (no Lagos BTS exists)
// 2. Fix clearly mis-regionalized towers (Pentagon Extension etc.)
// 3. Re-derive MRR for verified customers from Splynx invoices where mrrTotal is 0/stale
// Run: npx tsx scripts/migrate-bts-fixes.ts --apply

const REGION_FIXES: Record<string, string> = {
  'pentagon extension': 'Sagamu',
  'rock city': 'Abeokuta',
  rockcity: 'Abeokuta',
  ogbc: 'Abeokuta',
  'positive fm': 'Akure',
  positive: 'Akure',
  akarigbo: 'Sagamu',
  'akarigbo palace': 'Sagamu',
  ait: 'Ota',
  'ait alagbado': 'Ota',
  alagbado: 'Ota',
};

const BTS_NAME_FIXES: Array<{ pattern: RegExp; canonical: string; region: string }> = [
  { pattern: /rock\s*city/i, canonical: 'Rockcity', region: 'Abeokuta' },
  { pattern: /ogbc/i, canonical: 'OGBC', region: 'Abeokuta' },
  { pattern: /positive\s*fm/i, canonical: 'Positive', region: 'Akure' },
  { pattern: /akarigbo/i, canonical: 'Akarigbo', region: 'Sagamu' },
  { pattern: /ait|alagbado/i, canonical: 'AIT', region: 'Ota' },
];

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const apply = process.argv.includes('--apply');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN (use --apply to write)'}`);

  // 1. Lagos → Ota on Customer
  const lagosCustomers = await prisma.customer.findMany({
    where: { btsName: { contains: 'Lagos' } } as any,
    select: { id: true, customerId: true, btsName: true, btsId: true },
  });
  console.log(`\n[1] Customers with Lagos BTS: ${lagosCustomers.length}`);
  lagosCustomers.slice(0, 10).forEach(c => console.log(` - ${c.customerId} ${c.btsName} -> Ota`));
  if (apply && lagosCustomers.length) {
    for (const c of lagosCustomers) {
      const newName = (c.btsName || '').replace(/Lagos/gi, 'Ota');
      await prisma.customer.update({ where: { id: c.id }, data: { btsName: newName } as any });
    }
    console.log(`Updated ${lagosCustomers.length} customer rows`);
  }

  // 1b. UispSite towers named Lagos → Ota region
  const lagosSites = await prisma.uispSite.findMany({ where: { name: { contains: 'Lagos' } } as any });
  console.log(`\n[1b] UISP sites with Lagos in name: ${lagosSites.length}`);
  for (const s of lagosSites) console.log(` - ${s.name} region=${(s as any).region}`);
  if (apply) {
    for (const s of lagosSites) {
      await prisma.uispSite.update({ where: { id: s.id }, data: { region: 'Ota', btsName: (s.name as string).replace(/Lagos/gi, 'Ota') } as any });
    }
  }

  // 2. Normalize the BTS key on both UISP rows and unified customers. The
  // endpoint records use the BTS name in `btsName`; matching on `name` alone
  // misses nearly all of the affected rows.
  console.log(`\n[2] BTS name and region fixes:`);
  for (const fix of BTS_NAME_FIXES) {
    const sites = await prisma.uispSite.findMany({ where: { btsName: { not: null } } as any });
    const matchingSites = sites.filter((s) => fix.pattern.test(String((s as any).btsName || '')));
    for (const s of matchingSites) {
      console.log(` - ${(s as any).btsName} -> ${fix.canonical} (${fix.region})`);
      if (apply) await prisma.uispSite.update({ where: { id: s.id }, data: { btsName: fix.canonical, region: fix.region } as any });
    }
    const customers = await prisma.customer.findMany({ where: { btsName: { not: null } } as any, select: { id: true, btsName: true } as any });
    const matchingCustomers = customers.filter((c) => fix.pattern.test(String((c as any).btsName || '')));
    if (apply) {
      for (const c of matchingCustomers) await prisma.customer.update({ where: { id: c.id }, data: { btsName: fix.canonical } as any });
    }
    console.log(`   customers: ${matchingCustomers.length}`);
  }

  // 3. Wrong-region towers from meeting notes
  console.log(`\n[3] Region fixes:`);
  for (const [needle, correct] of Object.entries(REGION_FIXES)) {
    const sites = await prisma.uispSite.findMany({ where: { btsName: { contains: needle } } as any });
    for (const s of sites) {
      console.log(` - ${s.name} region ${(s as any).region} -> ${correct}`);
      if (apply) await prisma.uispSite.update({ where: { id: s.id }, data: { region: correct } as any });
    }
  }

  // 4. MRR backfill from Splynx tariff/service data is handled by
  // scripts/backfill-bts-commercial.ts.
  // Verified = btsName not null, matchState != pending, deleted=false, but mrrTotal==0
  const zeroMrr = await prisma.customer.findMany({
    where: { deleted: false, btsName: { not: null }, mrrTotal: 0 } as any,
    select: { id: true, customerId: true, servicePlan: true },
    take: 5,
  });
  console.log(`\n[4] Verified customers with MRR 0 (sample 5 of many): ${zeroMrr.length}`);
  console.log(JSON.stringify(zeroMrr, null, 2));
  // Full MRR reconciliation requires Splynx API fetch per customer (mrr_total + tariff price).
  // We log count here; actual recompute is done by hourly sync after tariff fix, or manual:
  // SELECT customerId, servicePlan FROM Customer WHERE mrrTotal=0 LIMIT 10
  // Then call Splynx /admin/customers/customer/{id} to get correct mrr_total and update.
  console.log(`Run scripts/backfill-bts-commercial.ts to read actual Splynx tariffs and prices.`);

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
