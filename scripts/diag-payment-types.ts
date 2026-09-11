/** Understand payment_type values + find prepayment patterns in invoices */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { buildAuthHeader, getSplynxConfig } = await import('../src/lib/splynx-api');
  const env = getSplynxConfig();
  const auth = await buildAuthHeader();
  const base = env.host!.replace(/\/+$/, '') + '/api/2.0';

  // 1. Get payments from Aug 2026 — group by payment_type
  console.log('=== Payment types (Aug 2026) ===');
  const payRes = await fetch(`${base}/admin/finance/payments?limit=100&sort=id-desc`, {
    headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store',
  });
  const payData = await payRes.json();
  const payArr = Array.isArray(payData) ? payData : ((payData as { data?: unknown[] }).data ?? []);
  const typeCounts = new Map<number, { count: number; sampleField4: string; sampleReceipt: string }>();
  for (const p of payArr as Array<Record<string, unknown>>) {
    const pt = Number(p.payment_type ?? 0);
    const entry = typeCounts.get(pt) ?? { count: 0, sampleField4: '', sampleReceipt: '' };
    entry.count++;
    if (!entry.sampleField4 && p.field_4) entry.sampleField4 = String(p.field_4);
    if (!entry.sampleReceipt && p.receipt_number) entry.sampleReceipt = String(p.receipt_number);
    typeCounts.set(pt, entry);
  }
  for (const [type, info] of typeCounts) {
    console.log(`  type ${type}: ${info.count}x | field_4="${info.sampleField4}" | receipt="${info.sampleReceipt.slice(0, 50)}"`);
  }

  // 2. Check invoices for period fields
  console.log('\n=== Invoice fields (sample) ===');
  const invRes = await fetch(`${base}/admin/finance/invoices?limit=3&sort=id-desc`, {
    headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store',
  });
  const invData = await invRes.json();
  const invArr = Array.isArray(invData) ? invData : ((invData as { data?: unknown[] }).data ?? []);
  if (invArr.length > 0) {
    console.log('All fields:', Object.keys(invArr[0] as Record<string, unknown>).join(', '));
    const inv = invArr[0] as Record<string, unknown>;
    console.log(JSON.stringify({
      id: inv.id, number: inv.number, total: inv.total,
      status: inv.status, date_add: inv.date_add,
      period_start: inv.period_start, period_end: inv.period_end,
      description: String(inv.description ?? '').slice(0, 100),
      notes: String(inv.notes ?? '').slice(0, 80),
    }, null, 1));
  }

  // 3. Look at descriptions across many invoices for prepayment patterns
  console.log('\n=== Invoice descriptions (last 30) ===');
  const invRes2 = await fetch(`${base}/admin/finance/invoices?limit=30&sort=id-desc`, {
    headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store',
  });
  const invData2 = await invRes2.json();
  const invArr2 = Array.isArray(invData2) ? invData2 : ((invData2 as { data?: unknown[] }).data ?? []);
  for (const inv of invArr2 as Array<Record<string, unknown>>) {
    const desc = String(inv.description ?? '').trim();
    const notes = String(inv.notes ?? '').trim();
    if (desc || notes) {
      console.log(`  #${inv.number}: desc="${desc.slice(0, 80)}" notes="${notes.slice(0, 60)}"`);
    }
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
