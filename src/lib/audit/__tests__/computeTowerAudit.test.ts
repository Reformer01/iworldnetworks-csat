import { describe, it, expect } from 'vitest';
import {
  canonicalRegionForTowerName,
  regionFromMajorityCity,
  computeTowerAuditRows,
  filterAuditRows,
  type TowerSiteRow,
  type CustomerAuditRow,
} from '../computeTowerAudit';

const TOWERS: TowerSiteRow[] = [
  { id: 't1', name: 'Dominion', status: 'active', suspended: false, deviceCount: 4, deviceOutageCount: 0, lastSyncAt: 1786000000000 },
  { id: 't2', name: 'Unknown UISP Tower', status: 'disabled', suspended: true, deviceCount: 2, deviceOutageCount: 1, lastSyncAt: 1786000000001 },
  { id: 't3', name: 'Empty Tower', status: 'active', suspended: false, deviceCount: 1, deviceOutageCount: 0, lastSyncAt: 1786000000002 },
];

const CUSTOMERS: CustomerAuditRow[] = [
  { btsId: 't1', lifecycle: 'active', accountType: 'ENTERPRISE', mrrTotal: 250000, city: 'Ibadan' },
  { btsId: 't1', lifecycle: 'active', accountType: 'RETAIL', mrrTotal: 15000, city: 'Ibadan' },
  { btsId: 't1', lifecycle: 'inactive', accountType: null, mrrTotal: null, city: 'Oyo' },
  { btsId: 't1', lifecycle: 'churned', accountType: 'RETAIL', mrrTotal: 20000, city: 'Ibadan' },
  { btsId: 't2', lifecycle: 'active', accountType: 'SME', mrrTotal: 80000, city: 'Akure' },
  { btsId: 't2', lifecycle: 'blocked', accountType: 'SME', mrrTotal: 50000, city: 'Akure' },
  // No tower attribution — must be ignored.
  { btsId: null, lifecycle: 'active', accountType: 'RETAIL', mrrTotal: 10000, city: 'Ibadan' },
];

describe('canonicalRegionForTowerName', () => {
  it('resolves exact station names', () => {
    expect(canonicalRegionForTowerName('Dominion')).toBe('Ibadan');
    expect(canonicalRegionForTowerName('Obada Oko')).toBe('Abeokuta');
  });

  it('resolves noisy names via normalization', () => {
    expect(canonicalRegionForTowerName('JERICHO BTS')).toBe('Ibadan');
    expect(canonicalRegionForTowerName('OTA [Office Core]')).toBe('Ota');
  });

  it('returns null for names with no static station', () => {
    expect(canonicalRegionForTowerName('Unknown UISP Tower')).toBeNull();
    expect(canonicalRegionForTowerName(null)).toBeNull();
  });
});

describe('regionFromMajorityCity', () => {
  it('picks the most common canonical customer-city region', () => {
    expect(regionFromMajorityCity(CUSTOMERS.filter((c) => c.btsId === 't2'))).toBe('Akure');
  });

  it('returns null with no resolvable cities', () => {
    expect(regionFromMajorityCity([{ btsId: 't3', lifecycle: 'active', accountType: 'RETAIL', mrrTotal: 1, city: 'Nowhereville' }])).toBeNull();
    expect(regionFromMajorityCity([])).toBeNull();
  });
});

describe('computeTowerAuditRows', () => {
  const rows = computeTowerAuditRows(TOWERS, CUSTOMERS);
  const t1 = rows.find((r) => r.towerId === 't1')!;
  const t2 = rows.find((r) => r.towerId === 't2')!;

  it('groups customers by btsId with active/lifecycle totals', () => {
    expect(t1.customers.total).toBe(4);
    expect(t1.customers.active).toBe(2);
    expect(t2.customers.total).toBe(2);
    expect(t2.customers.active).toBe(1);
  });

  it('sums potential MRR for every connected customer and splits by account type', () => {
    expect(t1.mrrTotal).toBe(250000 + 15000 + 0 + 20000);
    expect(t1.activeMrr).toBe(250000 + 15000);
    expect(t1.mrrByAccountType.ENTERPRISE).toBe(250000);
    expect(t1.mrrByAccountType.RETAIL).toBe(15000 + 20000);
    expect(t1.activeMrrByAccountType.ENTERPRISE).toBe(250000);
    expect(t1.activeMrrByAccountType.RETAIL).toBe(15000);
  });

  it('uses stored discounted MRR for a bundled service label', () => {
    const rows = computeTowerAuditRows(TOWERS, [{
      btsId: 't1', lifecycle: 'active', accountType: 'regular',
      servicePlan: 'H-Lite + U-Lite', mrrTotal: 54000, city: 'Ibadan',
    }]);
    expect(rows[0].mrrTotal).toBe(54000);
    expect(rows[0].activeMrr).toBe(54000);
    expect(rows[0].customers.byAccountType.BUNDLED).toBe(1);
  });

  it('returns the potential and active MRR for each attributed customer', () => {
    const enterprise = t1.customers.customerDetails.find((customer) => customer.accountType === 'ENTERPRISE');
    const churned = t1.customers.customerDetails.find((customer) => customer.lifecycle === 'churned');

    expect(enterprise).toMatchObject({ potentialMrr: 250000, activeMrr: 250000 });
    expect(churned).toMatchObject({ potentialMrr: 20000, activeMrr: 0 });
  });

  it('rolls null accountType up under OTHER', () => {
    expect(t1.customers.byAccountType.OTHER).toBe(1);
    expect(t1.customers.byAccountType.RETAIL).toBe(2);
  });

  it('resolves region: static match first, majority city fallback, else Unknown', () => {
    expect(t1.region).toBe('Ibadan');
    expect(t2.region).toBe('Akure');
    expect(rows.find((r) => r.towerId === 't3')!.region).toBe('Unknown');
  });

  it('passes through UISP device/outage/sync fields', () => {
    expect(t2.status).toBe('disabled');
    expect(t2.suspended).toBe(true);
    expect(t2.deviceCount).toBe(2);
    expect(t2.deviceOutageCount).toBe(1);
    expect(t2.lastSyncAt).toBe(1786000000001);
  });

  it('ignores customers without btsId', () => {
    const total = rows.reduce((acc, r) => acc + r.customers.total, 0);
    expect(total).toBe(6);
  });

  it('computes rosterSyncAt as the max customer lastSyncAt (null when no customers)', () => {
    const stamped: CustomerAuditRow[] = [
      { btsId: 't1', lifecycle: 'active', accountType: 'RETAIL', mrrTotal: 1000, city: 'Ibadan', lastSyncAt: 1786000001000 },
      { btsId: 't1', lifecycle: 'active', accountType: 'RETAIL', mrrTotal: 1000, city: 'Ibadan', lastSyncAt: 1786000005000 },
      { btsId: 't1', lifecycle: 'active', accountType: 'RETAIL', mrrTotal: 1000, city: 'Ibadan', lastSyncAt: null },
      { btsId: 't2', lifecycle: 'active', accountType: 'SME', mrrTotal: 1000, city: 'Akure' },
    ];
    const rs = computeTowerAuditRows(TOWERS, stamped);
    expect(rs.find((r) => r.towerId === 't1')!.rosterSyncAt).toBe(1786000005000);
    expect(rs.find((r) => r.towerId === 't2')!.rosterSyncAt).toBeNull();
    expect(rs.find((r) => r.towerId === 't3')!.rosterSyncAt).toBeNull();
    // UISP device clock passes through untouched alongside the roster clock.
    expect(rs.find((r) => r.towerId === 't1')!.lastSyncAt).toBe(1786000000000);
  });
});

describe('filterAuditRows', () => {
  const rows = computeTowerAuditRows(TOWERS, CUSTOMERS);

  it('hides empty towers by default', () => {
    const filtered = filterAuditRows(rows, false);
    expect(filtered.map((r) => r.towerId)).toEqual(['t1', 't2']);
  });

  it('keeps empty towers when includeEmpty=true', () => {
    const filtered = filterAuditRows(rows, true);
    expect(filtered.map((r) => r.towerId)).toEqual(['t1', 't2', 't3']);
  });
});
