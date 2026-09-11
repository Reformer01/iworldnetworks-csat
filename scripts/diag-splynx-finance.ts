/**
 * Deep-dive into Splynx finance data structure.
 * Goal: understand payments, invoices, prepayments, and customer lifecycle.
 */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  async function get(path: string): Promise<unknown> {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) return { httpStatus: res.status };
    return res.json();
  }

  // 1. Recent payments — what fields exist?
  console.log('=== PAYMENTS ===');
  const payments = await get('/admin/finance/payments?limit=5&sort=id-desc') as Record<string, unknown> | { httpStatus: number };
  if ('httpStatus' in payments) {
    console.log('status:', payments.httpStatus);
  } else {
    const arr = Array.isArray(payments) ? payments : ((payments as { data?: unknown[] }).data ?? []);
    for (const p of (arr as Array<Record<string, unknown>>).slice(0, 3)) {
      console.log(JSON.stringify(p, null, 1).slice(0, 800));
      console.log('---');
    }
  }

  // 2. Recent invoices — what fields exist?
  console.log('\n=== INVOICES ===');
  const invoices = await get('/admin/finance/invoices?limit=5&sort=id-desc') as Record<string, unknown> | { httpStatus: number };
  if ('httpStatus' in invoices) {
    console.log('status:', invoices.httpStatus);
  } else {
    const arr = Array.isArray(invoices) ? invoices : ((invoices as { data?: unknown[] }).data ?? []);
    for (const inv of (arr as Array<Record<string, unknown>>).slice(0, 2)) {
      console.log(JSON.stringify(inv, null, 1).slice(0, 1000));
      console.log('---');
    }
  }

  // 3. Check for prepayment indicators — search invoices with "prepay" or "advance" in description
  console.log('\n=== PREPAYMENT SEARCH ===');
  const allInv = await get('/admin/finance/invoices?limit=20&sort=id-desc') as Record<string, unknown> | { httpStatus: number };
  if (!('httpStatus' in allInv)) {
    const invArr = Array.isArray(allInv) ? allInv : ((allInv as { data?: unknown[] }).data ?? []);
    for (const inv of (invArr as Array<Record<string, unknown>>)) {
      const desc = String(inv.description ?? '') + String(inv.notes ?? '');
      if (/prepay|advance|future/i.test(desc)) {
        console.log('PREPAYMENT FOUND:', JSON.stringify({ id: inv.id, number: inv.number, total: inv.total, description: inv.description, notes: inv.notes }).slice(0, 300));
      }
    }
  }

  // 4. Customer categories + tariffs
  console.log('\n=== TARIFFS ===');
  const tariffs = await get('/admin/tariffs/tariff') as Record<string, unknown> | { httpStatus: number };
  if (!('httpStatus' in tariffs)) {
    const tArr = Array.isArray(tariffs) ? tariffs : ((tariffs as { data?: unknown[] }).data ?? []);
    for (const t of (tArr as Array<Record<string, unknown>>).slice(0, 10)) {
      console.log(JSON.stringify({ id: t.id, title: t.title, price: t.price, type: t.type }));
    }
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
