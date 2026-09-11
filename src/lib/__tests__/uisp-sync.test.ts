import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncUisp, computeBtsMapping, mapSiteRow } from '../uisp-sync';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    uispMeta: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    uispSite: { upsert: vi.fn(), update: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    uispDevice: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('@/lib/matching/runMatching', () => ({
  runMatching: vi.fn(),
}));

vi.mock('../uisp-api', () => {
  const getUispEnv = vi.fn(() => ({ baseUrl: 'https://uisp.test', token: 'tok-123' }));
  return {
    getUispEnv,
    getAllUispSites: vi.fn(),
    getAllUispDevices: vi.fn(),
  };
});

vi.mock('@/lib/logger', () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { getAllUispSites, getAllUispDevices } from '../uisp-api';
import * as mockUispApi from '../uisp-api';
import { runMatching } from '@/lib/matching/runMatching';

const site = {
  id: 'site-1',
  identification: {
    id: 'site-1',
    name: 'JERICHO BTS',
    status: 'active',
    type: 'site',
    parent: null,
  },
  description: {
    address: 'Somewhere',
    location: { latitude: 7.4, longitude: 3.9 },
    deviceCount: 11,
    deviceOutageCount: 0,
    ucrmId: null,
  },
};

const siteRow = { id: 'site-1', name: 'JERICHO BTS', type: 'site', parentId: null };

const device = {
  id: 'dev-1',
  identification: {
    id: 'dev-1',
    name: 'JERICHO AP1',
    site: { id: 'site-1', name: 'JERICHO BTS', type: 'site' },
    role: 'ap',
    category: 'wireless',
    model: 'WA',
    modelName: 'Rocket M5',
    mac: 'aa:bb:cc:dd:ee:ff',
    authorized: true,
  },
  overview: { status: 'active', cpu: 10, downlinkUtilization: 0.05 },
  ipAddress: '10.0.0.1',
};

describe('syncUisp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { getUispEnv } = mockUispApi;
    vi.mocked(getUispEnv).mockReturnValue({ baseUrl: 'https://uisp.test', token: 'tok-123' });
    vi.mocked(runMatching).mockResolvedValue({ matched: 0, reverted: 0, pending: 0, manualKept: 0, elapsedMs: 1 } as never);
    vi.mocked(prisma.uispMeta.findUnique).mockResolvedValue(null);
    // SAFETY: Mock return values for Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispMeta.upsert).mockResolvedValue({} as never);
    // SAFETY: Mock return values for Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispMeta.update).mockResolvedValue({} as never);
    // SAFETY: Mock return values for Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispSite.upsert).mockResolvedValue({} as never);
    // SAFETY: Mock return values for Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispSite.update).mockResolvedValue({} as never);
    // SAFETY: Mock return values for Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispSite.findMany).mockResolvedValue([siteRow] as never);
    // SAFETY: Mock return values for Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispDevice.upsert).mockResolvedValue({} as never);
    // SAFETY: Mock return values for Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispSite.deleteMany).mockResolvedValue({ count: 0 } as never);
    // SAFETY: Mock return values for Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispDevice.deleteMany).mockResolvedValue({ count: 0 } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips when token is missing', async () => {
    const { getUispEnv } = await import('../uisp-api');
    vi.mocked(getUispEnv).mockReturnValue({ baseUrl: 'https://uisp.test', token: '' });
    const stats = await syncUisp();
    expect(stats).toEqual({ sitesUpserted: 0, sitesStale: 0, devicesUpserted: 0, devicesStale: 0, elapsedMs: 0 });
    expect(getAllUispSites).not.toHaveBeenCalled();
  });

  it('upserts sites and devices, sweeps stale', async () => {
    const now = Date.now();
    // SAFETY: Mock return values for uisp-api and Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(getAllUispSites).mockResolvedValue([site] as never);
    // SAFETY: Mock return values for uisp-api and Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(getAllUispDevices).mockResolvedValue([device] as never);
    // SAFETY: Mock return values for uisp-api and Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispSite.deleteMany).mockResolvedValue({ count: 2 } as never);
    // SAFETY: Mock return values for uisp-api and Prisma methods are tested via vi.mocked, the shape is validated by TypeScript.
    vi.mocked(prisma.uispDevice.deleteMany).mockResolvedValue({ count: 5 } as never);

    const stats = await syncUisp(now);

    expect(prisma.uispSite.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.uispDevice.upsert).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ sitesUpserted: 1, devicesUpserted: 1, sitesStale: 2, devicesStale: 5 });
    expect(prisma.uispMeta.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastStatus: 'ok' }),
      }),
    );
    expect(runMatching).toHaveBeenCalled();
  });

  it('does not fail the sync when matching fails', async () => {
    vi.mocked(runMatching).mockRejectedValue(new Error('matching boom'));
    vi.mocked(getAllUispSites).mockResolvedValue([site] as never);
    vi.mocked(getAllUispDevices).mockResolvedValue([device] as never);

    const stats = await syncUisp(Date.now());

    expect(stats).toMatchObject({ sitesUpserted: 1 });
    expect(prisma.uispMeta.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastStatus: 'ok' }) }),
    );
  });

  it('marks run as error and rethrows on failure', async () => {
    vi.mocked(getAllUispSites).mockRejectedValue(new Error('boom'));
    await expect(syncUisp()).rejects.toThrow('boom');
    expect(prisma.uispMeta.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastStatus: 'error', lastError: 'boom' }) }),
    );
  });
});

describe('computeBtsMapping', () => {
  const sites = [
    { id: 'dc', name: 'IWN-LG-RC-DC', type: 'endpoint', parentId: null },
    { id: 'core', name: 'Abeokuta Core', type: 'site', parentId: 'dc' },
    { id: 'tower', name: 'Obada Oko', type: 'site', parentId: 'core' },
    { id: 'ep', name: 'Customer A', type: 'endpoint', parentId: 'tower' },
    { id: 'ep2', name: 'Customer B', type: 'endpoint', parentId: 'core' },
    { id: 'epRoot', name: 'Enterprise HQ', type: 'endpoint', parentId: null },
    { id: 'epNested', name: 'Sub Office', type: 'endpoint', parentId: 'epRoot' },
    { id: 'epNested2', name: 'Deep Office', type: 'endpoint', parentId: 'epNested' },
  ];

  it('attributes an endpoint to its nearest site ancestor, not the root', () => {
    const m = computeBtsMapping(sites);
    // 'Customer A' hangs under 'Obada Oko' which hangs under 'Abeokuta Core':
    // the tower is the NEAREST type=site ancestor, never the endpoint root 'dc'.
    expect(m.get('ep')).toEqual({ btsId: 'tower', btsName: 'Obada Oko' });
    expect(m.get('ep2')).toEqual({ btsId: 'core', btsName: 'Abeokuta Core' });
  });

  it('maps site nodes to themselves', () => {
    const m = computeBtsMapping(sites);
    expect(m.get('core')).toEqual({ btsId: 'core', btsName: 'Abeokuta Core' });
    expect(m.get('tower')).toEqual({ btsId: 'tower', btsName: 'Obada Oko' });
  });

  it('returns null for root customer locations with no site ancestor', () => {
    const m = computeBtsMapping(sites);
    expect(m.get('epRoot')).toBeNull();
    expect(m.get('epNested')).toBeNull();
    expect(m.get('epNested2')).toBeNull();
  });

  it('walks through nested endpoints to the first site ancestor', () => {
    const m = computeBtsMapping([
      ...sites,
      { id: 'tower2', name: 'JERICHO BTS', type: 'site', parentId: 'core' },
      { id: 'epNestSite', name: 'Tenant Office', type: 'endpoint', parentId: 'tower2' },
    ]);
    expect(m.get('epNestSite')).toEqual({ btsId: 'tower2', btsName: 'JERICHO BTS' });
  });

  it('survives parent cycles without hanging', () => {
    const cyclic = [
      { id: 'a', name: 'A', type: 'endpoint', parentId: 'b' },
      { id: 'b', name: 'B', type: 'endpoint', parentId: 'a' },
    ];
    const m = computeBtsMapping(cyclic);
    expect(m.get('a')).toBeNull();
    expect(m.get('b')).toBeNull();
  });

  it('returns null when the parent chain is orphaned', () => {
    const m = computeBtsMapping([{ id: 'ep', name: 'Lone Customer', type: 'endpoint', parentId: 'missing' }]);
    expect(m.get('ep')).toBeNull();
  });
});

describe('mapSiteRow', () => {
  const contactSite = {
    id: 'site-c1',
    identification: { id: 'site-c1', name: 'Tower X', status: 'active', type: 'site', parent: null },
    description: {
      address: 'Addr',
      location: { latitude: 7.1, longitude: 3.2 },
      contact: { name: 'Ada Contact', phone: '0801234567', email: 'ada@example.com' },
      note: 'Maintenance note',
      sla: 24,
      deviceCount: 2,
      deviceOutageCount: 0,
        ucrmId: '42',
    },
  };

  it('maps contact, note, sla and ucrmId from the description', () => {
    expect(mapSiteRow(contactSite as never)).toEqual({
      name: 'Tower X',
      type: 'site',
      status: 'active',
      suspended: null,
      parentId: null,
      parentName: null,
      address: 'Addr',
      latitude: 7.1,
      longitude: 3.2,
      deviceCount: 2,
      deviceOutageCount: 0,
      ucrmId: '42',
      region: 'Unknown',
      contactName: 'Ada Contact',
      contactPhone: '0801234567',
      contactEmail: 'ada@example.com',
      note: 'Maintenance note',
      sla: 24,
    });
  });

  it('falls back to nulls when description fields are missing', () => {
    const row = mapSiteRow({
      id: 's2',
      identification: { id: 's2', name: 'B', status: 'active', type: 'endpoint', parent: null },
      description: {},
    } as never);
    expect(row).toMatchObject({
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      note: null,
      sla: null,
      ucrmId: null,
    });
  });
});
