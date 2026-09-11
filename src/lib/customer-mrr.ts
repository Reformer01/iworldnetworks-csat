import { getPlanMrc } from './sales-staff';

/**
 * Get the effective MRR for a customer.
 * Uses the stored mrrTotal if > 0, otherwise falls back to the plan price from servicePlan.
 * This ensures customers with a service plan but 0 mrrTotal still show their potential MRR.
 */
export function getEffectiveMrr(customer: {
  mrrTotal: number | null;
  servicePlan: string | null;
}): number {
  const storedMrr = Number(customer.mrrTotal ?? 0);
  if (Number.isFinite(storedMrr) && storedMrr > 0) {
    return storedMrr;
  }
  // Fallback to plan price if customer has a service plan
  if (customer.servicePlan) {
    const planMrr = getPlanMrc(customer.servicePlan);
    if (planMrr !== null && planMrr > 0) {
      return planMrr;
    }
  }
  return 0;
}

/**
 * Get the effective MRR for a customer, but only if they are active.
 * Returns 0 for inactive/blocked/churned customers.
 */
export function getActiveEffectiveMrr(customer: {
  mrrTotal: number | null;
  servicePlan: string | null;
  lifecycle: string | null;
}): number {
  const isActive = customer.lifecycle === 'active' || customer.lifecycle === 'Active';
  if (!isActive) return 0;
  return getEffectiveMrr(customer);
}
