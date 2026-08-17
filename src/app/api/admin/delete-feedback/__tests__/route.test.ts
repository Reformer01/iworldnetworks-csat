import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDocRef = { path: 'feedbacks/fb-1' };
const mockCollection = vi.fn((name: string) => {
  if (name === 'feedbacks') {
    return { doc: vi.fn(() => mockDocRef) };
  }
  throw new Error(`Unexpected collection ${name}`);
});

vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => ({ collection: mockCollection }),
}));

vi.mock('@/lib/admin-auth', () => ({
  verifySuperAdminToken: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  isRateLimited: vi.fn(() => false),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    feedback: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'fb-1' ? { id: 'fb-1', customerName: 'A' } : null)),
      delete: vi.fn(async () => ({ id: 'fb-1' })),
    },
  },
}));

import { POST } from '../route';
import { verifySuperAdminToken } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';

const mockedVerifySuperAdminToken = vi.mocked(verifySuperAdminToken);
const mockedFindUnique = vi.mocked(prisma.feedback.findUnique);
const mockedDelete = vi.mocked(prisma.feedback.delete);

function buildRequest(body: unknown) {
  const headers = new Map<string, string>([
    ['x-forwarded-for', '127.0.0.1'],
    ['origin', 'http://localhost:9002'],
    ['authorization', 'Bearer test-token'],
  ]);
  return {
    json: () => Promise.resolve(body),
    method: 'POST',
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
  } as unknown as Request;
}

describe('POST /api/admin/delete-feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedVerifySuperAdminToken.mockResolvedValue({ uid: 'uid-1', email: 'reformer.ejembi@iworldnetworks.net' });
    mockDocRef.get = vi.fn().mockResolvedValue({ exists: true, data: () => ({ customerName: 'A' }) });
    mockDocRef.delete = vi.fn().mockResolvedValue(undefined);
  });

  it('rejects unauthenticated requests', async () => {
    mockedVerifySuperAdminToken.mockResolvedValue(null);
    const response = await POST(buildRequest({ feedbackId: 'fb-1' }));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(mockDocRef.delete).not.toHaveBeenCalled();
  });

  it('rejects editors/viewers (non-super-admin) with 401', async () => {
    mockedVerifySuperAdminToken.mockResolvedValue(null);
    const response = await POST(buildRequest({ feedbackId: 'fb-1' }));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized Administrative Access.');
    expect(mockDocRef.delete).not.toHaveBeenCalled();
  });

  it('deletes the feedback record for a super admin', async () => {
    const response = await POST(buildRequest({ feedbackId: 'fb-1' }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockedFindUnique).toHaveBeenCalledWith({ where: { id: 'fb-1' } });
    expect(mockedDelete).toHaveBeenCalledWith({ where: { id: 'fb-1' } });
    expect(mockDocRef.delete).toHaveBeenCalled();
  });

  it('returns 404 when the record does not exist', async () => {
    mockedFindUnique.mockResolvedValueOnce(null);
    const response = await POST(buildRequest({ feedbackId: 'fb-1' }));
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toBe('Feedback record not found.');
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(mockDocRef.delete).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads', async () => {
    const response = await POST(buildRequest({}));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe('Validation failed.');
  });
});
