/**
 * Cross-staff engagement import: reads all 5 corrected CSVs, groups by
 * normalized customer name, and assigns each customer to exactly ONE agent.
 *
 * Ownership rule (deterministic, no data dropped):
 *   1. Prefer the record with the MOST filled-in engagement fields
 *      (feedback, complaint, resolution, risk, follow-up etc.)
 *   2. Tie-break by the agent whose file listed the customer FIRST
 *
 * Usage: npx tsx scripts/import-engagements-deduped.ts /tmp/engagements-final
 */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });
import { readdirSync, readFileSync } from 'fs';
import { basename } from 'path';

const STAFF_BY_FILE: Record<string, string> = {
  aishat: 'Aishat Hamzat',
  christianah: 'Babatunde Christianah',
  joseph: 'Adekomoya Joseph',
  oluwani: 'Olusegun Oluwanishola',
  oluwans: 'Olusegun Oluwanishola',
  victoria: 'Victoria Fokorede',
};

function staffForFile(name: string): string {
  const lower = name.toLowerCase();
  for (const [frag, staff] of Object.entries(STAFF_BY_FILE)) {
    if (lower.includes(frag)) return staff;
  }
  return 'Unknown';
}

function normName(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function splitLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const mWord = s.toLowerCase().match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s*(\d{4})?/);
  if (mWord) {
    const mi = months.findIndex((m) => m.startsWith(mWord[2].slice(0, 3)));
    if (mi >= 0) return new Date(Number(mWord[3] || 2026), mi, Number(mWord[1]));
  }
  const mNum = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mNum) return new Date(Number(mNum[3]), Number(mNum[1]) - 1, Number(mNum[2]));
  return null;
}

/** Count how many engagement fields are actually filled in — richer record wins. */
function richness(row: Record<string, string>): number {
  let score = 0;
  if (row['Call Status']) score += 2;
  if (row['Last Contact Date']) score += 2;
  if (row['FEEDBACK FROM CUSTOMER']) score += 3;
  if (row['Complaint Raised']) score += 1;
  if (row['UPSELL/CROSSELL OPPORTUNTY']) score += 1;
  if (row['Retention Risk']) score += 2;
  if (row['Resolution']) score += 1;
  if (row['Next Followed-Up Date']) score += 1;
  if (row['Phone Number']) score += 1;
  return score;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: tsx import-engagements-deduped.ts <dir-with-csvs>');
  const { prisma } = await import('../src/lib/prisma');
  const { parseCSV } = await import('../src/lib/csv');

  // Load customer ID index
  const customers = await prisma.customer.findMany({
    where: { deleted: false },
    select: { id: true, customerName: true },
  });
  const byNorm = new Map<string, string>();
  for (const c of customers) byNorm.set(normName(c.customerName ?? ''), c.id);

  // Read all files, build per-customer candidate list
  interface Candidate {
    staffName: string;
    fileOrder: number; // lower = earlier file
    rowOrder: number;  // lower = earlier row in file
    richness: number;
    data: Record<string, unknown>;
  }

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  const byCustomer = new Map<string, Candidate[]>();
  let totalRows = 0;

  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi];
    const staffName = staffForFile(file);
    const text = readFileSync(`${dir}/${file}`, 'utf8');
    const rows = parseCSV(text);
    console.log(`${file}: ${rows.length} rows -> ${staffName}`);

    for (const r of rows) {
      const name = (r['Name of Subscriber'] || '').trim();
      if (!name) continue;
      totalRows++;
      const key = normName(name);
      const customerId = byNorm.get(key) ?? null;

      const lastContact = parseDate(r['Last Contact Date'] || '');
      const followUp = parseDate(r['Next Followed-Up Date'] || '');

      const candidate: Candidate = {
        staffName,
        fileOrder: fi,
        rowOrder: totalRows,
        richness: richness(r),
        data: {
          customerId,
          customerName: name,
          btsName: r['BTS / Sites'] || null,
          accountStatus: r['Status'] || null,
          accountType: r['Account Type'] || null,
          plan: r['PLAN'] || null,
          region: r['REGION'] || null,
          phone: r['Phone Number'] || null,
          callStatus: r['Call Status'] || null,
          lastContactAt: lastContact,
          nextFollowUpAt: followUp,
          purpose: r['Purpose of Call'] || null,
          feedback: r['FEEDBACK FROM CUSTOMER'] || null,
          complaint: r['Complaint Raised'] || null,
          upsellNote: r['UPSELL/CROSSELL OPPORTUNTY'] || null,
          retentionRisk: r['Retention Risk'] || null,
          resolution: r['Resolution'] || null,
          staffName,
        },
      };

      const list = byCustomer.get(key) ?? [];
      list.push(candidate);
      byCustomer.set(key, list);
    }
  }

  // Pick winner per customer: highest richness, then earliest file, then earliest row
  console.log(`\nDeduplicating ${byCustomer.size} unique customers...`);
  const winners: Array<Record<string, unknown>> = [];
  let crossStaffDupes = 0;

  for (const [key, candidates] of byCustomer) {
    if (candidates.length === 0) continue;

    const staffSet = new Set(candidates.map((c) => c.staffName));
    if (staffSet.size > 1) crossStaffDupes++;

    candidates.sort((a, b) => {
      if (b.richness !== a.richness) return b.richness - a.richness;
      if (a.fileOrder !== b.fileOrder) return a.fileOrder - b.fileOrder;
      return a.rowOrder - b.rowOrder;
    });

    winners.push(candidates[0].data);
  }

  console.log(`unique customers: ${byCustomer.size}`);
  console.log(`cross-staff duplicates resolved: ${crossStaffDupes}`);

  // Insert
  for (let i = 0; i < winners.length; i += 50) {
    await prisma.engagementLog.createMany({ data: winners.slice(i, i + 50) as never });
  }

  const counts = await prisma.engagementLog.groupBy({ by: ['staffName'], _count: { _all: true } });
  console.log('\nFinal allocation:');
  for (const g of counts.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${g.staffName}: ${g._count._all}`);
  }
  const total = counts.reduce((a, g) => a + g._count._all, 0);
  console.log(`Total: ${total}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
