import 'dotenv/config';
import { prisma } from './lib/prisma';
import { buildAuthHeader } from './lib/splynx-api';

async function main() {
  console.log('--- Querying DB & Splynx ---');
  
  // 1. Check customers in MariaDB
  const totalDbCustomers = await prisma.customer.count();
  const statusCounts = await prisma.customer.groupBy({
    by: ['status'],
    _count: { id: true },
    _sum: { mrrTotal: true }
  });
  console.log('DB Customer Statuses:', JSON.stringify(statusCounts, null, 2));

  const lifecycleCounts = await prisma.customer.groupBy({
    by: ['lifecycle'],
    _count: { id: true },
    _sum: { mrrTotal: true }
  });
  console.log('DB Lifecycle Statuses:', JSON.stringify(lifecycleCounts, null, 2));

  // 2. Check Feedbacks in MariaDB
  const totalFeedbacks = await prisma.feedback.count();
  const feedbackStatuses = await prisma.feedback.groupBy({
    by: ['status'],
    _count: { id: true }
  });
  const feedbackCategories = await prisma.feedback.groupBy({
    by: ['category'],
    _count: { id: true }
  });
  console.log('Feedbacks total:', totalFeedbacks);
  console.log('Feedback statuses:', JSON.stringify(feedbackStatuses, null, 2));
  console.log('Feedback categories:', JSON.stringify(feedbackCategories, null, 2));

  // 3. Test Splynx API endpoints
  const host = process.env.SPLYNX_API_HOST?.replace(/\/+$/, '');
  const authHeader = await buildAuthHeader();

  // Test customers list directly from Splynx
  try {
    const custRes = await fetch(`${host}/api/2.0/admin/customers/customer`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    });
    console.log('Splynx /admin/customers/customer HTTP status:', custRes.status);
    if (custRes.ok) {
      const customers = await custRes.json();
      console.log('Splynx returned customers count:', Array.isArray(customers) ? customers.length : (customers.data ? customers.data.length : 'not array'));
      if (Array.isArray(customers)) {
        const statuses: Record<string, number> = {};
        let totalMrr = 0;
        for (const c of customers) {
          statuses[c.status] = (statuses[c.status] || 0) + 1;
          if (c.mrr_total) totalMrr += parseFloat(c.mrr_total) || 0;
        }
        console.log('Splynx direct customer status counts:', statuses);
        console.log('Splynx direct total MRR:', totalMrr);
      }
    }
  } catch (e: any) {
    console.error('Splynx customer fetch error:', e.message);
  }

  // Test Splynx tickets / helpdesk if any
  const testEndpoints = [
    '/admin/helpdesk/tickets',
    '/admin/tickets/ticket',
    '/admin/helpdesk/ticket'
  ];
  for (const ep of testEndpoints) {
    try {
      const tRes = await fetch(`${host}/api/2.0${ep}`, {
        headers: { Authorization: authHeader, Accept: 'application/json' }
      });
      console.log(`Endpoint ${ep} status:`, tRes.status);
      if (tRes.ok) {
        const data = await tRes.json();
        console.log(`Endpoint ${ep} data:`, Array.isArray(data) ? data.length : (data.data ? data.data.length : typeof data));
      }
    } catch (e: any) {
      console.log(`Endpoint ${ep} failed:`, e.message);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
