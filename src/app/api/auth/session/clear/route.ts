import { NextRequest, NextResponse } from 'next/server';
import { validateOrigin, forbidden } from '@/lib/api-response';

export async function POST(request: NextRequest) {
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
