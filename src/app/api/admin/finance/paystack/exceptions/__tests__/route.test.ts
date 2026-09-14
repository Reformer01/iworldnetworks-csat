import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { reconciliationException: { findMany: mocks.findMany, findUnique: mocks.findUnique, update: mocks.update } },
}));
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: mocks.verifyAdmin }));
vi.mock('@/lib/rate-limit', () => ({ isRateLimited: () => false }));
vi.mock('@/lib/api-response', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-response')>()),
  validateOrigin: () => true,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logInfo: vi.fn() }));

import { GET, POST } from '../route';

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

function post(body: unknown, auth: string | null = 'Bearer tok') {
  return {
    url: 'http://localhost:9002/api/admin/finance/paystack/exceptions',
    headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body,
    method: 'POST',
  } as unknown as NextRequest;
}

const ASSIGNMENT = {
  exceptionId: 'exc_123',
  ownerEmail: 'billing.owner@iworldnetworks.net',
  followUpAt: '2026-09-20',
  note: 'Called customer; awaiting receipt.',
};

describe('paystack exceptions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it('GET returns 401 for missing auth', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(null);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/exceptions', null));
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for ordinary admins', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(ORDINARY);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/exceptions'));
    expect(res.status).toBe(403);
  });

  it('GET returns 200 for Dorcas', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await GET(get('http://localhost:9002/api/admin/finance/paystack/exceptions'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
  });

  it('POST returns 403 for Dorcas on exception assignment', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(DORCAS);
    const res = await POST(post(ASSIGNMENT));
    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('POST lets a manager assign and appends { by, at, text } to history', async () => {
    mocks.verifyAdmin.mockResolvedValueOnce(MANAGER);
    mocks.findUnique.mockResolvedValueOnce({ id: 'exc_123', history: [] });
    mocks.update.mockResolvedValueOnce({ id: 'exc_123', ownerEmail: ASSIGNMENT.ownerEmail });
    const res = await POST(post(ASSIGNMENT));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'exc_123' },
      data: expect.objectContaining({ ownerEmail: ASSIGNMENT.ownerEmail }),
    });
    const history = mocks.update.mock.calls[0][0].data.history as { by: string; at: string; text: string }[];
    expect(history).toHaveLength(1);
    expect(history[0].by).toBe(MANAGER.email);
    expect(typeof history[0].at).toBe('string');
    expect(history[0].text).toBe(ASSIGNMENT.note);
  });
});
