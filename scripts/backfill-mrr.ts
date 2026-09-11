import { prisma } from '../src/lib/prisma';
import { getSplynxConfig, buildAuthHeader, parseSplynxApiDate } from '../src/lib/splynx-api';

async function splynxGetCustomer(id: string) {
  const env = getSplynxConfig();
  const base = String(env.host).replace(/\/+$/, '') + '/api/2.0';
  const auth = await buildAuthHeader();
  const res = await fetch(`${base}/admin/customers/customer/${encodeURIComponent(id)}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
    cache: 'no-store',
  } as any);
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, any>>;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const verbose = process.argv.includes('--verbose');
  console.log(`Backfill MRR — mode ${apply ? 'APPLY' : 'DRY-RUN'}`);
  // Prioritize verified customers that actually have a servicePlan but stale mrr — those are fixable via plan price
  const zeros = (await prisma.customer.findMany({
    where: { deleted: false, btsName: { not: null }, mrrTotal: 0, servicePlan: { not: '' } } as any,
    select: { id: true, customerId: true, customerName: true, servicePlan: true, mrrTotal: true },
    take: 500,
  })) as any[];
  console.log(`Found ${zeros.length} verified+plan customers with mrrTotal=0 (capped 500)`);
  if (zeros.length === 0) {
    const totalZero = await prisma.customer.count({ where: { deleted: false, btsName: { not: null }, mrrTotal: 0 } as any });
    console.log(`Total verified zero-MRR (any plan) = ${totalZero} — all have empty servicePlan, will also try Splynx fetch for them`);
    // fallback: take any zeros and try Splynx anyway
    const fallback = (await prisma.customer.findMany({
      where: { deleted: false, btsName: { not: null }, mrrTotal: 0 } as any,
      select: { id: true, customerId: true, customerName: true, servicePlan: true, mrrTotal: true },
      take: 100,
    })) as any[];
    console.log(`Fallback sample ${fallback.length} (empty plan) — will attempt Splynx tariff lookup`);
    zeros.push(...fallback.slice(0, 50));
  }
  let updated = 0;
  let skipped = 0;
  for (const c of zeros) {
    try {
      const data = await splynxGetCustomer(c.customerId);
      if (!data) { skipped++; continue; }
      const mrrRaw = data.mrr_total ?? data.mrrTotal ?? data.monthly_cost ?? null;
      const mrr = parseFloat(String(mrrRaw ?? '0')) || 0;
      const plan = String(data.tariff_name ?? data.plan ?? data.service_name ?? data.tariff?.title ?? '').trim();
      // fallback to tariff price if mrr still 0 but plan known
      const planMrr: Record<string, number> = { 'H-Lite': 27500, 'H-Max': 36500, 'H-Pro': 43500, 'U-Lite': 32500, 'U-Max': 43500, 'U-Pro': 58000, 'N-10K': 10000, 'N-15K': 15000, 'N-22-5K': 22500 };
      let effective = mrr > 0 ? mrr : (plan ? (planMrr[plan] ?? 0) : 0);
      // Last resort: try latest paid invoice total for this customer via Splynx
      if (effective === 0) {
        try {
          const env2 = getSplynxConfig();
          const base2 = String(env2.host).replace(/\/+$/, '') + '/api/2.0';
          const auth2 = await buildAuthHeader();
          const invRes = await fetch(`${base2}/admin/finance/invoices?customer_id=${encodeURIComponent(c.customerId)}&limit=1`, { headers: { Authorization: auth2, Accept: 'application/json' } } as any);
          if (invRes.ok) {
            const invData: any = await invRes.json();
            const inv = Array.isArray(invData) ? invData[0] : invData?.data?.[0];
            const invTotal = parseFloat(String(inv?.total ?? '0')) || 0;
            if (invTotal > 0 && invTotal < 1000000) effective = invTotal;
          }
        } catch {}
      }
      if (effective === 0) {
        if (verbose) console.log(`skip ${c.customerId} ${c.customerName} plan='${plan}' mrr_raw=${mrrRaw} -> 0`);
        skipped++; continue;
      }
      console.log(`${c.customerId} ${c.customerName} plan='${plan}' mrr ${c.mrrTotal} -> ${effective}`);
      if (apply) {
        await prisma.customer.update({ where: { id: c.id }, data: { mrrTotal: effective, servicePlan: plan || c.servicePlan } as any });
        updated++;
      }
      // be gentle on Splynx API
      await new Promise(r => setTimeout(r, 120));
    } catch (e) {
      console.error(`fail ${c.customerId}`, e);
      skipped++;
    }
  }
  console.log(`Done. ${apply ? `updated ${updated}` : `would update ~${zeros.length - skipped}`} skipped ${skipped}`);
}

main().catch(e => { console.error(e); process.exit(1); });
