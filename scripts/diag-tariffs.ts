/** Find the correct tariff endpoint and build a tariff_id → name mapping */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  const paths = [
    '/admin/tariffs/internet',
    '/admin/tariffs/tariff',
    '/admin/config/tariffs',
    '/admin/tariffs',
  ];

  for (const p of paths) {
    const res = await fetch(`${base}${p}?limit=5`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
    console.log(res.status, p);
    if (res.ok) {
      const data = await res.json();
      const arr = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? []);
      for (const t of (arr as Array<Record<string, unknown>>).slice(0, 8)) {
        console.log(`  ${t.id}: ${t.title} (₦${t.price ?? '?'})`);
      }
      break; // stop on first success
    }
  }

  // Also check a specific tariff by ID
  const res442 = await fetch(`${base}/admin/tariffs/internet/442`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
  console.log('\ntariff 442:', res442.status);
  if (res442.ok) {
    const t = await res442.json();
    console.log(JSON.stringify({ id: t.id, title: t.title, price: t.price, type: t.type }));
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
