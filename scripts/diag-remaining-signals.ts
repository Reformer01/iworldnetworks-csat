/**
 * Deep-dive on remaining unmatched: what signals exist that we're not using?
 */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

function tokens(s: string): string[] {
  return s.toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  const pending = await prisma.customer.findMany({
    where: { deleted: false, matchState: 'pending' },
    select: { id: true, customerId: true, customerName: true, city: true, street: true, phone: true, email: true, status: true },
  });

  // UISP sites with notes
  const sites = await prisma.uispSite.findMany({
    where: { type: 'endpoint' },
    select: { id: true, name: true, btsName: true, note: true, address: true, contactPhone: true, contactEmail: true },
  });

  let hasNoteMatch = 0;
  let hasPhoneInNote = 0;
  let samples: string[] = [];

  for (const c of pending) {
    const nameTokens = new Set(tokens(c.customerName ?? ''));
    if (!nameTokens.size) continue;

    for (const s of sites) {
      if (!s.note) continue;
      const noteUpper = s.note.toUpperCase();
      // Customer name tokens appearing in the site's note
      let hits = 0;
      for (const t of nameTokens) {
        if (noteUpper.includes(t)) hits++;
      }
      if (hits >= 2 && nameTokens.size >= 2) {
        hasNoteMatch++;
        if (samples.length < 8) samples.push(`${c.customerName} => note on "${s.name}" (${s.btsName}): ${s.note?.slice(0, 80)}`);
        break;
      }
      // Phone in note
      if (c.phone && c.phone.replace(/\D/g, '').length >= 9 && noteUpper.includes(c.phone.replace(/\D/g, '').slice(-9))) {
        hasPhoneInNote++;
        break;
      }
    }
  }

  console.log(`pending: ${pending.length}`);
  console.log(`note-name matches (>=2 tokens): ${hasNoteMatch}`);
  console.log(`phone-in-note matches: ${hasPhoneInNote}`);
  console.log('samples:');
  samples.forEach((s) => console.log(`  ${s}`));

  // How many pending have NO street/city at all?
  const noAddr = pending.filter((c) => !c.street && !c.city).length;
  console.log(`\npending with no address data: ${noAddr}`);

  // Email matches against UISP contacts
  const withEmail = pending.filter((c) => c.email && c.email.includes('@'));
  let emailHits = 0;
  for (const c of withEmail) {
    const e = c.email!.toLowerCase().trim();
    if (sites.some((s) => s.contactEmail?.toLowerCase().trim() === e)) emailHits++;
  }
  console.log(`email exact matches against UISP contacts: ${emailHits}/${withEmail.length} (of ${pending.length} pending)`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
