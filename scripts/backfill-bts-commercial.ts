/**
 * Enrich customers with their actual Splynx internet tariff and effective
 * monthly recurring charge. The customer list endpoint does not include a
 * tariff, so this reads each customer's internet services and joins tariff_id
 * to the internet-tariff catalog.
 *
 * Run a preview first, then apply once:
 *   npx tsx scripts/backfill-bts-commercial.ts
 *   npx tsx scripts/backfill-bts-commercial.ts --apply
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.production', override: true });

type Tariff = { id?: number; title?: string; name?: string; price?: number | string };
type Service = {
  id?: number;
  tariff_id?: number;
  description?: string;
  title?: string;
  unit_price?: number | string;
  status?: string;
  start_date?: string;
  bundle_id?: number;
  bundle_name?: string;
};

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function serviceKey(service: Service): string {
  return `${service.tariff_id ?? ''}|${service.description ?? service.title ?? ''}`;
}

function currentServices(services: Service[], tariffById: Map<number, Tariff>): Service[] {
  const current = services.filter((service) => ['active', 'pending'].includes(String(service.status ?? '').toLowerCase()));
  const source =
    current.length > 0
      ? current
      : services.filter((service) => {
          const tariff = tariffById.get(Number(service.tariff_id));
          return amount(service.unit_price) > 0 || amount(tariff?.price) > 0;
        });
  const unique = new Map<string, Service>();
  for (const service of source) unique.set(serviceKey(service), service);
  return [...unique.values()];
}

async function main() {
  // The production env uses mysql:// while Prisma's MariaDB adapter expects
  // mariadb://. Normalize the protocol only; credentials and host are intact.
  if (process.env.DATABASE_URL?.startsWith('mysql://')) {
    process.env.DATABASE_URL = `mariadb://${process.env.DATABASE_URL.slice('mysql://'.length)}`;
  }
  const { prisma } = await import('../src/lib/prisma');
  const { getCustomerById, getCustomerServices, getTariffs } = await import('../src/lib/splynx-api');
  const apply = process.argv.includes('--apply');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const parsedLimit = limitArg ? Number(limitArg.slice('--limit='.length)) : NaN;
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, parsedLimit) : undefined;
  const customerArg = process.argv.find((arg) => arg.startsWith('--customer='))?.slice('--customer='.length);
  const includeAll = process.argv.includes('--all');
  const bundleOnly = process.argv.includes('--bundles');
  const tariffs = (await getTariffs()) as Tariff[];
  const tariffById = new Map<number, Tariff>();
  for (const tariff of tariffs) {
    const id = Number(tariff.id);
    if (Number.isFinite(id)) tariffById.set(id, tariff);
  }

  const customers = (await prisma.customer.findMany({
    where: {
      deleted: false,
      ...(customerArg ? { customerId: customerArg } : {}),
      ...(bundleOnly ? { servicePlan: { contains: ' + ' } } : {}),
      ...(includeAll || bundleOnly ? {} : { OR: [{ servicePlan: null }, { servicePlan: '' }, { mrrTotal: 0 }] }),
    } as never,
    select: { id: true, customerId: true, customerName: true, servicePlan: true, mrrTotal: true },
    take: limit,
    orderBy: { customerId: 'asc' },
  })) as unknown as Array<{
    id: string;
    customerId: string;
    customerName: string | null;
    servicePlan: string | null;
    mrrTotal: number | null;
  }>;

  console.log(`BTS commercial backfill: ${apply ? 'APPLY' : 'DRY-RUN'}; customers=${customers.length}; tariffs=${tariffById.size}`);
  let enriched = 0;
  let updated = 0;
  let failed = 0;
  let nextIndex = 0;
  const concurrency = Math.min(32, Math.max(1, Number(process.env.SPLYNX_BACKFILL_CONCURRENCY || 24)));

  async function processCustomer(customer: (typeof customers)[number], index: number) {
    try {
      const services = currentServices((await getCustomerServices(customer.customerId)) as Service[], tariffById);
      if (services.length === 0) {
        if (customerArg) console.log(`${customer.customerId}: no internet service returned by Splynx`);
        return;
      }
      const planNames = services
        .map((service) => {
          const tariff = tariffById.get(Number(service.tariff_id));
          return String(tariff?.title ?? tariff?.name ?? service.description ?? service.title ?? '').trim();
        })
        .filter(Boolean)
        .filter((plan, index, all) => all.indexOf(plan) === index);
      const plan = planNames.join(' + ');
      const price = services.reduce((sum, service) => {
        const tariff = tariffById.get(Number(service.tariff_id));
        return sum + (amount(service.unit_price) || amount(tariff?.price));
      }, 0);
      const hasDirectServicePrice = services.some((service) => amount(service.unit_price) > 0);
      // For bundled accounts, the customer detail endpoint carries Splynx's
      // account-level MRR after bundle/relationship discounts. Service prices
      // are gross line amounts and would overstate the billed MRR.
      let accountMrr: number | null = null;
      if (services.length >= 2) {
        const detail = (await getCustomerById(Number(customer.customerId))) as unknown as { mrr_total?: number | string } | null;
        const parsedMrr =
          detail?.mrr_total === undefined || detail?.mrr_total === null || detail?.mrr_total === '' ? NaN : Number(detail.mrr_total);
        if (Number.isFinite(parsedMrr)) accountMrr = Math.max(0, parsedMrr);
      }
      if (customerArg) console.log(`${customer.customerId}: services=${JSON.stringify(services)} plan='${plan}' price=${price}`);
      if (!plan && price === 0) return;
      enriched += 1;
      const nextMrr =
        services.length >= 2
          ? accountMrr === null
            ? amount(customer.mrrTotal) > 0
              ? customer.mrrTotal
              : price
            : accountMrr > 0
              ? accountMrr
              : hasDirectServicePrice
                ? amount(customer.mrrTotal) > 0
                  ? customer.mrrTotal
                  : price
                : 0
          : amount(customer.mrrTotal) > 0
            ? customer.mrrTotal
            : price;
      const mrrToWrite = nextMrr ?? 0;
      if (index < 20 || index % 100 === 0) {
        console.log(
          `${customer.customerId} ${customer.customerName ?? ''} plan='${plan || '(unknown)'}' mrr ${customer.mrrTotal ?? 0} -> ${nextMrr ?? 0}`,
        );
      }
      const shouldWriteMrr = services.length >= 2 || amount(customer.mrrTotal) === 0;
      if (apply) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            servicePlan: plan || customer.servicePlan || '',
            ...(shouldWriteMrr ? { mrrTotal: mrrToWrite } : {}),
          } as never,
        });
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`failed ${customer.customerId}: ${String(error).slice(0, 160)}`);
    }
  }

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= customers.length) return;
      await processCustomer(customers[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, customers.length) }, () => worker()));

  console.log(`Done. enriched=${enriched} updated=${updated} failed=${failed}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
