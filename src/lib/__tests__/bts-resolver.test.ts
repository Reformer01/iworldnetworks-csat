import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeSiteName, endpointMatchScore, resolveCustomerBts, regionForStationName } from '../bts-resolver';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    uispSite: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';

const mockEndpoints = [
  { id: 'e1', name: 'Wiseki Technologies Limited', type: 'endpoint', btsId: 's1', btsName: 'Honor ' },
  { id: 'e2', name: 'Femi Ogunleye', type: 'endpoint', btsId: 's2', btsName: 'Sagamu GRA' },
  { id: 'e3', name: 'Odua Telecoms Limited', type: 'endpoint', btsId: 's3', btsName: 'Sijuwola House Ibadan Core' },
  { id: 'e4', name: 'XYZ Ventures', type: 'endpoint', btsId: null, btsName: null },
  { id: 'e5', name: 'Obada Oko Customer Ltd', type: 'endpoint', btsId: null, btsName: null },
];

const mockCustomers = [
  { customerName: 'Wiseki Technologies Limited', btsName: 'Honor' },
  { customerName: 'Femi Ogunleye', btsName: 'Sagamu GRA' },
];

describe('normalizeSiteName', () => {
  it('strips brackets, suffixes and punctuation', () => {
    expect(normalizeSiteName('JERICHO BTS')).toBe('jericho');
    expect(normalizeSiteName('Space FM ')).toBe('space');
    expect(normalizeSiteName('OTA [Office Core]')).toBe('ota');
    expect(normalizeSiteName('Obada Oko Extension ')).toBe('obada oko extension');
    expect(normalizeSiteName('CUAB[Google for Education]')).toBe('cuab');
  });
});

describe('endpointMatchScore', () => {
  it('scores identical names 1.0', () => {
    expect(endpointMatchScore('Wiseki Technologies Limited', 'Wiseki Technologies Limited')).toBe(1);
  });
  it('scores partial overlap between 0 and 1', () => {
    const score = endpointMatchScore('Wiseki Technologies', 'Wiseki Technologies Limited');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
  it('scores unrelated names 0', () => {
    expect(endpointMatchScore('Alpha Beta', 'Omega Gamma Delta')).toBe(0);
  });
});

describe('resolveCustomerBts', () => {
  beforeEach(() => {
    vi.mocked(prisma.uispSite.findMany).mockReset();
    vi.mocked(prisma.customer.findMany).mockReset();
  });

  it('resolves via unified Customer match before any scan', async () => {
    const result = await resolveCustomerBts('Wiseki Technologies Limited', mockEndpoints, mockCustomers);
    expect(result).toEqual({
      btsName: 'Honor',
      region: 'Ibadan',
      source: 'unified',
      matchedName: 'Wiseki Technologies Limited',
    });
  });

  it('takes the first attributed row when names collide', async () => {
    const dupes = [
      { customerName: 'Femi Ogunleye', btsName: 'Jericho' },
      { customerName: 'Ogunleye, Femi', btsName: 'Sagamu GRA' },
    ];
    const result = await resolveCustomerBts('Femi Ogunleye', mockEndpoints, dupes);
    expect(result).toEqual({
      btsName: 'Jericho',
      region: 'Ibadan',
      source: 'unified',
      matchedName: 'Femi Ogunleye',
    });
  });

  it('canonicalizes an unknown unified tower name against the static list', async () => {
    const unknownTower = [{ customerName: 'Acme Corp', btsName: 'JERICHO BTS' }];
    const result = await resolveCustomerBts('Acme Corp', mockEndpoints, unknownTower);
    expect(result).toEqual({
      btsName: 'Jericho',
      region: 'Ibadan',
      source: 'unified',
      matchedName: 'Acme Corp',
    });
  });

  it('falls back to the UISP endpoint scan when no unified match exists', async () => {
    const result = await resolveCustomerBts('Odua Telecoms Limited', mockEndpoints, mockCustomers);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('uisp');
    expect(result!.btsName).toBe('Sijuwola House Ibadan Core');
  });

  it('queries Customer rows (matched/manual) when not injected', async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue(mockCustomers as never);
    const result = await resolveCustomerBts('Wiseki Technologies Limited', mockEndpoints);
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: { matchState: { in: ['matched', 'manual'] }, btsName: { not: null }, deleted: false },
      select: { customerName: true, btsName: true },
    });
    expect(result).not.toBeNull();
    expect(result!.source).toBe('unified');
  });

  it('resolves via UISP endpoint tower when matched', async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([] as never);
    const result = await resolveCustomerBts('Wiseki Technologies Limited', mockEndpoints);
    // 'Honor ' tower is canonicalized to the static station 'Honor' (Ibadan).
    expect(result).toEqual({
      btsName: 'Honor',
      region: 'Ibadan',
      source: 'uisp',
      matchedName: 'Wiseki Technologies Limited',
    });
  });

  it('keeps unknown UISP tower names but still resolves', async () => {
    const result = await resolveCustomerBts('Odua Telecoms Limited', mockEndpoints, []);
    expect(result).toEqual({
      btsName: 'Sijuwola House Ibadan Core',
      region: '',
      source: 'uisp',
      matchedName: 'Odua Telecoms Limited',
    });
  });

  it('falls back to static list when UISP has no match', async () => {
    const result = await resolveCustomerBts('Obada Oko', mockEndpoints, []);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('static');
    expect(result!.region).toBe('Abeokuta');
  });

  it('falls back to static when matched endpoint has no tower', async () => {
    const result = await resolveCustomerBts('Obada Oko Customer Ltd', mockEndpoints, []);
    // Endpoint e5 matches by name but has no tower (root customer location);
    // static matching must kick in instead of a guess.
    expect(result).not.toBeNull();
    expect(result!.source).toBe('static');
    expect(result!.btsName).toBe('Obada Oko');
  });

  it('returns null for garbage with no UISP match', async () => {
    const result = await resolveCustomerBts('Zzz Unknown Nobody Corp', mockEndpoints, []);
    expect(result).toBeNull();
  });

  it('queries the DB when endpoints are not injected', async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue(mockEndpoints as never);
    const result = await resolveCustomerBts('Femi Ogunleye');
    expect(prisma.uispSite.findMany).toHaveBeenCalledWith({
      where: { type: 'endpoint' },
      select: { id: true, name: true, type: true, btsId: true, btsName: true },
    });
    expect(result).not.toBeNull();
    expect(result!.source).toBe('uisp');
  });
});

describe('regionForStationName', () => {
  it('maps canonical station names to regions', () => {
    expect(regionForStationName('Magboro')).toBe('Sagamu');
    expect(regionForStationName('Ewang')).toBe('Abeokuta');
    expect(regionForStationName('NotAStation')).toBeNull();
  });
});
