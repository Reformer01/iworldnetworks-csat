export const BTS_ACCOUNT_TYPES = [
  'ENTERPRISE',
  'RETAIL',
  'SME',
  'RESIDENTIAL',
  'PARTNERS_HOSTS',
  'NEIGHBOURHOOD',
  'BUNDLED',
  'OTHER',
] as const;

export type BtsAccountType = (typeof BTS_ACCOUNT_TYPES)[number];

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

export function isBundledServicePlan(servicePlan: unknown): boolean {
  const rawPlan = String(servicePlan ?? '').trim();
  return /^BUNDLE:/i.test(rawPlan) || rawPlan.split(/\s+\+\s+/).filter(Boolean).length > 1;
}

/**
 * Splynx commonly sends `regular` for every customer. The plan code is the
 * reliable fallback for the commercial segment used by the BTS dashboards.
 */
export function deriveBtsAccountType(accountType: unknown, servicePlan: unknown): BtsAccountType {
  const explicit = normalize(accountType).replace(/[\s-]+/g, '_');
  const plan = normalize(servicePlan).replace(/\s+/g, '');
  const compactPlan = plan.replace(/[^A-Z0-9]/g, '');

  // A bundled account is a commercial billing shape, so it takes precedence
  // over a generic account type returned by Splynx (for example, residential).
  if (isBundledServicePlan(servicePlan)) return 'BUNDLED';

  if (explicit && explicit !== 'REGULAR' && explicit !== 'OTHER') {
    if (explicit.includes('ENTERPRISE') || explicit.includes('BUSINESS') || explicit.includes('CORPORATE')) return 'ENTERPRISE';
    if (explicit.includes('PARTNER') || explicit.includes('HOST')) return 'PARTNERS_HOSTS';
    if (explicit.includes('NEIGHBOUR') || explicit.includes('NEIGHBOR')) return 'NEIGHBOURHOOD';
    if (explicit.includes('RESIDENTIAL') || explicit === 'HOME') return 'RESIDENTIAL';
    if (explicit.includes('RETAIL')) return 'RETAIL';
    if (explicit === 'SME' || explicit.includes('SMALL_MEDIUM')) return 'SME';
  }

  if (compactPlan.includes('PARTNER') || compactPlan.includes('HOST')) return 'PARTNERS_HOSTS';
  if (compactPlan.includes('HOME') || compactPlan.includes('RESIDENTIAL') || /H(?:LITE|PRO|MAX)/.test(compactPlan)) return 'RESIDENTIAL';
  if (compactPlan.includes('SMALLBUSINESS') || compactPlan.includes('SME') || /U(?:LITE|PRO|MAX)/.test(compactPlan)) return 'SME';
  if (compactPlan.includes('NEIGHBOURHOOD') || compactPlan.includes('NEIGHBORHOOD') || /N(?:10K|15K|225K)/.test(compactPlan))
    return 'NEIGHBOURHOOD';
  if (/^\d+(?:\.\d+)?MBPS/i.test(plan) || plan.includes('ENTERPRISE')) return 'ENTERPRISE';

  // Splynx also has custom tariffs whose title is a customer/site name
  // (for example, "Baynans Hotel") — these are enterprise-class customers
  // with bespoke pricing, so classify them as ENTERPRISE.
  if (plan) return 'ENTERPRISE';
  return explicit === 'RETAIL' ? 'RETAIL' : 'OTHER';
}

export function isPotentialMrcLifecycle(lifecycle: unknown) {
  const value = normalize(lifecycle).toLowerCase();
  return value === 'active' || value === 'inactive';
}
