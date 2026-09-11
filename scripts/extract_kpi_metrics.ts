import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { buildAuthHeader } from '../src/lib/splynx-api';

async function run() {
  console.log('=== EXTRACTING SPLYNX & PLATFORM KPI DATA ===\n');

  // 1. Check Splynx API from server
  const host = process.env.SPLYNX_API_HOST?.replace(/\/+$/, '');
  let splynxCustomers: any[] = [];
  let splynxTickets: any[] = [];
  
  if (host) {
    try {
      const authHeader = await buildAuthHeader();
      const res = await fetch(`${host}/api/2.0/admin/customers/customer`, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (res.ok) {
        const d = await res.json();
        splynxCustomers = Array.isArray(d) ? d : (d.data || []);
        console.log(`[Splynx API] Fetched ${splynxCustomers.length} customers directly from Splynx.`);
      } else {
        console.log(`[Splynx API] /admin/customers/customer returned ${res.status}`);
      }
    } catch (e: any) {
      console.log(`[Splynx API] Direct fetch error: ${e.message}`);
    }

    // Try tickets
    for (const ep of ['/admin/helpdesk/tickets', '/admin/tickets/ticket', '/admin/helpdesk/ticket']) {
      try {
        const authHeader = await buildAuthHeader();
        const res = await fetch(`${host}/api/2.0${ep}`, {
          headers: { Authorization: authHeader, Accept: 'application/json' },
        });
        if (res.ok) {
          const d = await res.json();
          const list = Array.isArray(d) ? d : (d.data || []);
          if (list.length > 0) {
            splynxTickets = list;
            console.log(`[Splynx API] Fetched ${list.length} tickets from ${ep}`);
            break;
          }
        }
      } catch (e) {}
    }
  }

  // 2. Query MariaDB Customer Table
  const totalCustomers = await prisma.customer.count();
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      customerId: true,
      customerName: true,
      email: true,
      phone: true,
      login: true,
      city: true,
      street: true,
      status: true,
      lifecycle: true,
      online: true,
      mrrTotal: true,
      accountType: true,
      category: true,
      servicePlan: true,
      btsName: true,
      churnedAt: true,
      inactiveSince: true,
      createdAt: true,
      lastSyncAt: true,
      deleted: true,
    }
  });

  console.log(`[Database] Loaded ${customers.length} unified customer records.`);

  // Status breakdown
  const statusMap: Record<string, { count: number; mrr: number }> = {};
  const lifecycleMap: Record<string, { count: number; mrr: number }> = {};
  const categoryMap: Record<string, { count: number; mrr: number }> = {};

  let activeCount = 0;
  let activeMrr = 0;
  let blockedCount = 0;
  let blockedMrr = 0;
  let inactiveCount = 0;
  let inactiveMrr = 0;
  let newCount = 0;
  let newMrr = 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0 = Jan, 8 = Sep

  let newThisMonth = 0;
  let newYTD = 0;
  let churnedThisMonth = 0;
  let churnedYTD = 0;

  const atRiskList: any[] = [];

  for (const c of customers) {
    const st = (c.status || 'unknown').toLowerCase();
    const lc = (c.lifecycle || 'unknown').toLowerCase();
    const mrr = c.mrrTotal || 0;

    statusMap[st] = statusMap[st] || { count: 0, mrr: 0 };
    statusMap[st].count++;
    statusMap[st].mrr += mrr;

    lifecycleMap[lc] = lifecycleMap[lc] || { count: 0, mrr: 0 };
    lifecycleMap[lc].count++;
    lifecycleMap[lc].mrr += mrr;

    const cat = c.category || c.accountType || 'Standard';
    categoryMap[cat] = categoryMap[cat] || { count: 0, mrr: 0 };
    categoryMap[cat].count++;
    categoryMap[cat].mrr += mrr;

    if (st === 'active') {
      activeCount++;
      activeMrr += mrr;
    } else if (st === 'blocked') {
      blockedCount++;
      blockedMrr += mrr;
    } else if (st === 'inactive' || st === 'disabled') {
      inactiveCount++;
      inactiveMrr += mrr;
    } else if (st === 'new') {
      newCount++;
      newMrr += mrr;
    }

    // High risk customers
    if (st === 'blocked' || lc === 'churn_risk' || lc === 'inactive' || (c.churnedAt && !c.deleted)) {
      let riskReason = 'Payment Suspension / Blocked';
      let riskLevel = 'Medium';
      if (st === 'blocked') {
        riskReason = 'Account Blocked (Overdue / Payment Failure)';
        riskLevel = mrr >= 50000 ? 'High' : (mrr >= 25000 ? 'Medium' : 'Low');
      } else if (lc === 'churn_risk') {
        riskReason = 'High churn probability / Prolonged offline';
        riskLevel = 'High';
      } else if (c.churnedAt) {
        riskReason = 'Marked Churned';
        riskLevel = 'Critical';
      }

      atRiskList.push({
        id: c.customerId,
        name: c.customerName || c.login || `Customer #${c.customerId}`,
        mrr: mrr,
        status: c.status,
        lifecycle: c.lifecycle,
        riskLevel,
        reason: riskReason,
        city: c.city || 'N/A',
        bts: c.btsName || 'N/A',
        category: c.category || c.accountType || 'Retail',
        plan: c.servicePlan || 'N/A'
      });
    }

    // Created / Churned timeline
    if (c.createdAt) {
      const cd = new Date(c.createdAt);
      if (cd.getFullYear() === currentYear) {
        newYTD++;
        if (cd.getMonth() === currentMonth) {
          newThisMonth++;
        }
      }
    }

    if (c.churnedAt) {
      const cd = new Date(Number(c.churnedAt));
      if (cd.getFullYear() === currentYear) {
        churnedYTD++;
        if (cd.getMonth() === currentMonth) {
          churnedThisMonth++;
        }
      }
    }
  }

  atRiskList.sort((a, b) => b.mrr - a.mrr);

  // 3. Query Feedbacks & Complaints in DB
  const feedbacks = await prisma.feedback.findMany({
    orderBy: { timestamp: 'desc' }
  });

  console.log(`[Feedback / CSAT] Loaded ${feedbacks.length} customer feedback records.`);

  const complaintTypeMap: Record<string, { count: number; resolved: number; customers: Set<string>; sampleComment: string }> = {};
  let totalComplaints = feedbacks.length;
  let resolvedComplaints = 0;
  let satisfiedCount = 0;
  let unsatisfiedCount = 0;
  let csatRatingsTotal = 0;
  let csatRatingsCount = 0;
  let npsScores: number[] = [];

  for (const f of feedbacks) {
    const st = (f.status || 'new').toLowerCase();
    const isResolved = st === 'resolved' || st === 'closed';
    if (isResolved) resolvedComplaints++;

    const cat = f.category || 'General Service';
    if (!complaintTypeMap[cat]) {
      complaintTypeMap[cat] = { count: 0, resolved: 0, customers: new Set(), sampleComment: f.comment || '' };
    }
    complaintTypeMap[cat].count++;
    if (isResolved) complaintTypeMap[cat].resolved++;
    if (f.customerEmail || f.customerName) {
      complaintTypeMap[cat].customers.add(f.customerEmail || f.customerName || '');
    }

    // CSAT / Satisfaction
    if (f.satisfied === 'yes' || f.satisfied === 'true') satisfiedCount++;
    if (f.satisfied === 'no' || f.satisfied === 'false') unsatisfiedCount++;

    if (f.ratings && typeof f.ratings === 'object') {
      const r = f.ratings as any;
      const val = Number(r.overall || r.satisfaction || r.rating || r.service || 0);
      if (val > 0) {
        csatRatingsTotal += val;
        csatRatingsCount++;
        if (val <= 10) npsScores.push(val);
      }
    }
  }

  // Calculate NPS if ratings are 1-10 or 1-5
  let promoters = 0;
  let detractors = 0;
  let passives = 0;
  for (const s of npsScores) {
    if (s >= 9) promoters++;
    else if (s <= 6) detractors++;
    else passives++;
  }
  const nps = npsScores.length > 0 ? Math.round(((promoters - detractors) / npsScores.length) * 100) : null;
  const csatPct = totalComplaints > 0 ? Math.round((satisfiedCount / (satisfiedCount + unsatisfiedCount || 1)) * 100) : 0;
  const resolutionRate = totalComplaints > 0 ? ((resolvedComplaints / totalComplaints) * 100).toFixed(1) : '100';

  // 4. Invoices / Revenue
  const unpaidInvoices = await prisma.invoice.findMany({
    where: { isPaid: false }
  });
  const totalUnpaidAmount = unpaidInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  const results = {
    customerBase: {
      totalCustomers,
      activeCount,
      activeMrr,
      blockedCount,
      blockedMrr,
      inactiveCount,
      inactiveMrr,
      newCount,
      newMrr,
      statusMap,
      lifecycleMap,
      categoryMap,
      newThisMonth,
      newYTD,
      churnedThisMonth,
      churnedYTD,
      grossChurnRate: activeCount > 0 ? ((blockedCount + inactiveCount) / (activeCount + blockedCount + inactiveCount) * 100).toFixed(1) + '%' : '0%',
      netCustomerGrowth: newYTD - churnedYTD,
      mrrAtRisk: blockedMrr,
      unpaidInvoicesCount: unpaidInvoices.length,
      totalUnpaidAmount,
    },
    complaintsAndCSAT: {
      totalComplaints,
      resolvedComplaints,
      openComplaints: totalComplaints - resolvedComplaints,
      resolutionRate: `${resolutionRate}%`,
      csatPct: `${csatPct}%`,
      avgRating: csatRatingsCount > 0 ? (csatRatingsTotal / csatRatingsCount).toFixed(1) : 'N/A',
      nps: nps !== null ? `${nps}` : 'N/A',
      complaintTypeBreakdown: Object.entries(complaintTypeMap).map(([type, d]) => ({
        type,
        count: d.count,
        pct: ((d.count / (totalComplaints || 1)) * 100).toFixed(1) + '%',
        customersAffected: d.customers.size,
        resolved: d.resolved,
        sampleComment: d.sampleComment.slice(0, 80)
      }))
    },
    topAtRiskCustomers: atRiskList.slice(0, 20)
  };

  const fs = require('fs');
  fs.writeFileSync('/home/csat.iwn.ng/kpi_results.json', JSON.stringify(results, null, 2));
  console.log('Successfully saved to /home/csat.iwn.ng/kpi_results.json');
}

run().catch(console.error).finally(() => prisma.$disconnect());
