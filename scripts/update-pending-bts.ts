import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as fs from 'fs';
import * as path from 'path';

interface BtsReviewRow {
  customerId: string;
  customerName: string;
  currentBts: string;
  email: string;
  phone: string;
  city: string;
  street: string;
  category: string;
  mrr: string;
}

function parseCsv(csv: string): BtsReviewRow[] {
  const rows: BtsReviewRow[] = [];
  let current = '';
  let inQuotes = false;
  let field = '';
  const fields: string[] = [];
  const lines = csv.split('\n');

  for (const line of lines) {
    let i = 0;
    while (i < line.length) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(field);
        field = '';
      } else {
        field += char;
      }
      current += char;
      i++;
    }

    if (!inQuotes) {
      fields.push(field);
      field = '';

      // CSV columns: Customer ID,Customer Name,Current BTS,Email,Phone,City,Street,,,,Category,MRR,
      // Index:        0              1             2          3      4     5      6     7 8 9 10   11  12
      if (fields.length >= 13) {
        const currentBts = fields[2].trim(); // Current BTS is at index 2
        if (fields[0] !== 'Customer ID' && currentBts) {
          rows.push({
            customerId: fields[0].trim(),
            customerName: fields[1].trim(),
            email: fields[3].trim(),
            phone: fields[4].trim(),
            city: fields[5].trim(),
            street: fields[6].trim(),
            category: fields[11].trim(),
            mrr: fields[12].trim(),
            currentBts: currentBts,
          });
        }
        fields.length = 0;
      }
    } else {
      current += '\n';
    }
  }

  return rows;
}

// Canonical BTS name mapping from BTS_NAME_MAPPING.md
const BTS_CANONICAL_MAP: Record<string, string> = {
  // Exact matches (already canonical)
  'Potoki': 'Potoki',
  'Sagamu GRA': 'Sagamu GRA',
  'NTA Osogbo': 'NTA Osogbo',
  'Osogbo-Core': 'Osogbo-Core',
  'OTA [Syayis]': 'OTA [Syayis]',
  'OSRC AKURE': 'OSRC AKURE',
  'AKARIGBO PALACE': 'Akarigbo Palace',
  'AIT [Alagbado]': 'AIT [Alagbado]',
  'OGBC Ibara Local': 'OGBC Ibara Local',
  'Positive FM': 'Positive FM',
  'Rockcity IB A': 'Rockcity IB A',
  'Rockcity Local ABK': 'Rockcity Local ABK',
  'NTA ABK': 'NTA ABK',
  'IVD': 'IVD',
  'Ijebu-Ode GRA': 'Ijebu-Ode GRA',
  'Paramount': 'Paramount',
  'Obada Oko': 'Obada Oko',
  'Obada Oko Extension': 'Obada Oko Extension',
  'Alagbaka Extension': 'Alagbaka Extension',
  'Akure Office': 'Akure Office',
  'CUAB[Google for Education]': 'CUAB[Google for Education]',
  'DOMINION': 'DOMINION',
  'NTA IJEBU-ODE': 'NTA IJEBU-ODE',
  'Pentagon': 'Pentagon',
  'Splash': 'Splash',
  'Oleyo BTS': 'Oleyo BTS',
  'Abeokuta Core': 'Abeokuta Core',
  'Oshoba Hill': 'Oshoba Hill',
  'Honor': 'Honor',
  'Magboro': 'Magboro',
  'NTA Ibadan': 'NTA Ibadan',
  'Sijuwola House Ibadan': 'Sijuwola House Ibadan',
  'JERICHO BTS': 'JERICHO BTS',
  'CFMC': 'CFMC',
  'ILAMO IJEBU': 'ILAMO IJEBU',
  'Ewang': 'Ewang',
  'Laderin': 'Laderin',
  'OSBC Oshogbo': 'OSBC Oshogbo',
  'Elega': 'Elega',
  'Impact': 'Impact',
  'Space FM': 'Space FM',
  'Oloke': 'Oloke',
  'OTA [Office Core]': 'OTA [Office Core]',
  'OTA ESTATE BTS': 'OTA ESTATE BTS',
  'Rave Oshogbo': 'Rave Oshogbo',
  
  // Needs normalization (case/typo/abbreviation)
  'POTOKI': 'Potoki',
  'Rave Oahogbo': 'Rave Oshogbo',
  'OSOGBO RAVE': 'Rave Oshogbo',
  'ALAGBAKA EXT': 'Alagbaka Extension',
  'AIT Alagbado': 'AIT [Alagbado]',
  'Akarigbe Palace': 'Akarigbo Palace',
  'AIT alagbado': 'AIT [Alagbado]',
  'Potoki-Sagamu': 'Potoki-Sagamu',
  'OGBC': 'OGBC Ibara Local',
  'NTA iJEBU-ODE': 'NTA IJEBU-ODE',
  'CUAB[Google for Educaion]': 'CUAB[Google for Education]',
  'Psotive FM': 'Positive FM',
  
  // Ambiguous - OTA without suffix
  'OTA': 'OTA [Syayis]', // Default to Syayis, will need manual review for others
};

function isValidBts(bts: string): boolean {
  if (!bts || bts.trim() === '') return false;
  const lower = bts.toLowerCase().trim();
  const invalidExact = ['#n/a', 'no history', 'on history', 'not online', 'not on', 'inactive', 'blocked', 'bts unknown', 'pending installation', 'bts unknown [inactive]', 'bts unknown [blocked]', 'bts unknown [active]', 'no service plan created for customer'];
  const invalidPrefix = ['inactive ||', 'blocked ||', 'not online', 'not on', 'bts unknown'];
  
  const isExactInvalid = invalidExact.some(inv => lower === inv || lower.startsWith(inv + ' ||'));
  const isPrefixInvalid = invalidPrefix.some(inv => lower.startsWith(inv));
  
  const isValid = !isExactInvalid && !isPrefixInvalid;
  if (!isValid) console.log(`  INVALID: "${bts}" -> lower="${lower}", exactInvalid=${isExactInvalid}, prefixInvalid=${isPrefixInvalid}`);
  else console.log(`  VALID: "${bts}"`);
  return isValid;
}

function cleanBtsName(bts: string): string {
  return bts
    .replace(/\s*\|\|.*$/, '')  // Remove "|| BTS Unknown" etc.
    .replace(/\(.*?\)/g, '')    // Remove parenthetical
    .replace(/\[.*?\]/g, '')    // Remove brackets
    .trim();
}

function getCanonicalBtsName(bts: string): string {
  const cleaned = cleanBtsName(bts);
  // Check exact match first
  if (BTS_CANONICAL_MAP[cleaned]) {
    return BTS_CANONICAL_MAP[cleaned];
  }
  // Check case-insensitive match
  const lower = cleaned.toLowerCase();
  for (const [key, value] of Object.entries(BTS_CANONICAL_MAP)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return cleaned;
}

async function main() {
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL || 'mariadb://csat_admin:Maestro004@localhost:3306/csat');
  const prisma = new PrismaClient({ adapter });

  // Read the CSV file
  const csvPath = path.join(__dirname, 'bts-review-pending.csv');
  const csv = fs.readFileSync(csvPath, 'utf-8');
  
  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} rows`);

  let validCount = 0;
  let invalidCount = 0;
  let updatedCount = 0;
  let notFoundCount = 0;
  let noUispMatchCount = 0;

  for (const row of rows) {
    const cleanBts = cleanBtsName(row.currentBts);
    const isValid = isValidBts(cleanBts);
    
    if (!isValid) {
      invalidCount++;
      continue;
    }
    
    validCount++;
    
    // Get canonical BTS name from mapping
    const canonicalBts = getCanonicalBtsName(row.currentBts);
    console.log(`  Mapping: "${row.currentBts}" -> "${canonicalBts}"`);
    
    // Find customer by customerId
    const customer = await prisma.customer.findUnique({
      where: { customerId: row.customerId },
      select: { id: true, customerId: true, customerName: true, btsName: true, btsId: true }
    });
    
    if (!customer) {
      console.log(`Customer ${row.customerId} not found in DB`);
      notFoundCount++;
      continue;
    }
    
    // Find UISP site matching the canonical BTS name (case-insensitive)
    const uispSite = await prisma.uispSite.findFirst({
      where: {
        name: { contains: canonicalBts },
        type: 'site'
      },
      select: { id: true, name: true, btsName: true, region: true }
    });
    
    // If not found, try case-insensitive manual search
    let finalUispSite = uispSite;
    if (!finalUispSite) {
      const allSites = await prisma.uispSite.findMany({
        where: { type: 'site' },
        select: { id: true, name: true, btsName: true, region: true }
      });
      finalUispSite = allSites.find(s => 
        s.name.toLowerCase().includes(canonicalBts.toLowerCase())
      ) || null;
    }
    
    let btsId: string | null = null;
    let btsName: string = canonicalBts;
    
    if (finalUispSite) {
      btsId = finalUispSite.id;
      btsName = finalUispSite.btsName || finalUispSite.name;
    } else {
      // Fallback: try to find by btsName in Customer table (case-insensitive)
      const allCustomers = await prisma.customer.findMany({
        where: { btsId: { not: null } },
        select: { btsId: true, btsName: true },
        distinct: ['btsName']
      });
      const existingBts = allCustomers.find(c => 
        c.btsName && c.btsName.toLowerCase().includes(canonicalBts.toLowerCase())
      );
      if (existingBts) {
        btsId = existingBts.btsId;
        btsName = existingBts.btsName || canonicalBts;
      } else {
        noUispMatchCount++;
        console.log(`  No UISP match for: ${canonicalBts} (customer: ${row.customerId})`);
      }
    }
    
    // Update customer
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        btsName: btsName,
        btsId: btsId,
        matchState: 'manual',
        matchMethod: 'manual',
        matchScore: 1.0,
        matchedAt: BigInt(Date.now()),
        matchUpdatedAt: BigInt(Date.now()),
      }
    });
    
    updatedCount++;
    if (updatedCount % 50 === 0) {
      console.log(`Updated ${updatedCount} customers...`);
    }
  }
  
  console.log(`\nSummary:`);
  console.log(`Total rows: ${rows.length}`);
  console.log(`Valid BTS: ${validCount}`);
  console.log(`Invalid/Skipped: ${invalidCount}`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Not found in DB: ${notFoundCount}`);
  console.log(`No UISP match: ${noUispMatchCount}`);
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });