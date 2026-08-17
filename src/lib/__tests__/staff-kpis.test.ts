import { describe, it, expect } from 'vitest';
import {
  normalizePeriod,
  rollingWindowStart,
  periodBucketStart,
  periodEnd,
  computeStaffKPIs,
  buildTeamAverages,
  ticketMatchesStaff,
  feedbackMatchesStaff,
  type StaffMember,
} from '../staff-kpis';

const HOUR = 1000 * 60 * 60;
const DAY = 24 * HOUR;

describe('normalizePeriod', () => {
  it('accepts both short and long spellings', () => {
    expect(normalizePeriod('week')).toBe('weekly');
    expect(normalizePeriod('weekly')).toBe('weekly');
    expect(normalizePeriod('month')).toBe('monthly');
    expect(normalizePeriod('monthly')).toBe('monthly');
    expect(normalizePeriod('quarter')).toBe('quarterly');
    expect(normalizePeriod('quarterly')).toBe('quarterly');
  });

  it('is case-insensitive and defaults to monthly', () => {
    expect(normalizePeriod('WEEK')).toBe('weekly');
    expect(normalizePeriod('Week')).toBe('weekly');
    expect(normalizePeriod('')).toBe('monthly');
    expect(normalizePeriod(null)).toBe('monthly');
    expect(normalizePeriod('garbage')).toBe('monthly');
    expect(normalizePeriod(undefined)).toBe('monthly');
  });
});

describe('periodBucketStart', () => {
  it('anchors weekly buckets to Monday 00:00', () => {
    // Wed 2026-08-05 (a Wednesday) → Mon 2026-08-03 00:00
    const wed = new Date(2026, 7, 5, 14, 30).getTime();
    const start = new Date(periodBucketStart('weekly', wed));
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(3);
  });

  it('anchors monthly buckets to the 1st at 00:00', () => {
    const mid = new Date(2026, 7, 15, 10, 0).getTime(); // 2026-08-15
    const start = new Date(periodBucketStart('monthly', mid));
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(7); // August
    expect(start.getHours()).toBe(0);
  });

  it('anchors quarterly buckets to Jan/Apr/Jul/Oct', () => {
    const aug = new Date(periodBucketStart('quarterly', new Date(2026, 7, 10).getTime())); // August → Q3 (Jul 1)
    expect(aug.getMonth()).toBe(6);
    expect(aug.getDate()).toBe(1);
    const nov = new Date(periodBucketStart('quarterly', new Date(2026, 10, 10).getTime())); // November → Q4 (Oct 1)
    expect(nov.getMonth()).toBe(9);
    expect(nov.getDate()).toBe(1);
  });
});

describe('rollingWindowStart + periodEnd', () => {
  it('returns 7/30/90-day windows anchored to midnight', () => {
    const now = new Date(2026, 7, 5, 14, 30).getTime(); // Aug 5 14:30
    const todayMidnight = new Date(2026, 7, 5, 0, 0, 0, 0).getTime();
    expect(rollingWindowStart('weekly', now)).toBe(todayMidnight - 7 * DAY);
    expect(rollingWindowStart('monthly', now)).toBe(todayMidnight - 30 * DAY);
    expect(rollingWindowStart('quarterly', now)).toBe(todayMidnight - 90 * DAY);
  });

  it('periodEnd is end-of-day', () => {
    const now = new Date(2026, 7, 5, 14, 30).getTime();
    const end = new Date(periodEnd(now));
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });
});

describe('ticketMatchesStaff / feedbackMatchesStaff', () => {
  const staff: StaffMember = { id: 'backend-yusuf-femi', name: 'Yusuf Femi', role: 'Back-end Support' };

  it('matches by id, name, or email', () => {
    expect(ticketMatchesStaff({ assignedTo: 'backend-yusuf-femi' }, staff)).toBe(true);
    expect(ticketMatchesStaff({ assignedTo: 'yusuf femi' }, staff)).toBe(true);
    expect(ticketMatchesStaff({ assignedTo: 'YUSUF FEMI' }, staff)).toBe(true);
    expect(ticketMatchesStaff({ assignedTo: 'someone-else' }, staff)).toBe(false);
    expect(ticketMatchesStaff({ assignedTo: null }, staff)).toBe(false);
  });

  it('matches feedback by staffName substring', () => {
    expect(feedbackMatchesStaff({ staffName: 'Yusuf Femi' }, staff)).toBe(true);
    expect(feedbackMatchesStaff({ staffName: 'Tech: Yusuf Femi (Ibadan)' }, staff)).toBe(true);
    expect(feedbackMatchesStaff({ staffName: 'Ibrahim Gbadamosi' }, staff)).toBe(false);
    expect(feedbackMatchesStaff({}, staff)).toBe(false);
  });
});

describe('computeStaffKPIs', () => {
  const staff: StaffMember = { id: 'backend-yusuf-femi', name: 'Yusuf Femi', role: 'Back-end Support' };
  const start = new Date(2026, 7, 1).getTime(); // Aug 1
  const end = new Date(2026, 7, 31, 23, 59, 59).getTime(); // Aug 31

  function ticket(overrides: Record<string, unknown>) {
    return {
      id: 't-' + Math.random().toString(36).slice(2),
      status: 'open',
      priority: 2,
      createdAt: start + 1 * DAY,
      ...overrides,
    };
  }

  it('counts volumes and priority breakdowns', () => {
    const kpi = computeStaffKPIs(
      staff,
      [
        ticket({ status: 'resolved', resolvedAt: start + 2 * DAY, priority: 1 }),
        ticket({ status: 'resolved', resolvedAt: start + 3 * DAY, priority: 1 }),
        ticket({ status: 'closed', priority: 2 }),
        ticket({ status: 'open', escalatedTo: 'backend-ibrahim-gbadamosi' }),
        ticket({ status: 'in_progress', reopenedAt: start + 4 * DAY, priority: 3 }),
      ],
      [],
      start,
      end,
    );

    expect(kpi.ticketsAssigned).toBe(5);
    expect(kpi.ticketsResolved).toBe(2);
    expect(kpi.ticketsEscalated).toBe(1);
    expect(kpi.ticketsReopened).toBe(1);
    expect(kpi.priority1Resolved).toBe(2);
    expect(kpi.priority2Resolved).toBe(0);
    expect(kpi.priority3Resolved).toBe(0);
    expect(kpi.currentOpenTickets).toBe(2); // open + in_progress
  });

  it('computes average resolution time in hours', () => {
    const kpi = computeStaffKPIs(
      staff,
      [
        ticket({ status: 'resolved', createdAt: start + 1 * DAY, resolvedAt: start + 1 * DAY + 24 * HOUR }),
        ticket({ status: 'resolved', createdAt: start + 2 * DAY, resolvedAt: start + 2 * DAY + 48 * HOUR }),
      ],
      [],
      start,
      end,
    );
    expect(kpi.avgResolutionTimeHours).toBe(36); // (24 + 48) / 2
  });

  it('computes first-response (assign) time', () => {
    const kpi = computeStaffKPIs(staff, [ticket({ createdAt: start + 1 * DAY, assignedAt: start + 1 * DAY + 6 * HOUR })], [], start, end);
    expect(kpi.avgFirstResponseTimeHours).toBe(6);
    expect(kpi.avgTimeToAssignHours).toBe(6);
  });

  it('computes SLA compliance and FCR', () => {
    const kpi = computeStaffKPIs(
      staff,
      [
        ticket({ status: 'resolved', firstTimeFix: true, slaBreached: false }),
        ticket({ status: 'resolved', firstTimeFix: false, slaBreached: true }),
        ticket({ status: 'resolved', firstTimeFix: true, slaBreached: false }),
      ],
      [],
      start,
      end,
    );
    expect(kpi.slaBreaches).toBe(1);
    expect(kpi.slaBreachRate).toBeCloseTo(33.33, 1);
    expect(kpi.slaComplianceRate).toBeCloseTo(66.67, 1);
    expect(kpi.firstContactResolutionRate).toBeCloseTo(66.67, 1);
  });

  it('derives CSAT from professionalism, falling back to overall', () => {
    const kpi = computeStaffKPIs(
      staff,
      [],
      [
        { staffName: 'Yusuf Femi', timestamp: start + 1 * DAY, ratings: { professionalism: 5 } },
        { staffName: 'Yusuf Femi', timestamp: start + 2 * DAY, ratings: { professionalism: 3 } },
        // outside period → ignored
        { staffName: 'Yusuf Femi', timestamp: end + 1 * DAY, ratings: { professionalism: 1 } },
      ],
      start,
      end,
    );
    expect(kpi.customerSatisfactionScore).toBe(4);
    expect(kpi.qualityScore).toBe(4);

    const fallback = computeStaffKPIs(
      staff,
      [],
      [{ staffName: 'Yusuf Femi', timestamp: start + 1 * DAY, ratings: { overall: 4 } }],
      start,
      end,
    );
    expect(fallback.customerSatisfactionScore).toBe(4);
  });

  it('returns zeros when there is no data', () => {
    const kpi = computeStaffKPIs(staff, [], [], start, end);
    expect(kpi.ticketsAssigned).toBe(0);
    expect(kpi.ticketsResolved).toBe(0);
    expect(kpi.slaComplianceRate).toBe(100);
    expect(kpi.firstContactResolutionRate).toBe(0);
    expect(kpi.customerSatisfactionScore).toBe(0);
    expect(kpi.avgResolutionTimeHours).toBe(0);
  });

  it('only counts tickets inside the period', () => {
    const kpi = computeStaffKPIs(
      staff,
      [
        ticket({ createdAt: start - 10 * DAY, status: 'resolved', resolvedAt: start - 9 * DAY }),
        ticket({ createdAt: start + 1 * DAY, status: 'resolved', resolvedAt: start + 2 * DAY }),
      ],
      [],
      start,
      end,
    );
    expect(kpi.ticketsAssigned).toBe(1);
  });
});

describe('buildTeamAverages', () => {
  it('aggregates across staff without dividing by zero', () => {
    expect(buildTeamAverages([]).avgResolutionTimeHours).toBe(0);
    expect(buildTeamAverages([]).totalTicketsAssigned).toBe(0);
  });

  it('averages the right fields', () => {
    const base = {
      staffId: 'x',
      staffName: 'x',
      role: 'r',
      periodStart: 0,
      periodEnd: 0,
      ticketsAssigned: 4,
      ticketsResolved: 2,
      ticketsEscalated: 1,
      ticketsReopened: 0,
      ticketsClosed: 1,
      avgResolutionTimeHours: 10,
      avgFirstResponseTimeHours: 2,
      avgTimeToAssignHours: 1,
      slaComplianceRate: 90,
      firstContactResolutionRate: 80,
      customerSatisfactionScore: 4,
      avgCustomerSatisfaction: 4,
      qualityScore: 4,
      slaBreaches: 1,
      slaBreachRate: 10,
      priority1Resolved: 1,
      priority2Resolved: 1,
      priority3Resolved: 0,
      currentOpenTickets: 2,
      avgDailyTickets: 1,
      calculatedAt: 0,
    };
    const team = buildTeamAverages([
      { ...base, avgResolutionTimeHours: 10, customerSatisfactionScore: 4 },
      { ...base, avgResolutionTimeHours: 30, customerSatisfactionScore: 2 },
    ]);
    expect(team.avgResolutionTimeHours).toBe(20);
    expect(team.avgCustomerSatisfaction).toBe(3);
    expect(team.totalTicketsAssigned).toBe(8);
    expect(team.totalOpenTickets).toBe(4);
  });
});
