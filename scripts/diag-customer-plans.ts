/** Check if Splynx API exposes service plan / tariff info per customer */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  // Get a few customer IDs first
  const custRes = await fetch(`${base}/admin/customers/customer?limit=3`, {
    headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store',
  });
  const custData = await custRes.json();
  const custArr = Array.isArray(custData) ? custData : ((custData as { data?: unknown[] }).data ?? []);
  const testId = (custArr[0] as Record<string, unknown>)?.id;
  console.log('test customer_id:', testId);

  // Check customer detail for category/tariff info
  const detail = await fetch(`${base}/admin/customers/customer/${testId}`, {
    headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store',
  });
  if (detail.ok) {
    const d = await detail.json();
    console.log('customer fields:', Object.keys(d).join(', '));
    console.log('category:', d.category, '| tariff:', d.tariff_id, '| plan:', d.plan_name);
  }

  // Check internet services for this customer
  const svc = await fetch(`${base}/admin/customers/customer/${testId}/internet-services`, {
    headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store',
  });
  console.log('\ninternet-services status:', svc.status);
  if (svc.ok) {
    const svcData = await svc.json();
    const svcArr = Array.isArray(svcData) ? svcData : ((svcData as { data?: unknown[] }).data ?? []);
    for (const s of (svcArr as Array<Record<string, unknown>>).slice(0, 2)) {
      console.log(JSON.stringify({
        tariff_id: s.tariff_id,
        tariff_name: s.tariff_name,
        price: s.price,
        status: s.status,
        taking_ipv4: s.taking_ipv4,
      }));
    }
  }

  // Get tariffs list
  const tarRes = await fetch(`${base}/admin/tariffs/tariffs`, {
    headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store',
  });
  console.log('\ntariffs endpoint:', tarRes.status);
  if (tarRes.ok) {
    const tarData = await tarRes.json();
    const tarArr = Array.isArray(tarData) ? tarData : ((tarData as { data?: unknown[] }).data ?? []);
    for (const t of (tarArr as Array<Record<string, unknown>>).slice(0, 10)) {
      console.log(`${t.id}: ${t.title} (₦${t.price})`);
    }
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
