export const CATEGORY_MAP: Record<string, string> = {
  invoice: 'Billing',
  ticket: 'Support',
  customer: 'Installation',
  field_support: 'FieldSupport',
  cpe: 'FieldSupport',
  repair: 'FieldSupport',
};

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

export function mapSplynxEventToCategory(sourceEvent: string): string {
  const lower = sourceEvent.toLowerCase();
  for (const [key, category] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return category;
  }
  return 'Reliability';
}

