/** Check our MariaDB joined data for a sample month */
import { config } from 'dotenv';
config({ path: ['.env', '.env.production'] });

async function main() {
  const { prisma } = await import('../src/lib/prisma');

  // Paid invoices for August 2026
  const invoices = await prisma.invoice.findMany({
    where: {
      isPaid: true,
      date: {
        gte: BigInt(new Date('2026-08-01').getTime()),
        lte: BigInt(new Date('2026-08-31').getTime()),
      },
    },
    take: 10,
    orderBy: { date: 'desc' },
  });

  console.log(`Paid invoices Aug 2026: ${invoices.length}`);
  for (const inv of invoices.slice(0, 5)) {
    const cust = await prisma.customer.findUnique({
      where: { customerId: inv.customerId },
      select: { customerName: true, email: true, category: true, servicePlan: true, city: true, accountType: true },
    });
    console.log(JSON.stringify({
      invoiceId: inv.invoiceId,
      number: inv.number,
      total: inv.total,
      paidAt: inv.paidAt ? new Date(Number(inv.paidAt)).toISOString().slice(0, 10) : null,
      customer: cust?.customerName,
      category: cust?.category,
      servicePlan: cust?.servicePlan,
      accountType: cust?.accountType,
      city: cust?.city,
    }));
  }

  // Check distinct service plans for classification mapping
  const plans = await prisma.customer.groupBy({
    by: ['servicePlan'],
    _count: { _all: true },
    where: { deleted: false, servicePlan: { not: null } },
  });
  console.log('\n=== Distinct service plans ===');
  for (const p of plans.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${p.servicePlan}: ${p._count._all}`);
  }

  // Check distinct categories
  const cats = await prisma.customer.groupBy({
    by: ['category', 'accountType'],
    _count: { _all: true },
    where: { deleted: false },
  });
  console.log('\n=== Category × AccountType ===');
  for (const c of cats.sort((a, b) => b._count._all - a._count._all).slice(0, 15)) {
    console.log(`  ${c.category ?? '—'} × ${c.accountType ?? '—'}: ${c._count._all}`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
