export const CATEGORY_MAP: Record<string, string> = {
  invoice: 'Billing',
  payment: 'Billing',
  ticket: 'Support',
  customer: 'Installation',
  field_support: 'FieldSupport',
  cpe: 'FieldSupport',
  repair: 'FieldSupport',
};

export const FEEDBACK_CATEGORIES = ['Reliability', 'Support', 'FieldSupport', 'Testimonials', 'Installation', 'Billing'] as const;

export function isValidCategory(value: string | null | undefined): value is (typeof FEEDBACK_CATEGORIES)[number] {
  if (!value) return false;
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}

export const CATEGORY_LABELS: Record<string, string> = {
  Reliability: 'Internet Quality',
  Support: 'Customer Support',
  FieldSupport: 'Field Support',
  Testimonials: 'Share Your Story',
  Installation: 'Customer Onboarding',
  Billing: 'Payments & Billing',
};

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category;
}

export function mapSplynxEventToCategory(sourceEvent: string | null | undefined): string {
  const lower = (sourceEvent || '').toLowerCase();
  for (const [key, category] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return category;
  }
  return 'Reliability';
}

/**
 * Resolves the effective feedback subject/category with priority:
 *   1. Explicit subject passed by a share link (?subject=...) — wins over everything.
 *   2. Category stored on the token at creation time (admin-picked share links).
 *   3. Category derived from the Splynx source event (legacy tokens).
 * Always falls back to Reliability.
 */
export function resolveCategory(opts: { subject?: string | null; tokenCategory?: string | null; sourceEvent?: string | null }): string {
  if (isValidCategory(opts.subject)) return opts.subject;
  if (isValidCategory(opts.tokenCategory)) return opts.tokenCategory;
  return mapSplynxEventToCategory(opts.sourceEvent || '');
}

