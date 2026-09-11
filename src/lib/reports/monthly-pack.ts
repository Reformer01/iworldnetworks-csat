import { prisma } from '@/lib/prisma';

// ─── 03_Customer_Experience workbook engine ─────────────────────────────
// One generic range computation feeds the month, previous-month and YTD
// columns, so every figure in the workbook is derived from the same
// underlying reads. Ticket/Customer timestamps are BigInt epoch-ms;
// Feedback.createdAt is a DateTime.

export type KpiStatus = 'on-track' | 'at-risk' | 'no-target';

export interface ComplaintBreakdownRow {
  type: string;
  count: number;
  pct: number;
  customersAffected: number;
  mrrAtRisk: number;
  rootCause?: string;
  action?: string;
  owner?: string;
}

export interface MonthMetrics {
  opening: number | null;
  newCustomers: number;
  churned: number | null;
  closing: number | null;
  grossChurnPct: number | null;
  netGrowth: number | null;
  mrrAtRisk: number;
  mrrRetained: number;
  customersSaved: number;
  totalComplaints: number;
  complaintsResolved: number;
  resolutionRatePct: number | null;
  firstResponseMins: number | null;
  avgResolutionHrs: number | null;
  slaCompliancePct: number | null;
  repeatComplaints: number;
  escalatedComplaints: number;
  unresolvedOver24h: number;
  csatPct: number | null;
  csatResponses: number;
  nps: number | null;
  breakdown: ComplaintBreakdownRow[];
}

export interface KpiRow {
  kpi: string;
  target: string;
  actual: string;
  variance: string;
  prev: string;
  ytd: string;
  status: KpiStatus;
  comment: string;
  action: string;
  owner: string;
}

export interface KpiOverrides {
  target?: string;
  comment?: string;
  action?: string;
  owner?: string;
}

export interface SnapshotOverrides {
  rows?: Record<string, KpiOverrides>;
  breakdown?: Record<string, { rootCause?: string; action?: string; owner?: string }>;
}

// ─── Default targets (code-owned seeds; editable per month in the UI and
// persisted in MonthlySnapshot). ─────────────────────────────────────────
// Direction: 'up'  → higher actual is better; 'down' → lower is better.
export const KPI_DEFS: Array<{
  kpi: string;
  target: string;
  direction: 'up' | 'down' | 'none';
}> = [
  { kpi: 'Opening customer base', target: '', direction: 'none' },
  { kpi: 'New customers', target: '>= 50', direction: 'up' },
  { kpi: 'Churned customers', target: '<= 10', direction: 'down' },
  { kpi: 'Closing customer base', target: '', direction: 'none' },
  { kpi: 'Gross churn %', target: '<= 3%', direction: 'down' },
  { kpi: 'Net customer growth', target: '>= 40', direction: 'up' },
  { kpi: 'MRR at risk', target: '<= 200000', direction: 'down' },
  { kpi: 'MRR retained', target: '>= 500000', direction: 'up' },
  { kpi: 'Customers saved', target: '>= 5', direction: 'up' },
  { kpi: 'Total complaints', target: '', direction: 'none' },
  { kpi: 'Complaints resolved', target: '', direction: 'none' },
  { kpi: 'Resolution rate', target: '>= 90%', direction: 'up' },
  { kpi: 'First-response time (mins)', target: '<= 30', direction: 'down' },
  { kpi: 'Average resolution time (hrs)', target: '<= 48', direction: 'down' },
  { kpi: 'SLA compliance', target: '>= 95%', direction: 'up' },
  { kpi: 'Repeat complaints', target: '<= 5', direction: 'down' },
  { kpi: 'Escalated complaints', target: '<= 3', direction: 'down' },
  { kpi: 'Unresolved >24 hrs', target: '<= 0', direction: 'down' },
  { kpi: 'CSAT', target: '>= 85%', direction: 'up' },
  { kpi: 'NPS', target: '>= 50', direction: 'up' },
];

// Extract the numeric part of a target string like "<= 3%" / ">= 200000" / "0".
export function parseTargetValue(target: string): number | null {
  if (!target) return null;
  const m = target.replace(/[,₦\s]/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function fmtPct(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)}%`;
}

function fmtNullable(n: number | null, unit: '' | '%' | 'min' | 'hr'): string {
  if (n === null) return '—';
  if (unit === '%') return `${n.toFixed(1)}%`;
  if (unit === 'min' || unit === 'hr') return n.toFixed(1);
  return fmtNum(n);
}

// ─── Range computation ───────────────────────────────────────────────────

interface OverdueInfoShape {
  hasOverdueInvoice?: boolean;
  overdueDays?: number;
}

function isOverdue(overdueInfo: unknown): boolean {
  if (!overdueInfo || typeof overdueInfo !== 'object') return false;
  const info = overdueInfo as OverdueInfoShape;
  return info.hasOverdueInvoice === true || (typeof info.overdueDays === 'number' && info.overdueDays > 0);
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e || null;
}

/**
 * Compute every 03_Customer_Experience metric for [startMs, endMs).
 * `withBreakdown` skips the complaint-type grouping for YTD/prev reads.
 */
export async function computeRangeMetrics(startMs: number, endMs: number, withBreakdown = true): Promise<MonthMetrics> {
  const monthName = new Date(startMs).toLocaleString('en-US', { month: 'long' });
  const [customers, tickets, feedbacks, surveys, salesNew] = await Promise.all([
    prisma.customer.findMany({
      where: { deleted: false },
      select: {
        id: true,
        email: true,
        lifecycle: true,
        mrrTotal: true,
        firstSyncedAt: true,
        churnedAt: true,
        overdueInfo: true,
        online: true,
      },
    }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: BigInt(startMs), lt: BigInt(endMs) }, deletedAt: null },
      select: {
        customerEmail: true,
        complaintType: true,
        status: true,
        createdAt: true,
        assignedAt: true,
        firstResponseAt: true,
        resolvedAt: true,
        escalatedAt: true,
        slaBreached: true,
      },
    }),
    prisma.feedback.findMany({
      where: { createdAt: { gte: new Date(startMs), lt: new Date(endMs) } },
      select: { ratings: true, satisfied: true },
    }),
    prisma.churnSurvey.findMany({
      where: { submittedAt: { gte: BigInt(startMs), lt: BigInt(endMs) }, rating: { not: null } },
      select: { rating: true },
    }),
    // Sales truth for New customers — not synthetic firstSyncedAt spread
    (prisma as unknown as { salesRecordEntry: { count: (a: unknown) => Promise<number> } }).salesRecordEntry.count({
      where: { month: monthName, customerType: 'new', deletedAt: null },
    }).catch(() => 0),
  ]);

  // ── Customer base — opening is active base at start of month, not all ever-synced
  let opening = 0;
  let churned = 0;
  let customersSaved = 0;
  let mrrAtRisk = 0;
  let mrrChurnedWhileAtRisk = 0;
  for (const c of customers) {
    const synced = c.firstSyncedAt !== null ? Number(c.firstSyncedAt) : null;
    const churnAt = c.churnedAt !== null ? Number(c.churnedAt) : null;
    // Opening: existed before month AND not already churned before month
    if (synced !== null && synced < startMs && (churnAt === null || churnAt >= startMs)) opening += 1;
    if (c.lifecycle === 'churned' && churnAt !== null && churnAt >= startMs && churnAt < endMs) churned += 1;
    if (churnAt !== null && churnAt >= startMs && churnAt < endMs && c.lifecycle !== 'churned' && c.lifecycle !== 'lost') {
      customersSaved += 1;
    }
    // Overdue report excludes customers who still have access (online = Splynx last_online
    // within 30d) — they are still-paying customers with outstanding balances, not at-risk revenue.
    if (isOverdue(c.overdueInfo) && c.lifecycle !== 'churned' && c.lifecycle !== 'lost' && !c.online) {
      mrrAtRisk += c.mrrTotal ?? 0;
      if (churnAt !== null && churnAt >= startMs && churnAt < endMs) mrrChurnedWhileAtRisk += c.mrrTotal ?? 0;
    }
  }
  const newCustomers = typeof salesNew === 'number' ? salesNew : 0;
  // Honest for historical months before live tracking (2026-09): opening/churned not verifiable (synthetic backfill reverted)
  const isHistorical = startMs < Date.UTC(2026, 8, 1);
  const honestOpening = isHistorical ? null : opening;
  const honestChurned = isHistorical ? null : churned;
  const honestClosing = isHistorical || honestOpening === null || honestChurned === null ? null : honestOpening + newCustomers - honestChurned;
  const honestNetGrowth = honestOpening === null || honestChurned === null ? null : newCustomers - honestChurned;
  const honestGrossChurnPct = honestOpening === null || honestOpening === 0 || honestChurned === null ? null : Math.round((honestChurned / honestOpening) * 1000) / 10;
  const closing = honestClosing;
  const netGrowth = honestNetGrowth;
  const grossChurnPct = honestGrossChurnPct;
  const mrrRetained = Math.max(0, mrrAtRisk - mrrChurnedWhileAtRisk);

  // ── Tickets ──
  const nowMs = Date.now();
  const refMs = Math.min(nowMs, endMs); // past months freeze at month end
  const OPEN_STATUSES = new Set(['open', 'assigned', 'in_progress', 'reopened']);
  let complaintsResolved = 0;
  let escalated = 0;
  let unresolvedOver24h = 0;
  let firstResponseSumMs = 0;
  let firstResponseCount = 0;
  let resolutionSumMs = 0;
  let slaOk = 0;
  const emailCounts = new Map<string, number>();
  const breakdownMap = new Map<string, { count: number; emails: Set<string> }>();

  for (const t of tickets) {
    const createdAt = t.createdAt !== null ? Number(t.createdAt) : 0;
    const resolvedAt = t.resolvedAt !== null ? Number(t.resolvedAt) : null;
    const frAt = t.firstResponseAt !== null ? Number(t.firstResponseAt) : t.assignedAt !== null ? Number(t.assignedAt) : null;

    if (resolvedAt !== null) {
      complaintsResolved += 1;
      resolutionSumMs += Math.max(0, resolvedAt - createdAt);
      if (t.slaBreached !== true) slaOk += 1;
    }
    if (t.escalatedAt !== null) escalated += 1;
    if (frAt !== null && frAt >= createdAt) {
      firstResponseSumMs += frAt - createdAt;
      firstResponseCount += 1;
    }
    const status = t.status ?? 'open';
    if (OPEN_STATUSES.has(status) && refMs - createdAt > 24 * 3600 * 1000) unresolvedOver24h += 1;

    const email = normalizeEmail(t.customerEmail);
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);

    if (withBreakdown) {
      const type = t.complaintType?.trim() || 'Unclassified';
      const entry = breakdownMap.get(type) ?? { count: 0, emails: new Set<string>() };
      entry.count += 1;
      if (email) entry.emails.add(email);
      breakdownMap.set(type, entry);
    }
  }

  const totalComplaints = tickets.length;
  const repeatComplaints = Array.from(emailCounts.values()).filter((n) => n > 1).length;

  // ── Complaint breakdown: MRR at risk via email → Customer join ──
  const emailToMrr = new Map<string, number>();
  for (const c of customers) {
    const email = normalizeEmail(c.email);
    if (email) emailToMrr.set(email, (emailToMrr.get(email) ?? 0) + (c.mrrTotal ?? 0));
  }
  const breakdown: ComplaintBreakdownRow[] = withBreakdown
    ? Array.from(breakdownMap.entries())
        .map(([type, { count, emails }]) => ({
          type,
          count,
          pct: totalComplaints ? Math.round((count / totalComplaints) * 1000) / 10 : 0,
          customersAffected: emails.size,
          mrrAtRisk: Array.from(emails).reduce((s, e) => s + (emailToMrr.get(e) ?? 0), 0),
        }))
        .sort((a, b) => b.count - a.count)
    : [];

  // ── CSAT: % of feedback with overall rating >= 4 ──
  let csatGood = 0;
  for (const f of feedbacks) {
    const ratings = f.ratings as { overall?: number } | null;
    const overall = typeof ratings?.overall === 'number' ? ratings.overall : null;
    if (overall !== null ? overall >= 4 : (f.satisfied ?? '').toLowerCase() === 'yes') csatGood += 1;
  }
  const csatPct = feedbacks.length ? Math.round((csatGood / feedbacks.length) * 1000) / 10 : null;

  // ── NPS proxy from ChurnSurvey (5-pt scale): promoter=5, passive=4,
  // detractor=1-3. Documented conversion until a 0-10 NPS question ships. ──
  let promoters = 0;
  let detractors = 0;
  for (const s of surveys) {
    const r = s.rating ?? 0;
    if (r >= 5) promoters += 1;
    else if (r <= 3) detractors += 1;
  }
  const nps = surveys.length ? Math.round(((promoters - detractors) / surveys.length) * 100) : null;

  return {
    opening: honestOpening,
    newCustomers,
    churned: honestChurned,
    closing: honestClosing,
    grossChurnPct: honestGrossChurnPct,
    netGrowth: honestNetGrowth,
    mrrAtRisk,
    mrrRetained,
    customersSaved,
    totalComplaints,
    complaintsResolved,
    resolutionRatePct: totalComplaints ? Math.round((complaintsResolved / totalComplaints) * 1000) / 10 : null,
    firstResponseMins: firstResponseCount ? Math.round((firstResponseSumMs / firstResponseCount / 60000) * 10) / 10 : null,
    avgResolutionHrs: complaintsResolved ? Math.round((resolutionSumMs / complaintsResolved / 3600000) * 10) / 10 : null,
    slaCompliancePct: complaintsResolved ? Math.round((slaOk / complaintsResolved) * 1000) / 10 : null,
    repeatComplaints,
    escalatedComplaints: escalated,
    unresolvedOver24h,
    csatPct,
    csatResponses: feedbacks.length,
    nps,
    breakdown,
  };
}

// Map MonthMetrics → the workbook's "Actual" cell text, in KPI_DEFS order.
function actualFor(kpi: string, m: MonthMetrics): string {
  switch (kpi) {
    case 'Opening customer base': return m.opening === null ? '—' : fmtNum(m.opening);
    case 'New customers': return fmtNum(m.newCustomers);
    case 'Churned customers': return m.churned === null ? '—' : fmtNum(m.churned);
    case 'Closing customer base': return m.closing === null ? '—' : fmtNum(m.closing);
    case 'Gross churn %': return fmtPct(m.grossChurnPct);
    case 'Net customer growth': return m.netGrowth === null ? '—' : fmtNum(m.netGrowth);
    case 'MRR at risk': return fmtNum(m.mrrAtRisk);
    case 'MRR retained': return fmtNum(m.mrrRetained);
    case 'Customers saved': return fmtNum(m.customersSaved);
    case 'Total complaints': return fmtNum(m.totalComplaints);
    case 'Complaints resolved': return fmtNum(m.complaintsResolved);
    case 'Resolution rate': return fmtPct(m.resolutionRatePct);
    case 'First-response time (mins)': return fmtNullable(m.firstResponseMins, 'min');
    case 'Average resolution time (hrs)': return fmtNullable(m.avgResolutionHrs, 'hr');
    case 'SLA compliance': return fmtPct(m.slaCompliancePct);
    case 'Repeat complaints': return fmtNum(m.repeatComplaints);
    case 'Escalated complaints': return fmtNum(m.escalatedComplaints);
    case 'Unresolved >24 hrs': return fmtNum(m.unresolvedOver24h);
    case 'CSAT': return m.csatPct === null ? '—' : `${fmtPct(m.csatPct)} (${m.csatResponses} resp)`;
    case 'NPS': return m.nps === null ? '—' : String(m.nps);
    default: return '—';
  }
}

function varianceFor(actual: string, target: string): string {
  const actualNum = parseTargetValue(actual);
  const targetNum = parseTargetValue(target);
  if (actualNum === null || targetNum === null) return '—';
  const diff = Math.round((actualNum - targetNum) * 10) / 10;
  return `${diff > 0 ? '+' : ''}${diff}`;
}

function statusFor(direction: 'up' | 'down' | 'none', actual: string, target: string): KpiStatus {
  const actualNum = parseTargetValue(actual);
  const targetNum = parseTargetValue(target);
  if (direction === 'none' || actualNum === null || targetNum === null) return 'no-target';
  return direction === 'up' ? (actualNum >= targetNum ? 'on-track' : 'at-risk') : actualNum <= targetNum ? 'on-track' : 'at-risk';
}

/**
 * Build the full workbook row set for a month, given current/previous/YTD
 * metrics and admin overrides persisted in MonthlySnapshot.
 */
export function buildKpiRows(
  current: MonthMetrics,
  prev: MonthMetrics,
  ytd: MonthMetrics,
  overrides: SnapshotOverrides = {},
  frozenPrev?: Record<string, string>,
): KpiRow[] {
  return KPI_DEFS.map(({ kpi, target, direction }) => {
    const o = overrides.rows?.[kpi] ?? {};
    const targetStr = o.target !== undefined && o.target !== '' ? o.target : target;
    const actual = actualFor(kpi, current);
    return {
      kpi,
      target: targetStr || '—',
      actual,
      variance: varianceFor(actual, targetStr),
      prev: frozenPrev?.[kpi] ?? actualFor(kpi, prev),
      ytd: actualFor(kpi, ytd),
      status: statusFor(direction, actual, targetStr),
      comment: o.comment ?? '',
      action: o.action ?? '',
      owner: o.owner ?? '',
    };
  });
}

export function applyBreakdownOverrides(rows: ComplaintBreakdownRow[], overrides: SnapshotOverrides): ComplaintBreakdownRow[] {
  return rows.map((r) => {
    const o = overrides.breakdown?.[r.type];
    return o ? { ...r, rootCause: o.rootCause ?? '', action: o.action ?? '', owner: o.owner ?? '' } : r;
  });
}

// ─── CSV export (kept backward-compatible with the original headers) ────
export function buildCsv(rows: KpiRow[], breakdown: ComplaintBreakdownRow[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push('KPI,Target,Actual,Variance,Previous Month,YTD,Status,Comment / Root Cause,Action,Owner');
  for (const r of rows) {
    lines.push([r.kpi, r.target, r.actual, r.variance, r.prev, r.ytd, r.status, r.comment, r.action, r.owner].map(esc).join(','));
  }
  lines.push('');
  lines.push('Complaint Type,No.,% of Complaints,Customers Affected,MRR/Revenue at Risk,Root Cause,Corrective Action,Owner');
  for (const b of breakdown) {
    lines.push([b.type, String(b.count), `${b.pct}%`, String(b.customersAffected), fmtNum(b.mrrAtRisk), b.rootCause ?? '', b.action ?? '', b.owner ?? ''].map(esc).join(','));
  }
  return lines.join('\n');
}

/** Month boundaries (UTC) for "YYYY-MM". */
export function monthRange(month: string): { startMs: number; endMs: number } {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function previousMonth(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}
