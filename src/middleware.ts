import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, protocol } = request.nextUrl;

  // Redirect HTTP to HTTPS in production
  if (protocol === 'http:' && process.env.NODE_ENV === 'production') {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, 301);
  }

  // Session check only applies to admin pages
  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (pathname === '/admin/login') return NextResponse.next();
  if (pathname.startsWith('/api/auth/session')) return NextResponse.next();

  // NOTE: Ticket admin routes are protected at the application level,
  // not via middleware, to avoid conflicts with existing admin routes

  const session = request.cookies.get('__session')?.value;

  if (!session) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
