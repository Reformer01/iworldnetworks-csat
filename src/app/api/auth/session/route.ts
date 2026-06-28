import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';
import { logError } from '@/lib/logger';
import { z } from 'zod';
import { validateOrigin, forbidden } from '@/lib/api-response';
import { isRateLimited } from '@/lib/rate-limit';

const sessionSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
});

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 20, 60 * 1000)) {
      return NextResponse.json({ success: false, error: 'Too many requests.', code: 'RATE_LIMITED' }, { status: 429 });
    }
    if (!validateOrigin(request)) return forbidden();

    const body = await request.json().catch(() => null);
    const parsed = sessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        error: 'idToken is required',
        code: 'VALIDATION_ERROR',
      }, { status: 400 });
    }

    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    const adminApp = getAdminApp();
    const sessionCookie = await getAuth(adminApp).createSessionCookie(
      parsed.data.idToken,
      { expiresIn },
    );

    const response = NextResponse.json({ success: true });
    response.cookies.set('__session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/admin',
      maxAge: expiresIn / 1000,
    });
    return response;
  } catch (err) {
    logError('[session] POST error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({
      success: false,
      error: 'Session creation failed.',
      code: 'SESSION_CREATE_FAILED',
    }, { status: 500 });
  }
}
