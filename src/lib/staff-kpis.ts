// Staff KPI computation — pure, testable logic.
//
// History: the feature "wasn't working at all" because of three compounding
// issues, all fixed here:
//   1. Period mismatch: the UI sends week|month|quarter but the old route only
//      understood weekly|monthly|quarterly, collapsing the window to "today".
//      `normalizePeriod` accepts both spellings.
//   2. Role filter excluded the seeded 'Support Agent' role (only
//      'Back-end Support'/'Front-end Support'/'Technical' were matched).
//   3. The history collection had no writer. This module is the single source
//      of truth used by the API AND the hourly sync scheduler, so records are
//      persisted automatically (`persistStaffKPIs`).

import type { Firestore } from 'firebase-admin/firestore';

import { staffRoster } from './staff';

export type KpiPeriod = 'weekly' | 'monthly' | 'quarterly';

export interface StaffMember {
  id: string;
  name: string;
  role: string;
}

export interface SupportStaffKPI {
  staffId: string;
  staffName: string;
  role: string;
  periodStart: number;
  periodEnd: number;

  ticketsAssigned: number;
  ticketsResolved: number;
  ticketsEscalated: number;
  ticketsReopened: number;
  ticketsClosed: number;

  avgResolutionTimeHours: number;
  avgFirstResponseTimeHours: number;
  avgTimeToAssignHours: number;

  slaComplianceRate: number;
  firstContactResolutionRate: number;
  customerSatisfactionScore: number;
  avgCustomerSatisfaction: number;
  qualityScore: number;

  slaBreaches: number;
  slaBreachRate: number;
  priority1Resolved: number;
  priority2Resolved: number;
  priority3Resolved: number;

  currentOpenTickets: number;
  avgDailyTickets: number;

  calculatedAt: number;
}

/** Roles that count as support staff (includes the seeded 'Support Agent'). */
export const SUPPORT_ROLES = ['Back-end Support', 'Front-end Support', 'Technical', 'Support Agent'];

/** Map UI/API period spellings onto the canonical set. Defaults to monthly. */
export function normalizePeriod(period: string | null | undefined): KpiPeriod {
  switch ((period || '').toLowerCase()) {
    case 'week':
    case 'weekly':
      return 'weekly';
    case 'quarter':
    case 'quarterly':
      return 'quarterly';
    case 'month':
    case 'monthly':
    default:
      return 'monthly';
  }
}

/**
 * Rolling window start for live views: 7 / 30 / 90 days back (start of day).
 * Matches the semantics the history route uses for the same spellings.
 */
export function rollingWindowStart(period: KpiPeriod, now = Date.now()): number {
  const days = period === 'weekly' ? 7 : period === 'monthly' ? 30 : 90;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  return start.getTime();
}

/** End of today (23:59:59.999). */
export function periodEnd(now = Date.now()): number {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/**
 * Calendar bucket start for PERSISTED records: Monday 00:00 for weekly,
 * 1st of month for monthly, quarter start for quarterly. Fixed boundaries so
 * hourly re-runs overwrite the same doc instead of creating new ones.
 */
export function periodBucketStart(period: KpiPeriod, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'weekly') {
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
  } else if (period === 'monthly') {
    d.setDate(1);
  } else {
    d.setDate(1);
    d.setMonth(Math.floor(d.getMonth() / 3) * 3);
  }
  return d.getTime();
}

/** Minimal ticket view consumed by the KPI engine (row, Firestore, or test fixture). */
export interface StaffTicketInput {
  id?: string;
  ticketNumber?: number;
  assignedTo?: string | null;
  status?: string | null;
  escalatedTo?: string | null;
  firstTimeFix?: boolean | null;
  priority?: number | null;
  slaBreached?: boolean | null;
  reopenedAt?: number | null;
  reopenedCount?: number | null;
  resolvedAt?: number | null;
  assignedAt?: number | null;
  createdAt?: number | null;
}

/** Minimal feedback view consumed by the KPI engine. */
export interface StaffFeedbackInput {
  id?: string;
  staffName?: string | null;
  ratings?: Record<string, number> | null;
  timestamp?: number | null;
}

/** True when the ticket's assignedTo references this staff (id, name, or email). */
export function ticketMatchesStaff(ticket: StaffTicketInput, staff: StaffMember): boolean {
  const assignedTo = ticket.assignedTo;
  if (!assignedTo) return false;
  const needle = assignedTo.toLowerCase();
  return (
    needle === staff.id.toLowerCase() ||
    needle === staff.name.toLowerCase() ||
    (staff.id.toLowerCase().includes('backend-') && needle.includes(staff.name.toLowerCase().split(' ')[0].toLowerCase()))
  );
}

/** True when the feedback's staffName references this staff (id, name, or email). */
export function feedbackMatchesStaff(feedback: StaffFeedbackInput, staff: StaffMember): boolean {
  const staffName = feedback.staffName;
  if (!staffName) return false;
  const needle = staffName.toLowerCase();
  return needle === staff.id.toLowerCase() || needle === staff.name.toLowerCase() || needle.includes(staff.name.toLowerCase());
}

function toNumber(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

function inPeriod(ts: number | null | undefined, periodStart: number, periodEndTs: number): boolean {
  return ts != null && ts >= periodStart && ts <= periodEndTs;
}

/**
 * Compute every KPI for one staff member from their tickets + feedbacks.
 * Pure — no I/O — so it is trivially unit-testable.
 *
 * Defensive: tickets/feedbacks outside [start, end] are ignored here too,
 * even though callers are expected to pre-filter.
 */
export function computeStaffKPIs(
  staff: StaffMember,
  tickets: StaffTicketInput[],
  feedbacks: StaffFeedbackInput[],
  start: number,
  end: number,
): SupportStaffKPI {
  const ticketsInPeriod = tickets.filter((t) => inPeriod(t.createdAt, start, end));
  const feedbacksInPeriod = feedbacks.filter((f) => inPeriod(f.timestamp, start, end));

  const ticketsAssigned = ticketsInPeriod.length;
  const ticketsResolved = ticketsInPeriod.filter((t) => t.status === 'resolved').length;
  const ticketsClosed = ticketsInPeriod.filter((t) => t.status === 'closed').length;
  const ticketsEscalated = ticketsInPeriod.filter((t) => Boolean(t.escalatedTo)).length;
  const ticketsReopened = ticketsInPeriod.filter((t) => toNumber(t.reopenedAt) > 0 || toNumber(t.reopenedCount) > 0).length;

  const resolvedTickets = ticketsInPeriod.filter((t) => toNumber(t.resolvedAt) > 0 && toNumber(t.createdAt) > 0);
  const firstResponseTickets = ticketsInPeriod.filter((t) => toNumber(t.assignedAt) > 0 && toNumber(t.createdAt) > 0);

  const avgResolutionTimeHours =
    resolvedTickets.length > 0
      ? resolvedTickets.reduce((sum, t) => sum + (toNumber(t.resolvedAt) - toNumber(t.createdAt)) / (1000 * 60 * 60), 0) /
        resolvedTickets.length
      : 0;

  const avgFirstResponseTimeHours =
    firstResponseTickets.length > 0
      ? firstResponseTickets.reduce((sum, t) => sum + (toNumber(t.assignedAt) - toNumber(t.createdAt)) / (1000 * 60 * 60), 0) /
        firstResponseTickets.length
      : 0;

  const assignedTickets = ticketsInPeriod.filter((t) => toNumber(t.assignedAt) > 0 && toNumber(t.createdAt) > 0);
  const avgTimeToAssignHours =
    assignedTickets.length > 0
      ? assignedTickets.reduce((sum, t) => sum + (toNumber(t.assignedAt) - toNumber(t.createdAt)) / (1000 * 60 * 60), 0) /
        assignedTickets.length
      : 0;

  const slaBreaches = ticketsInPeriod.filter((t) => t.slaBreached === true).length;
  const slaBreachRate = ticketsAssigned > 0 ? (slaBreaches / ticketsAssigned) * 100 : 0;
  const slaComplianceRate = 100 - slaBreachRate;

  // FCR: explicit firstTimeFix flag wins. Legacy tickets (no firstTimeFix
  // field) that were resolved and never reopened also count — but a ticket
  // explicitly marked firstTimeFix:false never counts as FCR.
  const fcrTickets = ticketsInPeriod.filter(
    (t) =>
      t.firstTimeFix === true ||
      (t.firstTimeFix === undefined && t.status === 'resolved' && toNumber(t.reopenedAt) === 0 && toNumber(t.reopenedCount) === 0),
  );
  const firstContactResolutionRate = ticketsResolved > 0 ? (fcrTickets.length / ticketsResolved) * 100 : 0;

  // CSAT: prefer the Support professionalism key; fall back to the generic
  // 'overall' score written by the tokenized survey.
  const satisfactionRatings: number[] = [];
  for (const f of feedbacksInPeriod) {
    const ratings: Record<string, number> = f.ratings ?? {};
    const prof = toNumber(ratings.professionalism);
    const overall = toNumber(ratings.overall);
    const value = prof > 0 ? prof : overall > 0 ? overall : 0;
    if (value > 0) satisfactionRatings.push(value);
  }
  const customerSatisfactionScore =
    satisfactionRatings.length > 0 ? satisfactionRatings.reduce((sum, r) => sum + r, 0) / satisfactionRatings.length : 0;

  const priority1Resolved = ticketsInPeriod.filter((t) => t.priority === 1 && t.status === 'resolved').length;
  const priority2Resolved = ticketsInPeriod.filter((t) => t.priority === 2 && t.status === 'resolved').length;
  const priority3Resolved = ticketsInPeriod.filter((t) => t.priority === 3 && t.status === 'resolved').length;

  const currentOpenTickets = ticketsInPeriod.filter(
    (t) => t.status === 'open' || t.status === 'assigned' || t.status === 'in_progress',
  ).length;

  const daysInPeriod = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
  const avgDailyTickets = ticketsAssigned / daysInPeriod;

  return {
    staffId: staff.id,
    staffName: staff.name,
    role: staff.role,
    periodStart: start,
    periodEnd: end,

    ticketsAssigned,
    ticketsResolved,
    ticketsEscalated,
    ticketsReopened,
    ticketsClosed,

    avgResolutionTimeHours: Math.round(avgResolutionTimeHours * 100) / 100,
    avgFirstResponseTimeHours: Math.round(avgFirstResponseTimeHours * 100) / 100,
    avgTimeToAssignHours: Math.round(avgTimeToAssignHours * 100) / 100,

    slaComplianceRate: Math.round(slaComplianceRate * 100) / 100,
    firstContactResolutionRate: Math.round(firstContactResolutionRate * 100) / 100,
    customerSatisfactionScore: Math.round(customerSatisfactionScore * 10) / 10,
    avgCustomerSatisfaction: Math.round(customerSatisfactionScore * 10) / 10,
    qualityScore: Math.round(customerSatisfactionScore * 10) / 10,

    slaBreaches,
    slaBreachRate: Math.round(slaBreachRate * 100) / 100,
    priority1Resolved,
    priority2Resolved,
    priority3Resolved,

    currentOpenTickets,
    avgDailyTickets: Math.round(avgDailyTickets * 100) / 100,

    calculatedAt: Date.now(),
  };
}

/** Numeric KPI fields that `buildTeamAverages` sums across the team. */
type NumericKpiKey =
  | 'avgResolutionTimeHours'
  | 'customerSatisfactionScore'
  | 'firstContactResolutionRate'
  | 'ticketsAssigned'
  | 'ticketsResolved'
  | 'ticketsEscalated'
  | 'slaBreaches'
  | 'currentOpenTickets';

/** Team aggregates shared by GET/POST responses. */
export function buildTeamAverages(kpis: SupportStaffKPI[]) {
  const teamCount = kpis.length || 1;
  const total = (key: NumericKpiKey) => kpis.reduce((sum, k) => sum + k[key], 0);
  return {
    avgResolutionTimeHours: Math.round((total('avgResolutionTimeHours') / teamCount) * 100) / 100,
    avgCustomerSatisfaction: Math.round((total('customerSatisfactionScore') / teamCount) * 10) / 10,
    avgFirstContactResolutionRate: Math.round((total('firstContactResolutionRate') / teamCount) * 100) / 100,
    totalTicketsAssigned: total('ticketsAssigned'),
    totalTicketsResolved: total('ticketsResolved'),
    totalTicketsEscalated: total('ticketsEscalated'),
    totalSlaBreaches: total('slaBreaches'),
    totalOpenTickets: total('currentOpenTickets'),
  };
}

/** Support staff — canonical roster in lib/staff.ts. No Firestore read: the
 * `staff` collection was seeded from this roster and is never written at
 * runtime, so the roster is the single source of truth. */
export async function getStaffMembers(_db?: Firestore): Promise<StaffMember[]> {
  return staffRoster.filter((s) => s.department === 'Support').map((s) => ({ id: s.id, name: s.name, role: s.role }));
}

/** Tickets for one staff member within a period (range filtered in memory). */
export async function getTicketsForStaff(_db: Firestore, staff: StaffMember, start: number, end: number): Promise<StaffTicketInput[]> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const rows = await prisma.ticket.findMany({
      where: { assignedTo: staff.id },
      take: 5000,
    });
    const tickets = rows.map(
      (row): StaffTicketInput => ({
        id: row.id,
        ticketNumber: row.ticketNumber,
        status: row.status,
        escalatedTo: row.escalatedTo,
        firstTimeFix: row.firstTimeFix,
        priority: row.priority,
        slaBreached: row.slaBreached,
        reopenedAt: row.reopenedAt != null ? Number(row.reopenedAt) : undefined,
        reopenedCount: row.reopenedCount,
        resolvedAt: row.resolvedAt != null ? Number(row.resolvedAt) : undefined,
        assignedAt: row.assignedAt != null ? Number(row.assignedAt) : undefined,
        createdAt: row.createdAt != null ? Number(row.createdAt) : undefined,
      }),
    );
    return tickets.filter((t) => inPeriod(t.createdAt, start, end));
  } catch {
    return [];
  }
}

/** Feedback for one staff member within a period, matched by id/name/email. */
export async function getFeedbackForStaff(_db: Firestore, staff: StaffMember, start: number, end: number): Promise<StaffFeedbackInput[]> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const rows = await prisma.feedback.findMany({
      where: { category: 'Support' },
      take: 5000,
    });
    return rows
      .map(
        (row): StaffFeedbackInput => ({
          id: row.id,
          staffName: row.staffName,
          // SAFETY: the ratings Json column stores the survey score object
          // ({ professionalism, overall }); non-object payloads coerce to 0 via toNumber.
          ratings: row.ratings as Record<string, number> | null,
          timestamp: row.timestamp != null ? Number(row.timestamp) : undefined,
        }),
      )
      .filter((f) => inPeriod(f.timestamp, start, end) && feedbackMatchesStaff(f, staff));
  } catch {
    return [];
  }
}

/**
 * Compute + persist KPI records for every support staff member.
 * Writes to StaffKpiRecord (per staff × calendar period, MariaDB) and a team
 * snapshot in staff_kpi_snapshots (Firestore, best-effort — quota throttling
 * must never fail the persist). Idempotent per period bucket — safe to run
 * hourly from the sync scheduler.
 */
export async function persistStaffKPIs(
  db: Firestore,
  opts: { period?: KpiPeriod; now?: number; calculatedBy?: string } = {},
): Promise<{ kpis: SupportStaffKPI[]; period: KpiPeriod; periodStart: number; periodEnd: number }> {
  const period = opts.period ?? 'weekly';
  const now = opts.now ?? Date.now();
  const start = periodBucketStart(period, now);
  const end = periodEnd(now);

  const staffMembers = await getStaffMembers(db);

  const kpis: SupportStaffKPI[] = [];
  for (const staff of staffMembers) {
    const [tickets, feedbacks] = await Promise.all([getTicketsForStaff(db, staff, start, end), getFeedbackForStaff(db, staff, start, end)]);
    kpis.push(computeStaffKPIs(staff, tickets, feedbacks, start, end));
  }

  const snapshotId = `${period}_${start}`;

  // Best-effort Firestore team snapshot + record mirror (rollback only).
  try {
    await db
      .collection('staff_kpi_snapshots')
      .doc(snapshotId)
      .set({
        period,
        periodStart: start,
        periodEnd: end,
        kpis,
        calculatedAt: Date.now(),
        calculatedBy: opts.calculatedBy ?? 'hourly-sync',
      });
  } catch {
    // Quota throttling must never fail the persist.
  }

  const { prisma } = await import('@/lib/prisma');
  const bn = (v: number): bigint => BigInt(v);
  const fl = (v: number | undefined): number | null => (v !== undefined && Number.isFinite(v) ? v : null);
  const int = (v: number | undefined): number | null => (v !== undefined && Number.isFinite(v) ? Math.round(v) : null);
  for (const kpi of kpis) {
    const id = `${kpi.staffId}_${start}`;
    const data = {
      staffId: kpi.staffId,
      staffName: kpi.staffName,
      role: kpi.role,
      periodStart: bn(kpi.periodStart),
      periodEnd: bn(kpi.periodEnd),
      ticketsAssigned: int(kpi.ticketsAssigned),
      ticketsResolved: int(kpi.ticketsResolved),
      ticketsEscalated: int(kpi.ticketsEscalated),
      ticketsReopened: int(kpi.ticketsReopened),
      ticketsClosed: int(kpi.ticketsClosed),
      avgResolutionTimeHours: fl(kpi.avgResolutionTimeHours),
      avgFirstResponseTimeHours: fl(kpi.avgFirstResponseTimeHours),
      avgTimeToAssignHours: fl(kpi.avgTimeToAssignHours),
      slaComplianceRate: fl(kpi.slaComplianceRate),
      firstContactResolutionRate: fl(kpi.firstContactResolutionRate),
      customerSatisfactionScore: fl(kpi.customerSatisfactionScore),
      avgCustomerSatisfaction: fl(kpi.avgCustomerSatisfaction),
      qualityScore: fl(kpi.qualityScore),
      slaBreaches: int(kpi.slaBreaches),
      slaBreachRate: fl(kpi.slaBreachRate),
      priority1Resolved: int(kpi.priority1Resolved),
      priority2Resolved: int(kpi.priority2Resolved),
      priority3Resolved: int(kpi.priority3Resolved),
      currentOpenTickets: int(kpi.currentOpenTickets),
      avgDailyTickets: fl(kpi.avgDailyTickets),
      calculatedAt: bn(kpi.calculatedAt),
      lastSyncAt: bn(now),
    };
    await prisma.staffKpiRecord.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  return { kpis, period, periodStart: start, periodEnd: end };
}
