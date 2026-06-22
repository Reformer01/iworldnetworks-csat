import { NextRequest, NextResponse } from 'next/server';

export type ApiResponse<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
  errors?: Record<string, string[]>;
  code?: string;
};

export function success<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data } satisfies ApiResponse<T>, { status });
}

export function error(message: string, status = 400, opts?: { errors?: Record<string, string[]>; code?: string }) {
  return NextResponse.json({
    success: false,
    error: message,
    ...(opts?.errors ? { errors: opts.errors } : {}),
    ...(opts?.code ? { code: opts.code } : {}),
  } satisfies ApiResponse<never>, { status });
}

export function unauthorized(message = 'Unauthorized.') {
  return error(message, 401, { code: 'UNAUTHORIZED' });
}

export function forbidden(message = 'Forbidden.') {
  return error(message, 403, { code: 'FORBIDDEN' });
}

export function tooMany(message = 'Too many requests.') {
  return error(message, 429, { code: 'RATE_LIMITED' });
}

export function notFound(message = 'Resource not found.') {
  return error(message, 404, { code: 'NOT_FOUND' });
}

export function serverError(message = 'Internal server error.') {
  return error(message, 500, { code: 'SERVER_ERROR' });
}

const ALLOWED_ORIGINS = [
  'http://localhost:9002',
  'http://localhost:3000',
  'https://iworldnetworks-csat.web.app',
  'https://iworldnetworks-csat.firebaseapp.com',
];

export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  const source = origin || (referer ? new URL(referer).origin : null);
  if (!source) return false;

  if (ALLOWED_ORIGINS.includes(source)) return true;

  if (host) {
    const expectedOrigin = `https://${host}`;
    if (source === expectedOrigin) return true;
    const expectedOriginHttp = `http://${host}`;
    if (source === expectedOriginHttp) return true;
  }

  return false;
}
