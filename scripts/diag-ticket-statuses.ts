/**
 * Probe Splynx ticket statuses to find the "closed" indicator.
 * Also checks recent ticket webhook payloads for status fields.
 */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  // 1. Get ticket statuses config
  for (const p of ['/admin/config/tickets/statuses', '/admin/tickets/statuses', '/admin/config/ticket-statuses']) {
    const res = await fetch(`${base}${p}`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
    console.log(res.status, p);
    if (res.ok) {
      const body = await res.text();
      console.log('  ', body.slice(0, 500));
    }
  }

  // 2. Get a few recent tickets to see their status fields
  const res2 = await fetch(`${base}/admin/tickets/ticket?limit=5`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
  if (res2.ok) {
    const data = await res2.json();
    const tickets = Array.isArray(data) ? data : data.data ?? [];
    console.log('\n=== Recent tickets ===');
    for (const t of (tickets as Array<Record<string, unknown>>).slice(0, 3)) {
      console.log(JSON.stringify({
        id: t.id,
        status: t.status,
        status_id: t.status_id,
        subject: (t.subject as string ?? '').slice(0, 40),
      }));
    }
  }

  // 3. Get ticket status IDs dictionary
  const res3 = await fetch(`${base}/admin/tickets/ticket-statuses`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
  console.log('\nTicket statuses endpoint:', res3.status);
  if (res3.ok) {
    const body = await res3.text();
    console.log(body.slice(0, 500));
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
