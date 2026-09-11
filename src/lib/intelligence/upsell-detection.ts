/**
 * Upsell Detection Service
 *
 * Identifies customers who are candidates for plan upgrades:
 * - Bandwidth upgrade: customers hitting high usage
 * - Loyalty offer: customers for >6 months with no upgrade
 * - Enterprise: customers using enterprise features
 * - Bundle: customers with multiple devices
 *
 * Each opportunity gets a score (0-100) based on revenue upside, fit, and receptivity.
 */

import { prisma } from '@/lib/prisma';

interface UpsellCandidate {
  customerId: string;
  customerName: string | null;
  type: string;
  currentPlan: string | null;
  suggestedPlan: string;
  revenuePotential: number;
  score: number;
  assignedTo: string | null;
}

function planUpgradeRevenue(currentPlan: string | null): number {
  if (!currentPlan) return 2000;
  const lower = currentPlan.toLowerCase();
  if (lower.includes('enterprise') || lower.includes('business')) return 0; // already top tier
  if (lower.includes('sme') || lower.includes('corporate')) return 3000;
  if (lower.includes('premium') || lower.includes('unlimited')) return 2000;
  return 2500; // default upgrade uplift
}

function suggestUpgradePlan(currentPlan: string | null): string {
  if (!currentPlan) return 'Premium Plan';
  const lower = currentPlan.toLowerCase();
  if (lower.includes('basic') || lower.includes('starter')) return 'Standard Plan';
  if (lower.includes('standard') || lower.includes('regular')) return 'Premium Plan';
  if (lower.includes('premium') || lower.includes('unlimited')) return 'Business Plan';
  if (lower.includes('sme') || lower.includes('corporate')) return 'Enterprise Plan';
  return 'Premium Plan';
}

/**
 * Detect upsell opportunities for all active customers.
 * Called weekly by the scheduler.
 */
export async function detectUpsellOpportunities(): Promise<{
  detected: number;
  bandwidth: number;
  loyalty: number;
  enterprise: number;
  bundle: number;
}> {
  const now = new Date();
  const sixMonthsAgo = now.getTime() - 180 * 24 * 60 * 60 * 1000;

  // Fetch active customers with their device data
  const customers = await prisma.customer.findMany({
    where: {
      deleted: false,
      OR: [
        { lifecycle: 'active' },
        { lifecycle: null },
      ],
    },
    select: {
      id: true,
      customerName: true,
      servicePlan: true,
      accountType: true,
      firstSyncedAt: true,
      uispDeviceStatus: true,
      uispOutageCount: true,
      city: true,
      btsId: true,
    },
  });

  const candidates: UpsellCandidate[] = [];
  const counts = { bandwidth: 0, loyalty: 0, enterprise: 0, bundle: 0 };

  // Fetch device counts per site for bundle detection (UispDevice has siteId, not customerId)
  const deviceCounts = await prisma.$queryRaw<Array<{ siteId: string; count: bigint }>>`
    SELECT "siteId", COUNT(*) as count
    FROM "UispDevice"
    WHERE "siteId" IS NOT NULL
    GROUP BY "siteId"
  `;
  const deviceCountMap = new Map(deviceCounts.map((d) => [d.siteId, Number(d.count)]));

  for (const customer of customers) {
    const deviceCount = deviceCountMap.get((customer as unknown as { btsId: string | null }).btsId ?? '') ?? 0;

    // ─── Bandwidth upgrade: customers with outages suggesting capacity issues ───
    if (customer.uispOutageCount != null && customer.uispOutageCount > 3) {
      const revenue = planUpgradeRevenue(customer.servicePlan);
      if (revenue > 0) {
        candidates.push({
          customerId: customer.id,
          customerName: customer.customerName,
          type: 'bandwidth',
          currentPlan: customer.servicePlan,
          suggestedPlan: suggestUpgradePlan(customer.servicePlan),
          revenuePotential: revenue,
          score: Math.min(70 + customer.uispOutageCount * 5, 95),
          assignedTo: null,
        });
        counts.bandwidth++;
      }
    }

    // ─── Loyalty: customer for >6 months, no upgrade ───
    const syncedAt = customer.firstSyncedAt ? Number(customer.firstSyncedAt) : null;
    if (syncedAt && syncedAt < sixMonthsAgo) {
      const monthsActive = Math.floor(
        (now.getTime() - syncedAt) / (30 * 24 * 60 * 60 * 1000)
      );
      if (monthsActive > 6) {
        const revenue = planUpgradeRevenue(customer.servicePlan) * 0.5; // loyalty discount
        if (revenue > 0) {
          candidates.push({
            customerId: customer.id,
            customerName: customer.customerName,
            type: 'loyalty',
            currentPlan: customer.servicePlan,
            suggestedPlan: suggestUpgradePlan(customer.servicePlan) ?? 'Premium Plan',
            revenuePotential: revenue,
            score: Math.min(50 + monthsActive * 2, 85),
            assignedTo: null,
          });
          counts.loyalty++;
        }
      }
    }

    // ─── Enterprise: non-residential accounts ───
    const acctType = (customer.accountType ?? '').toLowerCase();
    if (
      acctType.includes('sme') ||
      acctType.includes('enterprise') ||
      acctType.includes('corporate') ||
      acctType.includes('business')
    ) {
      const lowerPlan = (customer.servicePlan ?? '').toLowerCase();
      if (!lowerPlan.includes('enterprise') && !lowerPlan.includes('business')) {
        candidates.push({
          customerId: customer.id,
          customerName: customer.customerName,
          type: 'enterprise',
          currentPlan: customer.servicePlan,
          suggestedPlan: 'Enterprise Plan',
          revenuePotential: 5000,
          score: 75,
          assignedTo: null,
        });
        counts.enterprise++;
      }
    }

    // ─── Bundle: multiple devices on account ───
    if (deviceCount >= 3) {
      const revenue = 2000; // bundle discount premium
      candidates.push({
        customerId: customer.id,
        customerName: customer.customerName,
        type: 'bundle',
        currentPlan: customer.servicePlan,
        suggestedPlan: 'Family/Business Bundle',
        revenuePotential: revenue,
        score: Math.min(60 + deviceCount * 5, 90),
        assignedTo: null,
      });
      counts.bundle++;
    }
  }

  // Deduplicate: keep highest-scored opportunity per customer
  const bestByCustomer = new Map<string, UpsellCandidate>();
  for (const c of candidates) {
    const existing = bestByCustomer.get(c.customerId);
    if (!existing || c.score > existing.score) {
      bestByCustomer.set(c.customerId, c);
    }
  }

  const deduplicated = Array.from(bestByCustomer.values());

  // Batch upsert (delete old 'new' status, insert fresh)
  await prisma.upsellOpportunity.deleteMany({ where: { status: 'new' } });

  for (const opp of deduplicated) {
    await prisma.upsellOpportunity.create({
      data: {
        customerId: opp.customerId,
        customerName: opp.customerName,
        type: opp.type,
        currentPlan: opp.currentPlan,
        suggestedPlan: opp.suggestedPlan,
        revenuePotential: opp.revenuePotential,
        score: opp.score,
        status: 'new',
        assignedTo: opp.assignedTo,
      },
    });
  }

  return {
    detected: deduplicated.length,
    ...counts,
  };
}
