/** Focused probe: recent 2026 payments + invoices + prepayment patterns */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  async function get(path: string): Promise<{ status: number; data: unknown }> {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
    return { status: res.status, data: res.ok ? await res.json() : null };
  }

  // 1. Recent payments (Aug 2026) — full field dump
  console.log('=== RECENT PAYMENTS (Aug 2026) ===');
  const payRes = await get('/admin/finance/payments?limit=5&sort=id-desc');
  if (payRes.status === 200) {
    const arr = Array.isArray(payRes.data) ? payRes.data : ((payRes.data as { data?: unknown[] })?.data ?? []);
    for (const p of (arr as Array<Record<string, unknown>>).slice(0, 3)) {
      // Show only non-empty/non-zero fields
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(p)) {
        if (v !== null && v !== '' && v !== 0 && v !== '0' && v !== '0.0000') clean[k] = v;
      }
      console.log(JSON.stringify(clean, null, 1));
      console.log('---');
    }
  }

  // 2. Recent invoices — look for prepayment descriptions
  console.log('\n=== RECENT INVOICES ===');
  const invRes = await get('/admin/finance/invoices?limit=10&sort=id-desc');
  if (invRes.status === 200) {
    const arr = Array.isArray(invRes.data) ? invRes.data : ((invRes.data as { data?: unknown[] })?.data ?? []);
    for (const inv of (arr as Array<Record<string, unknown>>).slice(0, 5)) {
      console.log(JSON.stringify({
        id: inv.id,
        number: inv.number,
        customer_id: inv.customer_id,
        total: inv.total,
        status: inv.status,
        date_add: inv.date_add,
        period_start: inv.period_start,
        period_end: inv.period_end,
        description: String(inv.description ?? '').slice(0, 120),
        notes: String(inv.notes ?? '').slice(0, 80),
      }));
    }
  }

  // 3. Search for prepayment invoices specifically
  console.log('\n=== PREPAYMENT SEARCH (invoices with "prepay" or "advance" or "month") ===');
  const searchRes = await get('/admin/finance/invoices?limit=50&sort=id-desc');
  if (searchRes.status === 200) {
    const arr = Array.isArray(searchRes.data) ? searchRes.data : ((searchRes.data as { data?: unknown[] })?.data ?? []);
    let found = 0;
    for (const inv of (arr as Array<Record<string, unknown>>)) {
      const searchable = `${inv.description ?? ''} ${inv.notes ?? ''} ${inv.number ?? ''}`.toLowerCase();
      if (/prepay|advance|month.*(3|6|12)|quarter|annual/i.test(searchable)) {
        found++;
        if (found <= 5) {
          console.log(JSON.stringify({
            id: inv.id, number: inv.number, total: inv.total,
            description: String(inv.description ?? '').slice(0, 150),
          }));
        }
      }
    }
    console.log(`prepayment-pattern matches in last 50: ${found}`);
  }

  // 4. Tariff plans for classification
  console.log('\n=== TARIFF PLANS ===');
  const tarRes = await get('/admin/tariffs/tariff');
  if (tarRes.status === 200) {
    const arr = Array.isArray(tarRes.data) ? tarRes.data : ((tarRes.data as { data?: unknown[] })?.data ?? []);
    for (const t of (arr as Array<Record<string, unknown>>).slice(0, 15)) {
      console.log(`${t.id}: ${t.title} (₦${t.price}) type=${t.type}`);
    }
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
