export interface PaystackAggregateTransaction {
  reference: string;
  amount?: number | null;
  status?: string | null;
  channel?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  gatewayResponse?: string | null;
  paidAt?: Date | string | null;
  refundedNaira?: number | null;
  disputeStatus?: string | null;
  raw?: unknown;
}

export interface PaystackAggregateLink {
  paystackReference: string;
  status: string;
}

export interface PaystackTransactionFilters {
  month?: string | null;
  status?: string | null;
  channel?: string | null;
  region?: string | null;
  segment?: string | null;
  query?: string | null;
}

export const PAYSTACK_AGGREGATE_CAP = 20000;
const MAX_RECENT = 10;

export function isValidPaystackMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export function clampPerPage(perPage: number): number {
  if (!Number.isFinite(perPage)) return 20;
  return Math.min(200, Math.max(1, Math.floor(perPage)));
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Africa/Lagos has no DST (UTC+1 year-round). Paystack/Splynx timestamps are
// WAT wall-clock; bucketing in UTC silently moves late-night transactions
// into the previous UTC day (and month at boundaries).
const WAT_OFFSET_MS = 60 * 60 * 1000;

function monthKeyOf(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  const w = new Date(d.getTime() + WAT_OFFSET_MS);
  return `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dateKeyOf(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  return new Date(d.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function extractRegion(row: PaystackAggregateTransaction, regionByEmail?: Map<string, string>): string | null {
  const raw = row.raw as Record<string, unknown> | null | undefined;
  const meta = raw?.metadata as Record<string, unknown> | undefined;
  // Explicit per-transaction metadata wins; the customer record is the fallback.
  const candidates = [meta?.region, meta?.state, raw?.region, (raw as Record<string, unknown> | undefined)?.productSegment];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  if (row.customerEmail) {
    const mapped = regionByEmail?.get(row.customerEmail.trim().toLowerCase());
    if (mapped) return mapped;
  }
  return null;
}

export function extractSegment(row: PaystackAggregateTransaction): string | null {
  const raw = row.raw as Record<string, unknown> | null | undefined;
  const meta = raw?.metadata as Record<string, unknown> | undefined;
  const candidates = [meta?.segment, meta?.productSegment, raw?.segment, raw?.productSegment];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

export function filterPaystackTransactions(
  rows: PaystackAggregateTransaction[],
  filters: PaystackTransactionFilters,
  regionByEmail?: Map<string, string>,
): PaystackAggregateTransaction[] {
  const status = (filters.status || '').trim().toLowerCase();
  const channel = (filters.channel || '').trim().toLowerCase();
  const region = (filters.region || '').trim().toLowerCase();
  const segment = (filters.segment || '').trim().toLowerCase();
  const query = (filters.query || '').trim().toLowerCase();
  const month = (filters.month || '').trim();

  return rows.filter((row) => {
    if (month && monthKeyOf(row.paidAt) !== month) return false;
    if (status && (row.status || '').toLowerCase() !== status) return false;
    if (channel && (row.channel || '').toLowerCase() !== channel) return false;
    if (region) {
      const r = extractRegion(row, regionByEmail);
      if (!r || r.toLowerCase() !== region) return false;
    }
    if (segment) {
      const s = extractSegment(row);
      if (!s || s.toLowerCase() !== segment) return false;
    }
    if (query) {
      const hay = [row.reference, row.customerEmail, row.customerName, row.gatewayResponse].filter(Boolean).join(' ').toLowerCase();
      const amountHay = String((row.amount || 0) / 100);
      if (!hay.includes(query) && !amountHay.includes(query)) return false;
    }
    return true;
  });
}

export interface PaystackOverviewPayload {
  month: string;
  attemptedCount: number;
  kpis: {
    collectedNaira: number;
    successCount: number;
    successRate: number;
    unmatchedNaira: number;
    refundedNaira: number;
    disputeCount: number;
  };
  series: { date: string; collectedNaira: number; count: number }[];
  channels: { channel: string; collectedNaira: number; count: number }[];
  regions: { region: string; collectedNaira: number; count: number }[];
  recent: {
    reference: string;
    customer: string;
    amountNaira: number;
    channel: string | null;
    status: string;
    paidAt: string | null;
  }[];
}

export function buildPaystackOverview(
  transactions: PaystackAggregateTransaction[],
  links: PaystackAggregateLink[],
  month: string,
  regionByEmail?: Map<string, string>,
): PaystackOverviewPayload {
  // Filter to the requested month BEFORE capping so the cap can never drop
  // rows out of the displayed month when the table grows large.
  const monthRows = transactions.filter((row) => monthKeyOf(row.paidAt) === month).slice(0, PAYSTACK_AGGREGATE_CAP);
  const attemptedCount = monthRows.length;
  const successRows = monthRows.filter((row) => (row.status || '').toLowerCase() === 'success');

  const collectedNaira = round2(successRows.reduce((sum, row) => sum + (row.amount || 0) / 100, 0));
  const successCount = successRows.length;
  const successRate = monthRows.length > 0 ? Math.round((successCount / monthRows.length) * 1000) / 10 : 0;

  const matchedRefs = new Set(links.filter((l) => (l.status || '').toLowerCase() === 'matched').map((l) => l.paystackReference));
  const unmatchedNaira = round2(
    successRows.filter((row) => !matchedRefs.has(row.reference)).reduce((sum, row) => sum + (row.amount || 0) / 100, 0),
  );
  const refundedNaira = round2(monthRows.reduce((sum, row) => sum + (row.refundedNaira || 0), 0));
  const disputeCount = monthRows.filter((row) => typeof row.disputeStatus === 'string' && row.disputeStatus.trim() !== '').length;

  const seriesMap = new Map<string, { collectedNaira: number; count: number }>();
  for (const row of successRows) {
    const key = dateKeyOf(row.paidAt);
    if (!key) continue;
    const entry = seriesMap.get(key) ?? { collectedNaira: 0, count: 0 };
    entry.collectedNaira = round2(entry.collectedNaira + (row.amount || 0) / 100);
    entry.count += 1;
    seriesMap.set(key, entry);
  }
  const series = [...seriesMap.entries()]
    .map(([date, v]) => ({ date, collectedNaira: v.collectedNaira, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const channelMap = new Map<string, { collectedNaira: number; count: number }>();
  for (const row of successRows) {
    const key = (row.channel || 'unknown').trim().toLowerCase() || 'unknown';
    const entry = channelMap.get(key) ?? { collectedNaira: 0, count: 0 };
    entry.collectedNaira = round2(entry.collectedNaira + (row.amount || 0) / 100);
    entry.count += 1;
    channelMap.set(key, entry);
  }
  const channels = [...channelMap.entries()]
    .map(([channel, v]) => ({ channel, collectedNaira: v.collectedNaira, count: v.count }))
    .sort((a, b) => b.collectedNaira - a.collectedNaira);

  const regionMap = new Map<string, { collectedNaira: number; count: number }>();
  for (const row of successRows) {
    const key = extractRegion(row, regionByEmail) ?? 'Unknown';
    const entry = regionMap.get(key) ?? { collectedNaira: 0, count: 0 };
    entry.collectedNaira = round2(entry.collectedNaira + (row.amount || 0) / 100);
    entry.count += 1;
    regionMap.set(key, entry);
  }
  const regions = [...regionMap.entries()]
    .map(([region, v]) => ({ region, collectedNaira: v.collectedNaira, count: v.count }))
    .sort((a, b) => b.collectedNaira - a.collectedNaira);

  const recent = [...successRows]
    .sort((a, b) => {
      const da = toDate(a.paidAt)?.getTime() ?? 0;
      const db = toDate(b.paidAt)?.getTime() ?? 0;
      return db - da;
    })
    .slice(0, MAX_RECENT)
    .map((row) => ({
      reference: row.reference,
      customer: row.customerName || row.customerEmail || '',
      amountNaira: round2((row.amount || 0) / 100),
      channel: row.channel ?? null,
      status: row.status ?? 'unknown',
      paidAt: toDate(row.paidAt)?.toISOString() ?? null,
    }));

  return {
    month,
    attemptedCount,
    kpis: { collectedNaira, successCount, successRate, unmatchedNaira, refundedNaira, disputeCount },
    series,
    channels,
    regions,
    recent,
  };
}
