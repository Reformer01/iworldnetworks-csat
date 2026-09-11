/** Inspect this API key's own permissions via the config endpoints. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  for (const p of ['/admin/config/api-keys', '/admin/config/administration/api-keys']) {
    const res = await fetch(`${base}${p}`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
    const body = await res.text();
    console.log(res.status, p);
    if (res.ok) {
      try {
        const json = JSON.parse(body);
        const rows = Array.isArray(json) ? json : json.data ?? [];
        for (const k of rows as Array<Record<string, unknown>>) {
          console.log('key:', String(k.key).slice(0, 6), 'permissions:', JSON.stringify(k.permissions ?? k.rules ?? k).slice(0, 400));
        }
      } catch {
        console.log(body.slice(0, 300));
      }
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
