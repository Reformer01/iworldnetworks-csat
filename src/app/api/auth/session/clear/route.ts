import { NextRequest, NextResponse } from 'next/server';
import { validateOrigin, forbidden } from '@/lib/api-response';
import { isRateLimited } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  if (isRateLimited(request, 20, 60 * 1000)) {
    return NextResponse.json({ success: false, error: 'Too many requests.', code: 'RATE_LIMITED' }, { status: 429 });
  }
  if (!validateOrigin(request)) return forbidden();

  const response = NextResponse.json({ success: true });
  response.cookies.set('__session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    maxAge: 0,
  });
  return response;
}
