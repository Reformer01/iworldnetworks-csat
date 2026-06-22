import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(),
    })),
  },
  NextRequest: vi.fn(function mockRequest(url: string, init?: RequestInit) {
    return {
      url,
      headers: new Map(Object.entries(init?.headers || {})),
    };
  }),
}));

import { success, error, unauthorized, forbidden, tooMany, notFound, serverError, validateOrigin } from '../api-response';

describe('success', () => {
  it('wraps data in standard envelope', () => {
    const res = success({ id: 'abc', name: 'test' });
    expect(res.body).toEqual({ success: true, data: { id: 'abc', name: 'test' } });
    expect(res.status).toBe(200);
  });

  it('accepts custom status code', () => {
    const res = success({ id: 'abc' }, 201);
    expect(res.status).toBe(201);
  });

  it('works with array data', () => {
    const res = success([1, 2, 3]);
    expect(res.body).toEqual({ success: true, data: [1, 2, 3] });
  });

  it('works with null data', () => {
    const res = success(null);
    expect(res.body).toEqual({ success: true, data: null });
  });

  it('works with string data', () => {
    const res = success('ok');
    expect(res.body).toEqual({ success: true, data: 'ok' });
  });
});

describe('error', () => {
  it('returns error envelope with default 400', () => {
    const res = error('Bad request');
    expect(res.body).toEqual({ success: false, error: 'Bad request' });
    expect(res.status).toBe(400);
  });

  it('accepts custom status code', () => {
    const res = error('Not found', 404);
    expect(res.status).toBe(404);
  });

  it('includes field errors when provided', () => {
    const res = error('Validation failed', 400, {
      errors: { name: ['Name is required'] },
    });
    expect(res.body.errors).toEqual({ name: ['Name is required'] });
  });

  it('includes code when provided', () => {
    const res = error('Unauthorized', 401, { code: 'UNAUTHORIZED' });
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});

describe('unauthorized', () => {
  it('returns 401 with UNAUTHORIZED code', () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.error).toBe('Unauthorized.');
  });

  it('accepts custom message', () => {
    const res = unauthorized('Access denied');
    expect(res.body.error).toBe('Access denied');
  });
});

describe('tooMany', () => {
  it('returns 429 with RATE_LIMITED code', () => {
    const res = tooMany();
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.body.error).toBe('Too many requests.');
  });
});

describe('notFound', () => {
  it('returns 404 with NOT_FOUND code', () => {
    const res = notFound();
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.error).toBe('Resource not found.');
  });
});

describe('serverError', () => {
  it('returns 500 with SERVER_ERROR code', () => {
    const res = serverError();
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('SERVER_ERROR');
    expect(res.body.error).toBe('Internal server error.');
  });
});

describe('forbidden', () => {
  it('returns 403 with FORBIDDEN code', () => {
    const res = forbidden();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.error).toBe('Forbidden.');
  });

  it('accepts custom message', () => {
    const res = forbidden('Blocked.');
    expect(res.body.error).toBe('Blocked.');
  });
});

describe('validateOrigin', () => {
  function mockRequest(headers: Record<string, string>) {
    return {
      headers: new Map(Object.entries(headers)),
    } as unknown as Request;
  }

  it('allows matching origin from allowlist', () => {
    const req = mockRequest({ origin: 'http://localhost:9002', host: 'localhost:9002' });
    expect(validateOrigin(req)).toBe(true);
  });

  it('allows Firebase hosting origin', () => {
    const req = mockRequest({ origin: 'https://iworldnetworks-csat.web.app', host: 'iworldnetworks-csat.web.app' });
    expect(validateOrigin(req)).toBe(true);
  });

  it('allows matching host origin', () => {
    const req = mockRequest({ origin: 'https://custom-domain.com', host: 'custom-domain.com' });
    expect(validateOrigin(req)).toBe(true);
  });

  it('blocks mismatched origin', () => {
    const req = mockRequest({ origin: 'https://evil-site.com', host: 'myapp.com' });
    expect(validateOrigin(req)).toBe(false);
  });

  it('falls back to referer when origin is missing', () => {
    const req = mockRequest({ referer: 'http://localhost:9002/admin/dashboard', host: 'localhost:9002' });
    expect(validateOrigin(req)).toBe(true);
  });

  it('blocks when no origin or referer present', () => {
    const req = mockRequest({ host: 'myapp.com' });
    expect(validateOrigin(req)).toBe(false);
  });

  it('blocks request with no headers at all', () => {
    const req = mockRequest({});
    expect(validateOrigin(req)).toBe(false);
  });
});

describe('ApiResponse type', () => {
  it('success response has correct shape', () => {
    const res = success({ foo: 1 });
    const body = res.body;
    if (body.success) {
      expect(body.data).toEqual({ foo: 1 });
    } else {
      expect.unreachable('should be success');
    }
  });

  it('error response has correct shape', () => {
    const res = error('fail');
    const body = res.body;
    if (!body.success) {
      expect(body.error).toBe('fail');
    } else {
      expect.unreachable('should be error');
    }
  });
});
