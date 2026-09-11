import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  parseTargetValue,
  buildKpiRows,
  buildCsv,
  monthRange,
  previousMonth,
  applyBreakdownOverrides,
  type MonthMetrics,
} from '../monthly-pack';

const METRICS: MonthMetrics = {
  opening: 400,
  newCustomers: 60,
  churned: 8,
  closing: 452,
  grossChurnPct: 2.0,
  netGrowth: 52,
  mrrAtRisk: 120000,
  mrrRetained: 100000,
  customersSaved: 3,
  totalComplaints: 25,
  complaintsResolved: 22,
  resolutionRatePct: 88.0,
  firstResponseMins: 24.5,
  avgResolutionHrs: 30.0,
  slaCompliancePct: 95.5,
  repeatComplaints: 4,
  escalatedComplaints: 2,
  unresolvedOver24h: 1,
  csatPct: 87.5,
  csatResponses: 40,
  nps: 55,
  breakdown: [
    { type: 'No connectivity', count: 15, pct: 60, customersAffected: 12, mrrAtRisk: 45000 },
    { type: 'Slow speeds', count: 10, pct: 40, customersAffected: 9, mrrAtRisk: 30000 },
  ],
};

const ZERO: MonthMetrics = { ...METRICS, opening: 0, newCustomers: 0, churned: 0, closing: 0, grossChurnPct: 0, netGrowth: 0, mrrAtRisk: 0, mrrRetained: 0, customersSaved: 0, totalComplaints: 0, complaintsResolved: 0, repeatComplaints: 0, escalatedComplaints: 0, unresolvedOver24h: 0, csatPct: null, csatResponses: 0, nps: null, firstResponseMins: null, avgResolutionHrs: null, slaCompliancePct: null, resolutionRatePct: null, breakdown: [] };

describe('parseTargetValue', () => {
  it('extracts numbers from comparison targets', () => {
    expect(parseTargetValue('<= 3%')).toBe(3);
    expect(parseTargetValue('>= 200000')).toBe(200000);
    expect(parseTargetValue('>= 500,000')).toBe(500000);
    expect(parseTargetValue('0')).toBe(0);
  });

  it('returns null for informational rows', () => {
    expect(parseTargetValue('')).toBeNull();
    expect(parseTargetValue('—')).toBeNull();
  });
});

describe('buildKpiRows', () => {
  it('produces one row per KPI in workbook order', () => {
    const rows = buildKpiRows(METRICS, METRICS, METRICS);
    expect(rows.length).toBe(20);
    expect(rows[0].kpi).toBe('Opening customer base');
    expect(rows[rows.length - 1].kpi).toBe('NPS');
  });

  it('fills actuals from metrics', () => {
    const rows = buildKpiRows(METRICS, METRICS, METRICS);
    const byKpi = Object.fromEntries(rows.map((r) => [r.kpi, r]));
    expect(byKpi['Opening customer base'].actual).toBe('400');
    expect(byKpi['Closing customer base'].actual).toBe('452');
    expect(byKpi['Gross churn %'].actual).toBe('2.0%');
    expect(byKpi['Net customer growth'].actual).toBe('52');
    expect(byKpi['Resolution rate'].actual).toBe('88.0%');
    expect(byKpi['NPS'].actual).toBe('55');
  });

  it('marks on-track / at-risk against target direction', () => {
    const rows = buildKpiRows(METRICS, METRICS, METRICS);
    const byKpi = Object.fromEntries(rows.map((r) => [r.kpi, r]));
    // Gross churn 2.0% <= 3% target (lower is better) → on-track
    expect(byKpi['Gross churn %'].status).toBe('on-track');
    // Resolution rate 88% < 90% target → at-risk
    expect(byKpi['Resolution rate'].status).toBe('at-risk');
    // Opening base has no target
    expect(byKpi['Opening customer base'].status).toBe('no-target');
  });

  it('computes variance as actual minus target', () => {
    const rows = buildKpiRows(METRICS, METRICS, METRICS);
    const byKpi = Object.fromEntries(rows.map((r) => [r.kpi, r]));
    expect(byKpi['Net customer growth'].variance).toBe('+12'); // 52 - 40
    expect(byKpi['Gross churn %'].variance).toBe('-1'); // 2 - 3
  });

  it('applies admin overrides for target/comment/action/owner', () => {
    const rows = buildKpiRows(METRICS, METRICS, METRICS, {
      rows: { 'New customers': { target: '>= 100', comment: 'Fiber launch', action: 'Ads', owner: 'Tunde' } },
    });
    const row = rows.find((r) => r.kpi === 'New customers');
    expect(row?.target).toBe('>= 100');
    expect(row?.comment).toBe('Fiber launch');
    expect(row?.action).toBe('Ads');
    expect(row?.owner).toBe('Tunde');
    expect(row?.status).toBe('at-risk'); // 60 < 100
  });

  it('handles empty metrics without dividing by zero', () => {
    const rows = buildKpiRows(ZERO, ZERO, ZERO);
    const byKpi = Object.fromEntries(rows.map((r) => [r.kpi, r]));
    expect(byKpi['Gross churn %'].actual).toBe('0.0%');
    expect(byKpi['Resolution rate'].actual).toBe('—');
    expect(byKpi['CSAT'].actual).toBe('—');
  });
});

describe('buildCsv', () => {
  it('emits the workbook header plus KPI and breakdown sections', () => {
    const csv = buildCsv(buildKpiRows(METRICS, METRICS, METRICS), METRICS.breakdown);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('KPI,Target,Actual,Variance,Previous Month,YTD,Status,Comment / Root Cause,Action,Owner');
    expect(lines).toContain('"No connectivity","15","60%","12","45,000","","",""');
    expect(lines[21]).toBe('');
    expect(lines[22]).toBe('Complaint Type,No.,% of Complaints,Customers Affected,MRR/Revenue at Risk,Root Cause,Corrective Action,Owner');
  });
});

describe('applyBreakdownOverrides', () => {
  it('merges root cause / action / owner onto breakdown rows', () => {
    const out = applyBreakdownOverrides(METRICS.breakdown, {
      breakdown: { 'No connectivity': { rootCause: 'Fiber cut', action: 'Redundant ring', owner: 'NOC' } },
    });
    expect(out[0].rootCause).toBe('Fiber cut');
    expect(out[0].owner).toBe('NOC');
    expect(out[1].rootCause).toBeUndefined();
  });
});

describe('monthRange / previousMonth', () => {
  it('computes UTC month boundaries', () => {
    const { startMs, endMs } = monthRange('2026-08');
    expect(new Date(startMs).toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(new Date(endMs).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('rolls back across the year boundary', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-08')).toBe('2026-07');
  });
});
