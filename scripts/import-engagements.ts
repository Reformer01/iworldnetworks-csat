/**
 * Import the support team's daily reachout spreadsheets into EngagementLog.
 * Usage (server): npx tsx scripts/import-engagements.ts /tmp/engagements/*.csv
 * Staff name is derived from the filename (AISHAT -> Aishat Hamzat, ...).
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

/** Split a CSV line honoring quotes. */
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
  // Formats seen: "5th August 2026", "14th August 2026 ", "08/13/2026", "8/17/2026", "5th august"
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

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: tsx import-engagements.ts <dir-with-csvs>');
  const { prisma } = await import('../src/lib/prisma');
  const { parseCSV } = await import('../src/lib/csv');

  // Customer name index for matching.
  const customers = await prisma.customer.findMany({
    where: { deleted: false },
    select: { id: true, customerName: true },
  });
  const byNorm = new Map<string, string>();
  for (const c of customers) byNorm.set(normName(c.customerName ?? ''), c.id);

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  let inserted = 0;
  let matched = 0;

  for (const file of files) {
    const staffName = staffForFile(file);
    const text = readFileSync(`${dir}/${file}`, 'utf8');
    const rows = parseCSV(text);
    console.log(`${file}: ${rows.length} rows -> ${staffName}`);

    for (const r of rows) {
      const name = (r['Name of Subscriber'] || '').trim();
      if (!name) continue;
      const customerId = byNorm.get(normName(name)) ?? null;
      if (customerId) matched++;
      const lastContact = parseDate(r['Last Contact Date'] || '');
      const followUp = parseDate(r['Next Followed-Up Date'] || '');
      await prisma.engagementLog.create({
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
      });
      inserted++;
    }
  }

  console.log(`inserted=${inserted} matchedToCustomer=${matched}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
