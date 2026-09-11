/** Probe Splynx mail logs, mass-sending history and add-ons for the spam source. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  const probes = [
    '/admin/logs/mail',
    '/admin/logs/email',
    '/admin/config/mail-log',
    '/admin/messages/mass-send',
    '/admin/messages/history',
    '/admin/addons/modules',
    '/admin/config/integrations/addons',
  ];

  for (const p of probes) {
    try {
      const res = await fetch(`${base}${p}`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
      const text = await res.text();
      console.log(res.status, p);
      if (res.ok) {
        console.log('   ', text.slice(0, 500).replace(/\n/g, ' '));
      }
    } catch (e) {
      console.log('ERR', p, (e as Error).message.slice(0, 80));
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
