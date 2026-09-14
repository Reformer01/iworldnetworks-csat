import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    paystackSavedView: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      create: mocks.create,
      update: mocks.update,
      delete: mocks.remove,
    },
  },
}));
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: mocks.verifyAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { GET, POST, PATCH, DELETE } from '../route';

const DORCAS = { email: 'dorcas.olayoole@iworldnetworks.net', uid: 'dorcas-1' };
const MANAGER = { email: 'stella.akinola@iworldnetworks.net', uid: 'mgr-1' };
const ORDINARY = { email: 'random.agent@iworldnetworks.net', uid: 'ord-1' };

function get(url: string, auth: string | null = 'Bearer tok') {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    method: 'GET',
  } as unknown as NextRequest;
}

function write(url: string, method: string, body?: unknown, auth: string | null = 'Bearer tok') {
  return {
    url,
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body,
    method,
  } as unknown as NextRequest;
}

const VALID_VIEW = {
  name: 'August card collections',
  scope: 'transactions',
  filters: { status: 'success' },
  mode: 'shared',
};

describe('paystack saved-views routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it('GET returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/saved-views', null));
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for ordinary admins', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(ORDINARY);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/saved-views'));
    expect(res.status).toBe(403);
  });

  it('GET returns 200 for Dorcas', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/saved-views'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
  });

  it('POST returns 403 for Dorcas on saved-view creation', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await POST(write('http://localhost:9002/api/admin/finance/paystack/saved-views', 'POST', VALID_VIEW));
    expect(res.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('POST lets a manager create a saved view', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.create.mockResolvedValueOnce({ id: 'view-1', ...VALID_VIEW, ownerEmail: MANAGER.email });
    const res = await POST(write('http://localhost:9002/api/admin/finance/paystack/saved-views', 'POST', VALID_VIEW));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: VALID_VIEW.name, scope: 'transactions', ownerEmail: MANAGER.email }),
    });
  });

  it('POST rejects names over 191 characters and bad scope/mode', async () => {
    mocks.verifyAdmin.mockResolvedValue(MANAGER);
    const longName = await POST(
      write('http://localhost:9002/api/admin/finance/paystack/saved-views', 'POST', { ...VALID_VIEW, name: 'x'.repeat(192) }),
    );
    expect(longName.status).toBe(400);

    const badScope = await POST(
      write('http://localhost:9002/api/admin/finance/paystack/saved-views', 'POST', { ...VALID_VIEW, scope: 'nope' }),
    );
    expect(badScope.status).toBe(400);

    const badMode = await POST(
      write('http://localhost:9002/api/admin/finance/paystack/saved-views', 'POST', { ...VALID_VIEW, mode: 'nope' }),
    );
    expect(badMode.status).toBe(400);
  });

  it('PATCH and DELETE require managers', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const patchRes = await PATCH(
      write('http://localhost:9002/api/admin/finance/paystack/saved-views', 'PATCH', { id: 'view-1', ...VALID_VIEW }),
    );
    expect(patchRes.status).toBe(403);

    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const deleteRes = await DELETE(get('http://localhost:9002/api/admin/finance/paystack/saved-views?id=view-1'));
    expect(deleteRes.status).toBe(403);
  });
});
