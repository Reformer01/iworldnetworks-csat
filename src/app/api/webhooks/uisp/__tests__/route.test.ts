import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  eventUpsert: vi.fn(),
  eventUpdate: vi.fn(),
  siteUpsert: vi.fn().mockResolvedValue({}),
  siteDelete: vi.fn().mockResolvedValue({}),
  recomputeBtsForNode: vi.fn().mockResolvedValue(1),
  runMatching: vi.fn().mockResolvedValue({ matched: 0, reverted: 0, pending: 0, manualKept: 0, elapsedMs: 1 }),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    uispWebhookEvent: { upsert: mocks.eventUpsert, update: mocks.eventUpdate },
    uispSite: { upsert: mocks.siteUpsert, delete: mocks.siteDelete },
  },
}));

// Keep the real (pure) mapSiteRow; stub only the DB-touching recompute.
vi.mock('@/lib/uisp-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/uisp-sync')>();
  return { ...actual, recomputeBtsForNode: mocks.recomputeBtsForNode };
});

vi.mock('@/lib/matching/runMatching', () => ({
  runMatching: mocks.runMatching,
}));

vi.mock('@/lib/logger', () => ({
  logInfo: mocks.logInfo,
  logError: mocks.logError,
  logWarn: vi.fn(),
}));

import { POST } from '../route';

const secret = 'test-uisp-webhook-secret';

const sitePayload = {
  identification: { id: 'site-1', name: 'JERICHO BTS', status: 'active', type: 'site', parent: null },
  description: {
    address: 'Somewhere',
    location: { latitude: 7.4, longitude: 3.9 },
    contact: { name: 'Ada Contact', phone: '0801234567', email: 'ada@example.com' },
    note: 'Site maintenance note',
    sla: 24,
    deviceCount: 11,
    deviceOutageCount: 0,
    ucrmId: '42',
  },
};

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
  const lowerHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    json: () => Promise.resolve(body),
    headers: {
      get: (name: string) => lowerHeaders.get(name.toLowerCase()) ?? null,
    },
  } as unknown as NextRequest;
}

describe('POST /api/webhooks/uisp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('UISP_WEBHOOK_SECRET', secret);
    mocks.eventUpsert.mockResolvedValue({ processedAt: null });
    mocks.eventUpdate.mockResolvedValue({});
    mocks.siteUpsert.mockResolvedValue({});
    mocks.siteDelete.mockResolvedValue({});
    mocks.recomputeBtsForNode.mockResolvedValue(1);
    mocks.runMatching.mockResolvedValue({ matched: 0, reverted: 0, pending: 0, manualKept: 0, elapsedMs: 1 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects with 503 when no secret is configured', async () => {
    vi.stubEnv('UISP_WEBHOOK_SECRET', '');
    const response = await POST(
      buildRequest({ event: { id: 'evt-1', type: 'site/update' } }, { 'x-auth-token': secret }),
    );
    const json = await response.json();
    expect(response.status).toBe(503);
    expect(json.error).toBe('Not configured');
    expect(mocks.eventUpsert).not.toHaveBeenCalled();
  });

  it('rejects with 401 on a wrong or missing token', async () => {
    const body = { event: { id: 'evt-1', type: 'site/update' } };
    for (const headers of [
      { 'x-auth-token': 'wrong-secret' },
      { authorization: 'Bearer wrong-secret' },
      {},
    ]) {
      const response = await POST(buildRequest(body, headers));
      const json = await response.json();
      expect(response.status).toBe(401);
      expect(json.error).toBe('Unauthorized');
    }
    expect(mocks.eventUpsert).not.toHaveBeenCalled();
  });

  it('accepts x-auth-token, upserts the site with contact fields, recomputes and rematches', async () => {
    mocks.eventUpsert.mockResolvedValue({ processedAt: null });
    const body = {
      event: { id: 'evt-1', type: 'site/update', data: { ...sitePayload } },
    };

    const response = await POST(buildRequest(body, { 'x-auth-token': secret }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ status: 'processed' });
    expect(mocks.eventUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1' },
        create: expect.objectContaining({ id: 'evt-1', eventType: 'site/update', processedAt: null }),
      }),
    );
    expect(mocks.siteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'site-1' },
        update: expect.objectContaining({
          contactName: 'Ada Contact',
          contactPhone: '0801234567',
          contactEmail: 'ada@example.com',
          note: 'Site maintenance note',
          sla: 24,
          ucrmId: '42',
          lastSyncAt: expect.any(BigInt),
        }),
      }),
    );
    expect(mocks.recomputeBtsForNode).toHaveBeenCalledWith('site-1');
    expect(mocks.eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-1' },
        data: expect.objectContaining({ processedAt: expect.any(BigInt), error: null }),
      }),
    );
    expect(mocks.runMatching).toHaveBeenCalled();
  });

  it('accepts a Bearer token as an alternative to x-auth-token', async () => {
    mocks.eventUpsert.mockResolvedValue({ processedAt: null });
    const body = { id: 'evt-2', type: 'site/update', data: { ...sitePayload } };

    const response = await POST(buildRequest(body, { authorization: `Bearer ${secret}` }));
    expect(response.status).toBe(200);
    expect(mocks.eventUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'evt-2' } }));
  });

  it('does not reprocess a duplicate event id', async () => {
    mocks.eventUpsert.mockResolvedValue({ processedAt: 123456789n });
    const body = {
      event: { id: 'evt-dup', type: 'site/update', data: { ...sitePayload } },
    };

    const response = await POST(buildRequest(body, { 'x-auth-token': secret }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ status: 'duplicate' });
    expect(mocks.siteUpsert).not.toHaveBeenCalled();
    expect(mocks.recomputeBtsForNode).not.toHaveBeenCalled();
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
    expect(mocks.runMatching).not.toHaveBeenCalled();
  });

  it('rejects a payload without an event id with 400', async () => {
    const response = await POST(buildRequest({ event: { type: 'site/update' } }, { 'x-auth-token': secret }));
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.error).toBe('Missing event id');
  });

  it('deletes the row on a site/delete event and recomputes descendants', async () => {
    mocks.eventUpsert.mockResolvedValue({ processedAt: null });
    const body = {
      event: { id: 'evt-del', type: 'site/delete', data: { ...sitePayload, identification: { ...sitePayload.identification, id: 'site-gone' } } },
    };

    const response = await POST(buildRequest(body, { 'x-auth-token': secret }));
    expect(response.status).toBe(200);

    expect(mocks.siteDelete).toHaveBeenCalledWith({ where: { id: 'site-gone' } });
    expect(mocks.siteUpsert).not.toHaveBeenCalled();
    expect(mocks.recomputeBtsForNode).toHaveBeenCalledWith('site-gone');
  });

  it('marks an event processed when the payload has no site object', async () => {
    mocks.eventUpsert.mockResolvedValue({ processedAt: null });
    const body = { event: { id: 'evt-device', type: 'device/update', data: { deviceId: 'dev-1' } } };

    const response = await POST(buildRequest(body, { 'x-auth-token': secret }));
    expect(response.status).toBe(200);

    expect(mocks.siteUpsert).not.toHaveBeenCalled();
    expect(mocks.recomputeBtsForNode).not.toHaveBeenCalled();
    expect(mocks.eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ error: null }) }),
    );
  });

  it('stores the error and keeps processedAt null when processing fails, still responding 200', async () => {
    mocks.eventUpsert.mockResolvedValue({ processedAt: null });
    mocks.siteUpsert.mockRejectedValue(new Error('db boom'));
    const body = {
      event: { id: 'evt-fail', type: 'site/update', data: { ...sitePayload } },
    };

    const response = await POST(buildRequest(body, { 'x-auth-token': secret }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ status: 'error', error: 'db boom' });
    expect(mocks.eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt-fail' },
        data: expect.objectContaining({ processedAt: null, error: 'db boom' }),
      }),
    );
  });
});