import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeName, tokensOf } from '../normalize';
import { matchScore, hasStrongSignal, AUTO_MATCH_THRESHOLD, CANDIDATE_THRESHOLD, endpointRegionKey, customerRegionKey } from '../score';
import { decideMatch, runMatching } from '../runMatching';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    uispSite: { findMany: vi.fn() },
    customer: { findMany: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';

describe('normalizeName', () => {
  it('strips titles', () => {
    expect(normalizeName('MR. RIDWAN ADEKUNLE')).toBe('ridwan adekunle');
    expect(normalizeName('Dr Mrs Funke Ojo')).toBe('funke ojo');
    expect(normalizeName('Engr. Alhaji Musa')).toBe('musa');
  });

  it('reverses "Last, First"', () => {
    expect(normalizeName('ADEKUNLE, RIDWAN')).toBe('ridwan adekunle');
    expect(normalizeName('Adekunle, Mr. Ridwan')).toBe('ridwan adekunle');
  });

  it('strips brackets and punctuation, collapses whitespace', () => {
    expect(normalizeName('OTA [Office Core]')).toBe('ota');
    expect(normalizeName('Adekunle, Ojo')).toBe('ojo adekunle'); // "Last, First" reversed
    expect(tokensOf("Adekunle's   Ojo")).toEqual(['adekunle', 'ojo']);
  });

  it('strips generic business words', () => {
    expect(normalizeName('Hayat Microfinance Bank')).toBe('hayat');
    expect(normalizeName('Wise FM')).toBe('wise');
  });

  it('handles empty and whitespace-only input', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName('   ')).toBe('');
  });
});

describe('tokensOf', () => {
  it('drops short, numeric and title tokens', () => {
    expect(tokensOf('Yakubu Abiola 2')).toEqual(['yakubu', 'abiola']);
    expect(tokensOf('Wise FM 87.9')).toEqual(['wise']);
    expect(tokensOf('Evang Ola')).toEqual(['ola']);
    expect(tokensOf('')).toEqual([]);
  });
});

describe('matchScore — known-difficult real-world pairs', () => {
  it('"RIDWAN ADEKUNLE, MR. ADISA" ↔ "Adisa Ridwan" auto-matches (≥0.85)', () => {
    const score = matchScore({ name: 'RIDWAN ADEKUNLE, MR. ADISA' }, { name: 'Adisa Ridwan' });
    expect(score).toBeGreaterThanOrEqual(AUTO_MATCH_THRESHOLD);
  });

  it('"Fgh Action Team" ↔ "FHG Action Team" auto-matches despite typo (≥0.85)', () => {
    const score = matchScore({ name: 'Fgh Action Team' }, { name: 'FHG Action Team' });
    expect(score).toBeGreaterThanOrEqual(AUTO_MATCH_THRESHOLD);
  });

  it('"Hayat Microfinance Bank" ↔ "Alekun Microfinance Bank" stays below candidate (<0.5)', () => {
    const score = matchScore({ name: 'Hayat Microfinance Bank' }, { name: 'Alekun Microfinance Bank' });
    expect(score).toBeLessThan(CANDIDATE_THRESHOLD);
  });

  it('"Yakubu Abiola 2" ↔ "Abiola Yakubu" auto-matches (≥0.85)', () => {
    const score = matchScore({ name: 'Yakubu Abiola 2' }, { name: 'Abiola Yakubu' });
    expect(score).toBeGreaterThanOrEqual(AUTO_MATCH_THRESHOLD);
  });

  it('"Wise FM" ↔ "Wise FM 87.9" is at least a candidate (≥0.5)', () => {
    const score = matchScore({ name: 'Wise FM' }, { name: 'Wise FM 87.9' });
    expect(score).toBeGreaterThanOrEqual(CANDIDATE_THRESHOLD);
  });
});

describe('matchScore — bonuses and cap', () => {
  it('adds +0.05 when customer city and endpoint tower region agree', () => {
    const base = matchScore({ name: 'Adisa' }, { name: 'Adisa House' });
    const withCity = matchScore({ name: 'Adisa', city: 'Ibadan' }, { name: 'Adisa House', btsName: 'Sijuwola House' });
    expect(base).toBe(0.5);
    expect(withCity).toBeCloseTo(base + 0.05);
    expect(endpointRegionKey('Sijuwola House')).toBe('Ibadan');
  });

  it('adds +0.1 when phone numbers match (different formats)', () => {
    const base = matchScore({ name: 'Adisa' }, { name: 'Adisa House' });
    const withPhone = matchScore({ name: 'Adisa', phone: '08012345678' }, { name: 'Adisa House', phone: '+234 801 234 5678' });
    expect(withPhone).toBeCloseTo(base + 0.1);
  });

  it('adds +0.1 when emails match', () => {
    const base = matchScore({ name: 'Adisa' }, { name: 'Adisa House' });
    const withEmail = matchScore({ name: 'Adisa', email: 'Adisa@Example.com' }, { name: 'Adisa House', email: 'adisa@example.com' });
    expect(withEmail).toBeCloseTo(base + 0.1);
  });

  it('caps at 1.0', () => {
    const score = matchScore(
      { name: 'Adisa', city: 'Ibadan', phone: '08012345678', email: 'adisa@example.com' },
      { name: 'Adisa', btsName: 'Sijuwola House', phone: '2348012345678', email: 'adisa@example.com' },
    );
    expect(score).toBe(1);
  });

  it('treats null contact fields as no bonus', () => {
    expect(matchScore({ name: 'Adisa', phone: null, email: null }, { name: 'Adisa House', phone: null, email: null })).toBe(0.5);
  });

  it('scores unrelated names 0', () => {
    expect(matchScore({ name: 'Zzz Unknown Nobody' }, { name: 'Alpha Beta Gamma' })).toBe(0);
  });

  it('does not give Lagos/Mowe customers a region bonus toward Ibadan towers', () => {
    expect(customerRegionKey('Lagos')).toBe('Lagos');
    expect(customerRegionKey('Mowe')).toBe('Lagos');
    expect(customerRegionKey('Ibadan')).toBe('Ibadan');
    const lagosScore = matchScore({ name: 'RIDWAN ADEKUNLE', city: 'Lagos' }, { name: 'ADEKUNLE', btsName: 'Sijuwola House' });
    expect(lagosScore).toBeLessThan(AUTO_MATCH_THRESHOLD);
  });
});

describe('hasStrongSignal', () => {
  it('requires ≥2 endpoint tokens or phone/email agreement', () => {
    expect(hasStrongSignal({ name: 'RIDWAN ADEKUNLE' }, { name: 'ADEKUNLE' })).toBe(false);
    expect(hasStrongSignal({ name: 'RIDWAN ADEKUNLE' }, { name: 'ADEKUNLE ADISA' })).toBe(true);
    expect(hasStrongSignal({ name: 'RIDWAN ADEKUNLE', phone: '08012345678' }, { name: 'ADEKUNLE', phone: '+234 801 234 5678' })).toBe(true);
    expect(hasStrongSignal({ name: 'RIDWAN ADEKUNLE', email: 'a@b.com' }, { name: 'ADEKUNLE', email: 'A@B.com' })).toBe(true);
  });
});

describe('decideMatch (pure policy)', () => {
  it('never overwrites manual mappings', () => {
    expect(decideMatch(0.95, 'manual')).toBe('keepManual');
    expect(decideMatch(0.1, 'manual')).toBe('keepManual');
    expect(decideMatch(null, 'manual')).toBe('keepManual');
  });

  it('auto-matches pending customers at ≥0.85', () => {
    expect(decideMatch(AUTO_MATCH_THRESHOLD, 'pending')).toBe('match');
  });

  it('keeps pending customers in the candidate band', () => {
    expect(decideMatch(0.6, 'pending')).toBe('keepPending');
    expect(decideMatch(0.2, 'pending')).toBe('keepPending');
    expect(decideMatch(null, 'pending')).toBe('keepPending');
  });

  it('revalidates auto matches: keeps ≥0.5, reverts below', () => {
    expect(decideMatch(0.6, 'matched')).toBe('keep');
    expect(decideMatch(0.49, 'matched')).toBe('revert');
    expect(decideMatch(null, 'matched')).toBe('revert');
  });
});

describe('runMatching', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.mocked(prisma.uispSite.findMany).mockReset();
    vi.mocked(prisma.customer.findMany).mockReset();
    vi.mocked(prisma.customer.update).mockReset();
    vi.mocked(prisma.customer.update).mockResolvedValue({ id: 'c1' } as never);
  });

  const endpoints = [
    { id: 'e1', name: 'Adisa Ridwan', btsName: 'Sijuwola House', btsId: 't1', status: 'active', deviceOutageCount: 0 },
    { id: 'e2', name: 'Zzz Nothing Here', btsName: 'Sagamu GRA', btsId: 't2', status: 'active', deviceOutageCount: 2 },
  ];

  const baseCustomer = {
    id: 'c1',
    customerName: 'RIDWAN ADEKUNLE, MR. ADISA',
    city: null,
    phone: null,
    email: null,
    matchState: 'pending',
    matchedAt: null,
    uispEndpointId: null,
    uispDeviceStatus: null,
    uispOutageCount: null,
    matchScore: null,
  };

  it('leaves a manual customer untouched despite a high-score endpoint', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue(endpoints as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      { ...baseCustomer, matchState: 'manual', matchMethod: 'manual', matchScore: 0.9, uispEndpointId: 'e1' },
    ] as never);

    const stats = await runMatching(NOW);

    expect(prisma.customer.update).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ matched: 0, reverted: 0, pending: 0, manualKept: 1 });
  });

  it('reverts a manual customer whose mapped endpoint disappeared', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue(endpoints as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      { ...baseCustomer, matchState: 'manual', matchMethod: 'manual', matchScore: 0.9, uispEndpointId: 'gone' },
    ] as never);

    const stats = await runMatching(NOW);

    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchState: 'pending' }) }),
    );
    expect(stats.reverted).toBe(1);
  });

  it('auto-matches a pending customer with full endpoint fields', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue(endpoints as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([baseCustomer] as never);

    const stats = await runMatching(NOW);

    expect(stats.matched).toBe(1);
    const data = vi.mocked(prisma.customer.update).mock.calls[0][0].data;
    expect(data).toMatchObject({
      matchState: 'matched',
      matchMethod: 'auto',
      btsId: 't1',
      btsName: 'Sijuwola House',
      uispEndpointId: 'e1',
      uispEndpointName: 'Adisa Ridwan',
      uispDeviceStatus: 'active',
      uispOutageCount: 0,
    });
    expect(data.matchScore).toBeGreaterThanOrEqual(AUTO_MATCH_THRESHOLD);
    expect(data.matchedAt).toBe(BigInt(NOW));
  });

  it('keeps an auto match when the endpoint still scores well (no drift → no write)', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue(endpoints as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        ...baseCustomer,
        matchState: 'matched',
        matchMethod: 'auto',
        matchScore: 0.8888888888888888,
        uispEndpointId: 'e1',
        uispDeviceStatus: 'active',
        uispOutageCount: 0,
        btsId: 't1',
        btsName: 'Sijuwola House',
        matchedAt: BigInt(1),
      },
    ] as never);

    const stats = await runMatching(NOW);

    expect(prisma.customer.update).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ matched: 0, reverted: 0, pending: 0, manualKept: 0 });
  });

  it('refreshes live fields when the auto match endpoint status drifts', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue([
      { id: 'e1', name: 'Adisa Ridwan', btsName: 'Sijuwola House', status: 'down', deviceOutageCount: 3 },
    ] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        ...baseCustomer,
        matchState: 'matched',
        matchMethod: 'auto',
        matchScore: 1,
        uispEndpointId: 'e1',
        uispDeviceStatus: 'active',
        uispOutageCount: 0,
        matchedAt: BigInt(1),
      },
    ] as never);

    const stats = await runMatching(NOW);

    expect(stats).toMatchObject({ matched: 0, reverted: 0, pending: 0, manualKept: 0 });
    expect(vi.mocked(prisma.customer.update).mock.calls[0][0].data).toMatchObject({
      uispDeviceStatus: 'down',
      uispOutageCount: 3,
    });
  });

  it('refreshes tower attribution when the endpoint tower is renamed (no fossilized btsName)', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue([
      { id: 'e1', name: 'Adisa Ridwan', btsId: 't1', btsName: 'Sijuwola House New', status: 'active', deviceOutageCount: 0 },
    ] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        ...baseCustomer,
        matchState: 'matched',
        matchMethod: 'auto',
        matchScore: 1,
        uispEndpointId: 'e1',
        uispDeviceStatus: 'active',
        uispOutageCount: 0,
        btsId: 't1',
        btsName: 'Sijuwola House',
        matchedAt: BigInt(1),
      },
    ] as never);

    await runMatching(NOW);

    expect(vi.mocked(prisma.customer.update).mock.calls[0][0].data).toMatchObject({
      btsId: 't1',
      btsName: 'Sijuwola House New',
    });
  });

  it('reverts an auto match when the score drops below 0.5', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue(endpoints as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        ...baseCustomer,
        matchState: 'matched',
        matchMethod: 'auto',
        matchScore: 1,
        uispEndpointId: 'e2',
        uispDeviceStatus: 'active',
        uispOutageCount: 2,
        matchedAt: BigInt(1),
      },
    ] as never);

    const stats = await runMatching(NOW);

    expect(stats.reverted).toBe(1);
    expect(vi.mocked(prisma.customer.update).mock.calls[0][0].data).toMatchObject({
      matchState: 'pending',
      matchMethod: null,
      matchScore: null,
      uispEndpointId: null,
    });
  });

  it('reverts an auto match when its endpoint no longer exists', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue([{ ...endpoints[1] }] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        ...baseCustomer,
        matchState: 'matched',
        matchMethod: 'auto',
        matchScore: 1,
        uispEndpointId: 'e1',
        uispDeviceStatus: 'active',
        uispOutageCount: 0,
        matchedAt: BigInt(1),
      },
    ] as never);

    const stats = await runMatching(NOW);

    expect(stats.reverted).toBe(1);
    expect(vi.mocked(prisma.customer.update).mock.calls[0][0].data.matchState).toBe('pending');
  });

  it('counts pending customers that stay pending', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue(endpoints as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ ...baseCustomer, customerName: 'Zzz Unknown Nobody' }] as never);

    const stats = await runMatching(NOW);

    expect(prisma.customer.update).not.toHaveBeenCalled();
    expect(stats.pending).toBe(1);
  });

  it('auto-matches a region-agreeing single-token endpoint', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue([
      { id: 'e1', name: 'ADEKUNLE', btsName: 'Sijuwola House', btsId: 't1', status: 'active', deviceOutageCount: 0 },
    ] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([{ ...baseCustomer, customerName: 'RIDWAN ADEKUNLE', city: 'Ibadan' }] as never);

    const stats = await runMatching(NOW);

    expect(stats.matched).toBe(1);
    expect(prisma.customer.update).toHaveBeenCalled();
  });

  it('keeps a previously auto-matched region-agreeing single-token pair', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue([
      { id: 'e1', name: 'ADEKUNLE', btsName: 'Sijuwola House', btsId: 't1', status: 'active', deviceOutageCount: 0 },
    ] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        ...baseCustomer,
        customerName: 'RIDWAN ADEKUNLE',
        city: 'Ibadan',
        matchState: 'matched',
        matchMethod: 'auto',
        matchScore: 0.85,
        uispEndpointId: 'e1',
        uispDeviceStatus: 'active',
        uispOutageCount: 0,
        matchedAt: BigInt(1),
      },
    ] as never);

    const stats = await runMatching(NOW);

    expect(stats.reverted).toBe(0);
    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ matchScore: expect.any(Number) }) }),
    );
  });

  it('auto-matches a single-token endpoint when the endpoint phone agrees', async () => {
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue([
      {
        id: 'e1',
        name: 'ADEKUNLE',
        btsName: 'Sijuwola House',
        btsId: 't1',
        status: 'active',
        deviceOutageCount: 0,
        contactPhone: '+234 801 234 5678',
        contactEmail: null,
      },
    ] as never);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        ...baseCustomer,
        customerName: 'RIDWAN ADEKUNLE',
        city: 'Ibadan',
        phone: '+234 801 234 5678',
      },
    ] as never);

    const stats = await runMatching(NOW);

    expect(stats.matched).toBe(1);
    expect(vi.mocked(prisma.customer.update).mock.calls[0][0].data).toMatchObject({
      matchState: 'matched',
      uispEndpointId: 'e1',
    });
  });
});
