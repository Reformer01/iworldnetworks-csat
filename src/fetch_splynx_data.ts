import 'dotenv/config';
import { buildAuthHeader } from './lib/splynx-api';

async function main() {
  const host = process.env.SPLYNX_API_HOST?.replace(/\/+$/, '');
  const authHeader = await buildAuthHeader();

  console.log(`Connecting to Splynx at ${host}...`);

  async function apiFetch(endpoint: string, params?: Record<string, string>) {
    const url = new URL(`${host}/api/2.0${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} on ${endpoint}: ${err}`);
    }
    return res.json();
  }

  // 1. Fetch all customers
  console.log('Fetching customers...');
  let customers: any[] = [];
  try {
    // /admin/customers/customer returns all customers or paginated
    const data = await apiFetch('/admin/customers/customer');
    customers = Array.isArray(data) ? data : (data.data || []);
    console.log(`Fetched ${customers.length} total customer records from Splynx.`);
  } catch (e: any) {
    console.error('Error fetching customers:', e.message);
  }

  // 2. Fetch Tickets / Helpdesk
  console.log('Fetching tickets/complaints...');
  let tickets: any[] = [];
  const ticketEndpoints = [
    '/admin/helpdesk/tickets',
    '/admin/tickets/ticket',
    '/admin/helpdesk/ticket'
  ];
  for (const ep of ticketEndpoints) {
    try {
      const data = await apiFetch(ep);
      const list = Array.isArray(data) ? data : (data.data || []);
      if (list.length > 0) {
        console.log(`Found ${list.length} tickets from ${ep}`);
        tickets = list;
        break;
      }
    } catch (e: any) {
      console.log(`Tried ${ep}: ${e.message.slice(0, 100)}`);
    }
  }

  // 3. Fetch Invoices / Overdue
  console.log('Fetching invoices...');
  let unpaidInvoices: any[] = [];
  try {
    const invData = await apiFetch('/admin/finance/invoices', {
      'main_attributes[status][0]': '=',
      'main_attributes[status][1]': 'not_paid'
    });
    unpaidInvoices = Array.isArray(invData) ? invData : (invData.data || []);
    console.log(`Found ${unpaidInvoices.length} unpaid invoices.`);
  } catch (e: any) {
    console.log('Error fetching invoices:', e.message);
  }

  // Analyze Customer Base
  // Check statuses: active, blocked, new, inactive, disabled, etc.
  const statusSummary: Record<string, { count: number; totalMrr: number }> = {};
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0-indexed
  
  // Date analysis: created_at / last_update
  let newCustomersThisMonth = 0;
  let newCustomersYTD = 0;
  let blockedCount = 0;
  let inactiveCount = 0;
  let activeCount = 0;
  let totalMrrActive = 0;
  let totalMrrBlocked = 0;
  let totalMrrInactive = 0;

  const atRiskCustomers: any[] = [];

  for (const c of customers) {
    const st = String(c.status || 'unknown').toLowerCase();
    const mrr = parseFloat(c.mrr_total || c.mrc || '0') || 0;
    
    if (!statusSummary[st]) {
      statusSummary[st] = { count: 0, totalMrr: 0 };
    }
    statusSummary[st].count++;
    statusSummary[st].totalMrr += mrr;

    if (st === 'active') {
      activeCount++;
      totalMrrActive += mrr;
    } else if (st === 'blocked') {
      blockedCount++;
      totalMrrBlocked += mrr;
      atRiskCustomers.push({
        id: c.id,
        name: c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.login,
        login: c.login,
        mrr,
        status: st,
        reason: 'Account Blocked / Payment Suspension',
        riskLevel: mrr >= 50000 ? 'High' : (mrr >= 20000 ? 'Medium' : 'Low'),
        city: c.city || c.street_1 || '',
        category: c.category || c.account_type || ''
      });
    } else if (st === 'inactive' || st === 'disabled') {
      inactiveCount++;
      totalMrrInactive += mrr;
    }

    // Check creation date if available
    const createdAtStr = c.created_at || c.date_add || c.date;
    if (createdAtStr) {
      const createdDate = new Date(createdAtStr);
      if (!isNaN(createdDate.getTime())) {
        if (createdDate.getFullYear() === currentYear) {
          newCustomersYTD++;
          if (createdDate.getMonth() === currentMonth) {
            newCustomersThisMonth++;
          }
        }
      }
    }
  }

  // Sort at-risk by MRR descending
  atRiskCustomers.sort((a, b) => b.mrr - a.mrr);

  console.log('\n=============================================');
  console.log('CUSTOMER BASE & MRR SUMMARY:');
  console.log('=============================================');
  console.log(JSON.stringify(statusSummary, null, 2));
  console.log(`\nActive Customers: ${activeCount} (Total MRR: ₦${totalMrrActive.toLocaleString()})`);
  console.log(`Blocked / Suspended (At Risk): ${blockedCount} (MRR at Risk: ₦${totalMrrBlocked.toLocaleString()})`);
  console.log(`Inactive / Churned: ${inactiveCount}`);
  console.log(`Total Base in System: ${customers.length}`);
  console.log(`New Customers (Current Month): ${newCustomersThisMonth}`);
  console.log(`New Customers (YTD): ${newCustomersYTD}`);

  // Analyze Tickets / Complaints
  console.log('\n=============================================');
  console.log('TICKETS / COMPLAINTS SUMMARY:');
  console.log('=============================================');
  if (tickets.length > 0) {
    const ticketStatuses: Record<string, number> = {};
    const ticketTypes: Record<string, { count: number; customers: Set<any>; mrr: number }> = {};
    let resolvedCount = 0;
    let openCount = 0;

    for (const t of tickets) {
      const st = String(t.status || t.status_name || 'unknown').toLowerCase();
      ticketStatuses[st] = (ticketStatuses[st] || 0) + 1;
      if (st.includes('closed') || st.includes('resolved') || st === '3') {
        resolvedCount++;
      } else {
        openCount++;
      }

      const typeKey = t.topic || t.group_name || t.type || t.category || 'General Issue';
      if (!ticketTypes[typeKey]) {
        ticketTypes[typeKey] = { count: 0, customers: new Set(), mrr: 0 };
      }
      ticketTypes[typeKey].count++;
      if (t.customer_id) {
        ticketTypes[typeKey].customers.add(t.customer_id);
      }
    }

    console.log('Total Tickets:', tickets.length);
    console.log('Ticket Statuses:', ticketStatuses);
    console.log(`Resolved: ${resolvedCount}, Open/Pending: ${openCount}`);
    console.log(`Resolution Rate: ${((resolvedCount / (tickets.length || 1)) * 100).toFixed(1)}%`);
    console.log('\nBreakdown by Type/Topic:');
    Object.entries(ticketTypes).forEach(([type, data]) => {
      console.log(`- ${type}: ${data.count} tickets (${data.customers.size} customers affected)`);
    });
  } else {
    console.log('No ticket records returned from standard endpoints. Checking sample customer fields...');
  }

  // Top 10 At-Risk Customers
  console.log('\n=============================================');
  console.log('TOP AT-RISK CUSTOMERS (by MRR):');
  console.log('=============================================');
  atRiskCustomers.slice(0, 15).forEach((c, idx) => {
    console.log(`${idx + 1}. ${c.name} (${c.login}) - MRR: ₦${c.mrr.toLocaleString()} | Risk: ${c.riskLevel} | Status: ${c.status} | City: ${c.city}`);
  });

  // Write full JSON output for parsing
  const fs = require('fs');
  fs.writeFileSync('splynx_summary.json', JSON.stringify({
    statusSummary,
    activeCount,
    blockedCount,
    inactiveCount,
    totalCount: customers.length,
    totalMrrActive,
    totalMrrBlocked,
    newCustomersThisMonth,
    newCustomersYTD,
    ticketsCount: tickets.length,
    atRiskCustomers: atRiskCustomers.slice(0, 20),
    sampleCustomer: customers[0]
  }, null, 2));
}

main().catch(console.error);
