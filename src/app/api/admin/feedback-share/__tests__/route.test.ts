import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSet = vi.fn();
const mockTokenRef = { path: 'feedback_tokens/token-123', set: mockSet };
const mockCollection = vi.fn((name: string) => {
  if (name === 'feedback_tokens') {
    return { doc: vi.fn(() => mockTokenRef) };
  }
  throw new Error(`Unexpected collection ${name}`);
});

vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => ({ collection: mockCollection }),
}));

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminToken: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  isRateLimited: vi.fn(() => false),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    feedbackToken: {
      create: vi.fn(async ({ data }: { data: { id: string } }) => ({ id: data.id })),
    },
  },
}));

import { POST } from '../route';
import { verifyAdminToken } from '@/lib/admin-auth';

const mockedVerifyAdminToken = vi.mocked(verifyAdminToken);

function buildRequest(body: unknown) {
  const headers = new Map<string, string>([
    ['x-forwarded-for', '127.0.0.1'],
    ['origin', 'http://localhost:9002'],
    ['authorization', 'Bearer test-token'],
  ]);
  return {
    json: () => Promise.resolve(body),
    method: 'POST',
    nextUrl: { protocol: 'http:', host: 'localhost:9002', searchParams: new URLSearchParams() },
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
  } as unknown as Request;
}

describe('POST /api/admin/feedback-share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedVerifyAdminToken.mockResolvedValue({ uid: 'uid-1', email: 'reformer.ejembi@iworldnetworks.net' });
  });

  it('rejects unauthenticated requests', async () => {
    mockedVerifyAdminToken.mockResolvedValue(null);
    const response = await POST(buildRequest({ customerName: 'A', customerEmail: 'a@b.com', subject: 'Support' }));
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(mockCollection).not.toHaveBeenCalledWith('feedback_tokens');
  });

  it('rejects an invalid subject', async () => {
    const response = await POST(buildRequest({ customerName: 'A', customerEmail: 'a@b.com', subject: 'Nope' }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.errors?.subject).toBeTruthy();
  });

  it('rejects invalid payloads', async () => {
    const response = await POST(buildRequest({ subject: 'Support' }));
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe('Validation failed.');
  });

  it('creates a token pinned to the subject and returns a direct share url', async () => {
    const response = await POST(
      buildRequest({
        customerName: 'Lukmon Obasa',
        customerEmail: 'l.obasa@iworldnetworks.net',
        location: 'Ibadan',
        serviceDate: '2026-08-01',
        subject: 'FieldSupport',
        staffName: 'Christian Adejo',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeTruthy();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Lukmon Obasa',
        category: 'FieldSupport',
        staffName: 'Christian Adejo',
      }),
    );
    expect(body.data.url).toContain(`/feedback?token=${body.data.token}&subject=FieldSupport`);
    expect(body.data.popupUrl).toContain(`/feedback/popup?token=${body.data.token}&subject=FieldSupport`);
  });
});
