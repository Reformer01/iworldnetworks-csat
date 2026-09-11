/** Get recent Splynx tickets to see status field values. */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  const res = await fetch(`${base}/admin/tickets/ticket?limit=5`, {
    headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store',
  });
  console.log('status:', res.status);
  if (res.ok) {
    const data = await res.json();
    const tickets = Array.isArray(data) ? data : (data as { data?: unknown[] }).data ?? [];
    for (const t of (tickets as Array<Record<string, unknown>>).slice(0, 5)) {
      console.log(JSON.stringify({ id: t.id, status: t.status, status_id: t.status_id, subject: String(t.subject ?? '').slice(0, 40) }));
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
