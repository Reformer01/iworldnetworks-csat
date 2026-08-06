import { describe, it, expect } from 'vitest';
import {
  getRegionForLocation,
  getSegmentForPlan,
  parseNairaAmount,
  getQuarterFromMonth,
  getMonthsForQuarter,
  salesAgents,
  regionalTargets,
  totalAnnualTarget,
  totalCustomerTarget,
  planCodes,
  planPricing,
} from '../sales-staff';
import { btsStations, getBtsByRegion, getRegionsFromBts } from '../bts-data';

describe('getRegionForLocation', () => {
  it('returns Ondo for Akure-based locations', () => {
    expect(getRegionForLocation('Akure')).toBe('Ondo');
    expect(getRegionForLocation('akure south')).toBe('Ondo');
    expect(getRegionForLocation('No 5, Akure Road')).toBe('Ondo');
  });

  it('returns Osun for Osogbo-based locations', () => {
    expect(getRegionForLocation('Osogbo')).toBe('Osun');
    expect(getRegionForLocation('Oshogbo')).toBe('Osun');
  });

  it('returns Oyo for Ibadan and Oyo locations', () => {
    expect(getRegionForLocation('Ibadan')).toBe('Oyo');
    expect(getRegionForLocation('Oyo')).toBe('Oyo');
  });

  it('defaults to Oyo for unknown locations', () => {
    expect(getRegionForLocation('Unknown City')).toBe('Oyo');
    expect(getRegionForLocation('')).toBe('Oyo');
  });

  it('is case-insensitive', () => {
    expect(getRegionForLocation('AKURE')).toBe('Ondo');
    expect(getRegionForLocation('IBADAN')).toBe('Oyo');
    expect(getRegionForLocation('OSOGBO')).toBe('Osun');
  });

  it('trims whitespace', () => {
    expect(getRegionForLocation('  Akure  ')).toBe('Ondo');
  });
});

describe('getSegmentForPlan', () => {
  it('returns HOME for H- prefixed plans', () => {
    expect(getSegmentForPlan('H-Lite')).toBe('HOME');
    expect(getSegmentForPlan('H-Pro')).toBe('HOME');
    expect(getSegmentForPlan('h-max')).toBe('HOME');
  });

  it('returns SME for U- prefixed plans', () => {
    expect(getSegmentForPlan('U-Lite')).toBe('SME');
    expect(getSegmentForPlan('U-Max')).toBe('SME');
  });

  it('returns ENTERPRISE for other plans', () => {
    expect(getSegmentForPlan('Enterprise 10Mbps')).toBe('ENTERPRISE');
    expect(getSegmentForPlan('Dedicated 5Mbps')).toBe('ENTERPRISE');
    expect(getSegmentForPlan('')).toBe('ENTERPRISE');
  });

  it('returns NEIGHBOURHOOD for N- prefixed plans', () => {
    expect(getSegmentForPlan('N-10K')).toBe('NEIGHBOURHOOD');
    expect(getSegmentForPlan('N-15K')).toBe('NEIGHBOURHOOD');
    expect(getSegmentForPlan('N-22-5K')).toBe('NEIGHBOURHOOD');
    expect(getSegmentForPlan('n-10k')).toBe('NEIGHBOURHOOD');
  });
});

describe('parseNairaAmount', () => {
  it('parses plain numbers', () => {
    expect(parseNairaAmount('27500')).toBe(27500);
    expect(parseNairaAmount('0')).toBe(0);
  });

  it('parses Naira-prefixed amounts', () => {
    expect(parseNairaAmount('₦27,500')).toBe(27500);
    expect(parseNairaAmount('₦227500')).toBe(227500);
    expect(parseNairaAmount('₦1,000,000')).toBe(1000000);
  });

  it('parses N-prefixed amounts', () => {
    expect(parseNairaAmount('N227,500')).toBe(227500);
    expect(parseNairaAmount('N500')).toBe(500);
  });

  it('handles trailing text after amount', () => {
    expect(parseNairaAmount('₦27,500 H-Lite')).toBe(27500);
    expect(parseNairaAmount('N227,500 SME Plan')).toBe(227500);
  });

  it('handles whitespace around amount', () => {
    expect(parseNairaAmount('  ₦27,500  ')).toBe(27500);
  });

  it('returns 0 for empty string', () => {
    expect(parseNairaAmount('')).toBe(0);
  });

  it('returns 0 for non-numeric input', () => {
    expect(parseNairaAmount('abc')).toBe(0);
    expect(parseNairaAmount('  ')).toBe(0);
  });

  it('handles decimal amounts', () => {
    expect(parseNairaAmount('27500.50')).toBe(27500.5);
    expect(parseNairaAmount('₦27,500.75')).toBe(27500.75);
  });
});

describe('getQuarterFromMonth', () => {
  it('returns QUARTER 1 for July-September', () => {
    expect(getQuarterFromMonth('July')).toBe('QUARTER 1');
    expect(getQuarterFromMonth('August')).toBe('QUARTER 1');
    expect(getQuarterFromMonth('September')).toBe('QUARTER 1');
  });

  it('returns QUARTER 2 for October-December', () => {
    expect(getQuarterFromMonth('October')).toBe('QUARTER 2');
    expect(getQuarterFromMonth('November')).toBe('QUARTER 2');
    expect(getQuarterFromMonth('December')).toBe('QUARTER 2');
  });

  it('returns QUARTER 3 for January-March', () => {
    expect(getQuarterFromMonth('January')).toBe('QUARTER 3');
    expect(getQuarterFromMonth('February')).toBe('QUARTER 3');
    expect(getQuarterFromMonth('March')).toBe('QUARTER 3');
  });

  it('returns QUARTER 4 for April-June', () => {
    expect(getQuarterFromMonth('April')).toBe('QUARTER 4');
    expect(getQuarterFromMonth('May')).toBe('QUARTER 4');
    expect(getQuarterFromMonth('June')).toBe('QUARTER 4');
  });

  it('returns QUARTER 4 for unknown months', () => {
    expect(getQuarterFromMonth('Unknown')).toBe('QUARTER 4');
    expect(getQuarterFromMonth('')).toBe('QUARTER 4');
  });
});

describe('getMonthsForQuarter', () => {
  it('returns correct months for each quarter', () => {
    expect(getMonthsForQuarter('QUARTER 1')).toEqual(['July', 'August', 'September']);
    expect(getMonthsForQuarter('QUARTER 2')).toEqual(['October', 'November', 'December']);
    expect(getMonthsForQuarter('QUARTER 3')).toEqual(['January', 'February', 'March']);
    expect(getMonthsForQuarter('QUARTER 4')).toEqual(['April', 'May', 'June']);
  });
});

describe('sales staff data integrity', () => {
  it('has 7 sales agents', () => {
    expect(salesAgents).toHaveLength(7);
  });

  it('has all 4 regions represented', () => {
    const regions = salesAgents.map((a) => a.region);
    expect(regions).toContain('Ogun');
    expect(regions).toContain('Oyo');
    expect(regions).toContain('Osun');
    expect(regions).toContain('Ondo');
  });

  it('each agent has a positive annual target', () => {
    for (const agent of salesAgents) {
      expect(agent.annualTarget).toBeGreaterThan(0);
    }
  });

  it('agent annual targets sum to company target minus removed agents', () => {
    const sum = salesAgents.reduce((acc, a) => acc + a.annualTarget, 0);
    expect(sum).toBe(23700000);
  });

  it('has 4 regional targets summing to 100%', () => {
    expect(regionalTargets).toHaveLength(4);
    const pctSum = regionalTargets.reduce((acc, r) => acc + r.targetPercentage, 0);
    expect(pctSum).toBe(100);
  });

  it('regional revenue targets sum to total', () => {
    const sum = regionalTargets.reduce((acc, r) => acc + r.annualRevenueTarget, 0);
    expect(sum).toBe(totalAnnualTarget);
  });

  it('regional customer targets sum to total', () => {
    const sum = regionalTargets.reduce((acc, r) => acc + r.annualCustomerTarget, 0);
    expect(sum).toBe(totalCustomerTarget);
  });

  it('planCodes includes Neighbourhood plans', () => {
    const nCodes = planCodes.filter((p) => p.segment === 'NEIGHBOURHOOD');
    expect(nCodes).toHaveLength(3);
    expect(nCodes.map((c) => c.code)).toEqual(['N-10K', 'N-15K', 'N-22-5K']);
  });

  it('planPricing includes Neighbourhood plans', () => {
    expect(planPricing['N-10K'].mrc).toBe(10000);
    expect(planPricing['N-15K'].mrc).toBe(15000);
    expect(planPricing['N-22-5K'].mrc).toBe(22500);
  });
});

describe('BTS data', () => {
  it('has 58 stations', () => {
    expect(btsStations).toHaveLength(58);
  });

  it('includes Abeokuta and Ibadan stations', () => {
    const abeokuta = getBtsByRegion('Abeokuta');
    expect(abeokuta.length).toBeGreaterThan(10);
    const ibadan = getBtsByRegion('Ibadan');
    expect(ibadan.length).toBeGreaterThan(5);
  });

  it('getRegionsFromBts returns unique regions', () => {
    const regions = getRegionsFromBts();
    expect(regions).toContain('Abeokuta');
    expect(regions).toContain('Ibadan');
    expect(regions).toContain('Akure');
  });

  it('each station has a unique id', () => {
    const ids = btsStations.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
