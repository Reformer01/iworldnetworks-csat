import { prisma } from '../src/lib/prisma';

interface BtsReviewRow {
  customerId: string;
  customerName: string;
  email: string;
  phone: string;
  city: string;
  street: string;
  category: string;
  mrr: string;
  currentBts: string;
}

function parseCsv(csv: string): BtsReviewRow[] {
  const rows: BtsReviewRow[] = [];
  
  // Proper CSV parsing with support for quoted fields containing newlines
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
    
    // Check if we're at the end of a record (not in quotes and we have enough fields)
    if (!inQuotes) {
      fields.push(field);
      field = '';
      
      // Check if we have a complete record (13 fields: header + 12 data)
      if (fields.length >= 13) {
        const currentBts = fields.slice(12).join(',').trim();
        if (fields[0] !== 'Customer ID' && fields[12]) {
          rows.push({
            customerId: fields[0].trim(),
            customerName: fields[1].trim(),
            email: fields[2].trim(),
            phone: fields[3].trim(),
            city: fields[4].trim(),
            street: fields[5].trim(),
            category: fields[10].trim(),
            mrr: fields[11].trim(),
            currentBts: fields.slice(12).join(',').trim(),
          });
        }
        fields.length = 0;
      }
    } else {
      // Still in quotes, continue to next line
      current += '\n';
    }
  }
  
  return rows;
}

function isValidBts(bts: string): boolean {
  if (!bts || bts.trim() === '') return false;
  const lower = bts.toLowerCase().trim();
  // Invalid if the ENTIRE value is one of these (exact match or with ||)
  const invalidExact = ['#n/a', 'no history', 'on history', 'not online', 'not on', 'inactive', 'blocked'];
  // Invalid if the value STARTS with these (like "Inactive || BTS Unknown")
  const invalidPrefix = ['inactive ||', 'blocked ||', 'not online', 'not on'];
  
  const isExactInvalid = invalidExact.some(inv => lower === inv || lower.startsWith(inv + ' ||'));
  const isPrefixInvalid = invalidPrefix.some(inv => lower.startsWith(inv));
  
  const isValid = !isExactInvalid && !isPrefixInvalid;
  console.log(`  CHECK: "${bts}" -> lower="${lower}", exactInvalid=${isExactInvalid}, prefixInvalid=${isPrefixInvalid}, isValid=${isValid}`);
  return isValid;
}

function cleanBtsName(bts: string): string {
  return bts
    .replace(/\s*\|\|.*$/, '')  // Remove "|| BTS Unknown" etc.
    .replace(/\(.*?\)/g, '')    // Remove parenthetical
    .replace(/\[.*?\]/g, '')    // Remove brackets
    .trim();
}

async function main() {
  // Read the CSV file
  const fs = require('fs');
  const csvPath = '/home/csat.iwn.ng/scripts/bts-review-pending.csv';
  const csv = fs.readFileSync(csvPath, 'utf-8');
  
  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} rows`);
  
  let validCount = 0;
  let invalidCount = 0;
  let updatedCount = 0;
  let notFoundCount = 0;
  
  for (const row of rows) {
    const cleanBts = cleanBtsName(row.currentBts);
    const isValid = isValidBts(cleanBts);
    
    if (!isValid) {
      invalidCount++;
      continue;
    }
    
    validCount++;
    
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
    
// Find UISP site matching the BTS name (case-insensitive search)
    const uispSite = await prisma.uispSite.findFirst({
      where: {
        name: { contains: cleanBts },
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
        s.name.toLowerCase().includes(cleanBts.toLowerCase())
      ) || null;
    }
    
    let btsId: string | null = null;
    let btsName: string = cleanBts;
    
    if (uispSite) {
      btsId = uispSite.id;
      btsName = uispSite.btsName || uispSite.name;
    } else {
      // Fallback: try to find by btsName in Customer table (case-insensitive)
      const allCustomers = await prisma.customer.findMany({
        where: { btsId: { not: null } },
        select: { btsId: true, btsName: true },
        distinct: ['btsName']
      });
      const existingBts = allCustomers.find(c => 
        c.btsName && c.btsName.toLowerCase().includes(cleanBts.toLowerCase())
      );
      if (existingBts) {
        btsId = existingBts.btsId;
        btsName = existingBts.btsName || cleanBts;
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
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
