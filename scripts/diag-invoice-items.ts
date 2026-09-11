/** Deep dive into invoice items + date_till for prepayment detection */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  // Get recent invoices with full detail including items
  const res = await fetch(`${base}/admin/finance/invoices?limit=10&sort=id-desc`, {
    headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store',
  });
  const data = await res.json();
  const arr = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? []);

  console.log('=== Invoice deep dive ===');
  for (const inv of (arr as Array<Record<string, unknown>>).slice(0, 5)) {
    const output: Record<string, unknown> = {
      id: inv.id,
      number: String(inv.number ?? '').slice(0, 30),
      total: inv.total,
      status: inv.status,
      date_created: inv.date_created,
      date_payment: inv.date_payment,
      date_till: inv.date_till,
      type: inv.type,
    };

    // Parse items
    const items = inv.items;
    if (items && typeof items === 'object') {
      try {
        const parsed = typeof items === 'string' ? JSON.parse(items as string) : items;
        output.items = parsed;
      } catch {
        output.items_raw = String(items).slice(0, 200);
      }
    }

    // Check note/memo/description at top level
    if (inv.note) output.note = String(inv.note).slice(0, 100);
    if (inv.memo) output.memo = String(inv.memo).slice(0, 100);

    console.log(JSON.stringify(output, null, 1));
    console.log('---');
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
