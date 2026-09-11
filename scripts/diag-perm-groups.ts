/** Check which newly-granted permission groups actually took effect. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  const probes: Array<[string, string]> = [
    ['config', '/admin/config/company'],
    ['logs', '/admin/logs/api'],
    ['networking', '/admin/networking/routers'],
    ['customers', '/admin/customers/customer/1194'],
    ['INTERNET-SERVICES', '/admin/customers/customer/1194/internet-services'],
    ['support/tickets', '/admin/tickets/ticket'],
  ];
  for (const [label, p] of probes) {
    const res = await fetch(`${base}${p}`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
    console.log(res.status, label, p);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
