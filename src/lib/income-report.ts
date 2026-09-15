// Pure helpers for the canonical 16-column Income Report.
// Dependency-free so both the API route and unit tests can import it
// without pulling in Prisma / Splynx / Firebase.

export type PlanKind = 'residential' | 'sme' | 'enterprise' | 'other';

export const INCOME_TAX_RATE = 0.075;

/** Exact CSV headers in canonical order. */
export const INCOME_CSV_HEADERS = [
  'Date',
  'Customer',
  'Email',
  'Reference',
  'Amount Paid',
  'Enterprise',
  'New',
  'Residential Internet',
  'SME Internet',
  'Discounts',
  'Others',
  'Tax',
  'Balance',
  'Region',
  'Remark',
  'Note',
] as const;

export interface IncomeRow {
  date: string;
  customer: string;
  email: string;
  reference: string;
  amount: number;
  enterprise: number;
  isNew: number;
  residential: number;
  sme: number;
  discounts: number;
  others: number;
  tax: number;
  balance: number;
  region: string;
  remark: string;
  note: string;
  isPrepay: boolean;
}

export interface IncomeFilters {
  region: string;
  segment: string;
  channel: string;
  search: string;
}

export const NO_FILTER: IncomeFilters = { region: '__all', segment: '__all', channel: '__all', search: '' };

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Existing plan classifier (moved verbatim from the income-report route). */
export function classifyPlan(plan: string, category: string): PlanKind {
  const p = (plan || '').trim().toLowerCase();
  const c = (category || '').toLowerCase();
  // H-Lite / H-Max / H-Pro / H-Prime etc => residential (Home)
  if (/^h[-\s]?(lite|max|pro|prime|ultra)/i.test(p) || p === 'h-lite' || p === 'h-max') return 'residential';
  if (p.includes('home') || p.includes('residential')) return 'residential';
  // U-* plus Business SME
  if (/^u[-\s]?(lite|max|pro)/i.test(p) || p.includes('sme') || p.includes('business')) return 'sme';
  if (c === 'company' || c === 'business' || c === 'corporate') return 'enterprise';
  // custom-named tariffs -> enterprise
  if (p && p !== '—' && p !== '-') return 'enterprise';
  // fallback by category
  if (c === 'person' || c === 'individual' || c === 'residential') return 'residential';
  return 'other';
}

export function calcTax(amount: number): number {
  return round2(amount * INCOME_TAX_RATE);
}

export function calcBalance(amount: number): number {
  return round2(amount - calcTax(amount));
}

export function calcDiscounts(discountBase: number, pct: number): number {
  if (!Number.isFinite(discountBase) || !Number.isFinite(pct) || pct <= 0) return 0;
  return round2((discountBase * pct) / 100);
}

/** `15` -> `15%`, `7.5` -> `7.5%`, `0`/NaN -> `''`. */
export function formatDiscountRemark(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return '';
  return `${String(parseFloat(pct.toFixed(2)))}%`;
}

function firstNonEmpty(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

/** First non-empty of state/province/customer_state/region, trimmed, truncated to 191.
 * Subdivision map wins first: `subdivision_id` (numeric or numeric-string) → state name.
 * Text keys are last-resort fallbacks only (customer records carry no state text).
 */
export function pickState(payload: Record<string, unknown>, subMap?: Map<number, string> | null): string {
  if (subMap) {
    const rawSub = payload['subdivision_id'] ?? payload['subdivisionId'] ?? payload['subdivision'];
    let subId: number | null = null;
    if (typeof rawSub === 'number' && Number.isFinite(rawSub) && rawSub > 0) subId = Math.trunc(rawSub);
    else if (typeof rawSub === 'string' && rawSub.trim() !== '') {
      const n = Number(rawSub.trim());
      if (Number.isFinite(n) && n > 0) subId = Math.trunc(n);
    }
    if (subId != null) {
      const name = subMap.get(subId);
      if (name) return name.slice(0, 191);
    }
  }
  return firstNonEmpty(payload, ['state', 'province', 'customer_state', 'region']).slice(0, 191);
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(/%$/, ''));
    return v.trim() && Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * First finite number of discount/discount_percent/discountPercent/customer_discount,
 * clamped 0–100. Null when no usable value (caller falls back to prev, default 0).
 */
export function pickDiscountPercent(payload: Record<string, unknown>): number | null {
  for (const key of ['discount', 'discount_percent', 'discountPercent', 'customer_discount']) {
    const n = toFiniteNumber(payload[key]);
    if (n !== null) return Math.min(100, Math.max(0, n));
  }
  return null;
}

/**
 * Parse date_added/registration_date/created/created_at via the injected Splynx
 * date parser into epoch ms. Null when missing/unparseable.
 */
export function pickDateAddedMs(
  payload: Record<string, unknown>,
  parseDate: (v: string | undefined | null) => number | null,
): number | null {
  const raw = firstNonEmpty(payload, ['date_added', 'registration_date', 'created', 'created_at']);
  if (!raw) return null;
  const ms = parseDate(raw);
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
}

export interface BuildIncomeRowInput {
  ms: number;
  amount: number;
  plan: string;
  category: string;
  customerName: string;
  email: string;
  reference: string;
  note: string;
  /** Splynx customer State/Province ONLY — never city. */
  state: string | null | undefined;
  discountPercent: number | null | undefined;
  splynxDateAdded: number | null | undefined;
  /** Inclusive query window (epoch ms) for the New flag. */
  start: number;
  end: number;
  isPrepay: boolean;
}

export function buildIncomeRow(input: BuildIncomeRowInput): IncomeRow {
  const kind = classifyPlan(input.plan, input.category);
  let residential = 0;
  let sme = 0;
  let enterprise = 0;
  let others = 0;
  let discountBase = input.amount;
  if (kind === 'residential') {
    residential = input.amount;
    discountBase = residential;
  } else if (kind === 'sme') {
    sme = input.amount;
    discountBase = sme;
  } else if (kind === 'enterprise') {
    enterprise = input.amount;
    discountBase = enterprise;
  } else {
    others = input.amount;
    discountBase = input.amount;
  }
  const pct = Number.isFinite(Number(input.discountPercent)) ? Math.min(100, Math.max(0, Number(input.discountPercent))) : 0;
  const added = Number(input.splynxDateAdded);
  return {
    date: new Date(input.ms).toISOString().slice(0, 10),
    customer: input.customerName,
    email: input.email,
    reference: input.reference,
    amount: input.amount,
    enterprise,
    isNew: Number.isFinite(added) && added >= input.start && added <= input.end ? 1 : 0,
    residential,
    sme,
    discounts: calcDiscounts(discountBase, pct),
    others,
    tax: calcTax(input.amount),
    balance: calcBalance(input.amount),
    region: input.state ?? '',
    remark: formatDiscountRemark(pct),
    note: input.note,
    isPrepay: input.isPrepay,
  };
}

/** Derive the segment of a built row from its buckets (exactly one is non-zero). */
export function kindOfRow(r: Pick<IncomeRow, 'enterprise' | 'residential' | 'sme'>): PlanKind {
  if (r.enterprise) return 'enterprise';
  if (r.residential) return 'residential';
  if (r.sme) return 'sme';
  return 'other';
}

/** Case-insensitive substring on reference + payment-type text (`__all`/empty = match). */
export function matchesChannel(reference: string, paymentType: string | number | undefined, channel: string): boolean {
  if (!channel || channel === '__all') return true;
  return `${reference ?? ''} ${paymentType ?? ''}`.toLowerCase().includes(channel.toLowerCase());
}

/** Case-insensitive substring on customer/email/reference (empty = match). */
export function matchesSearch(r: Pick<IncomeRow, 'customer' | 'email' | 'reference'>, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  return `${r.customer} ${r.email} ${r.reference}`.toLowerCase().includes(q);
}

export function applyRowFilters(rows: IncomeRow[], f: IncomeFilters): IncomeRow[] {
  return rows.filter((r) => {
    if (f.region && f.region !== '__all' && r.region !== f.region) return false;
    if (f.segment && f.segment !== '__all' && kindOfRow(r) !== f.segment) return false;
    if (!matchesSearch(r, f.search)) return false;
    return true;
  });
}

export interface IncomeSummary {
  transactions: number;
  totalGross: number;
  vat: number;
  netBalance: number;
  newSubscribers: number;
  prepayments: number;
  residential: number;
  sme: number;
  enterprise: number;
  discounts: number;
  others: number;
}

export function summarize(rows: IncomeRow[]): IncomeSummary {
  const sum = (pick: (r: IncomeRow) => number) => round2(rows.reduce((s, r) => s + pick(r), 0));
  const gross = sum((r) => r.amount);
  return {
    transactions: rows.length,
    totalGross: gross,
    vat: calcTax(gross),
    netBalance: round2(gross - calcTax(gross)),
    newSubscribers: rows.reduce((s, r) => s + r.isNew, 0),
    prepayments: rows.filter((r) => r.isPrepay).length,
    residential: sum((r) => r.residential),
    sme: sum((r) => r.sme),
    enterprise: sum((r) => r.enterprise),
    discounts: sum((r) => r.discounts),
    others: sum((r) => r.others),
  };
}

export function monthBoundsUTC(month: string): { start: number; end: number } {
  const [y, m] = month.split('-').map(Number);
  return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 1) - 1 };
}

/** Inclusive [from, to] window for YYYY-MM-DD bounds. Null when either is malformed. */
export function dayRangeBoundsUTC(from: string, to: string): { start: number; end: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td) + 86_400_000 - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end };
}

function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

/** Exact 16-column CSV in canonical order. Numbers raw (no ₦). */
export function buildIncomeCsv(rows: IncomeRow[]): string {
  const lines = rows.map((r) =>
    [
      r.date,
      r.customer,
      r.email,
      r.reference,
      r.amount,
      r.enterprise,
      r.isNew,
      r.residential,
      r.sme,
      r.discounts,
      r.others,
      r.tax,
      r.balance,
      r.region,
      r.remark,
      r.note,
    ]
      .map(csvCell)
      .join(','),
  );
  return [[...INCOME_CSV_HEADERS].join(','), ...lines].join('\n');
}

/** Discount = linked invoice total − amount paid (0 when no invoice or no discount). */
export function deriveDiscountAmount(paidAmount: number, invoiceTotal: number | null | undefined): number {
  if (invoiceTotal == null || !Number.isFinite(invoiceTotal) || !Number.isFinite(paidAmount)) return 0;
  if (invoiceTotal <= paidAmount) return 0;
  return round2(invoiceTotal - paidAmount);
}

/** Remark = trimmed pct of discount over invoice total (`15%`, `12.9%`, '' when none). */
export function deriveDiscountRemark(discounts: number, invoiceTotal: number | null | undefined): string {
  if (!discounts || !invoiceTotal || !Number.isFinite(discounts) || !Number.isFinite(invoiceTotal) || invoiceTotal <= 0) return '';
  return formatDiscountRemark((discounts / invoiceTotal) * 100);
}

export interface BuildMirrorIncomeRowInput {
  ms: number;
  paidAmount: number;
  invoiceTotal: number | null | undefined;
  plan: string;
  category: string;
  customerName: string;
  email: string;
  reference: string;
  note: string;
  state: string | null | undefined;
  splynxDateAdded: number | null | undefined;
  start: number;
  end: number;
  isPrepay: boolean;
}

/**
 * Mirror row: buckets hold the FULL plan value (paid + discounts) for a
 * classified kind, else Others = paid with 0 discount. Amount/Tax/Balance
 * stay on the paid amount; Remark derives from invoiceTotal.
 */
export function buildMirrorIncomeRow(input: BuildMirrorIncomeRowInput): IncomeRow {
  const kind = classifyPlan(input.plan, input.category);
  const paid = Number.isFinite(input.paidAmount) ? input.paidAmount : 0;
  let discounts = kind === 'other' ? 0 : deriveDiscountAmount(paid, input.invoiceTotal);
  discounts = round2(discounts);
  const full = round2(paid + discounts);
  let residential = 0;
  let sme = 0;
  let enterprise = 0;
  let others = 0;
  if (kind === 'residential') residential = full;
  else if (kind === 'sme') sme = full;
  else if (kind === 'enterprise') enterprise = full;
  else others = paid;
  const added = Number(input.splynxDateAdded);
  return {
    date: new Date(input.ms).toISOString().slice(0, 10),
    customer: input.customerName,
    email: input.email,
    reference: input.reference,
    amount: paid,
    enterprise,
    isNew: Number.isFinite(added) && added >= input.start && added <= input.end ? 1 : 0,
    residential,
    sme,
    discounts,
    others,
    tax: calcTax(paid),
    balance: calcBalance(paid),
    region: input.state ?? '',
    remark: deriveDiscountRemark(discounts, input.invoiceTotal),
    note: input.note,
    isPrepay: input.isPrepay,
  };
}
