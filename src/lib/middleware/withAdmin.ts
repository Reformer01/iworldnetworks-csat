import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { isSuperAdmin } from '@/lib/admin-config';
import { logError } from '@/lib/logger';


type Admin = { uid: string; email: string };
type Handler = (req: NextRequest, admin: Admin, ctx?: unknown) => Promise<NextResponse>;

interface WithAdminOpts {
  rate?: { limit: number; windowMs: number };
  skipOriginCheck?: boolean;
  tag?: string;
}

export function withAdmin(handler: Handler, opts: WithAdminOpts = {}): (req: NextRequest, ctx?: unknown) => Promise<NextResponse> {
  const { rate = { limit: 120, windowMs: 60_000 }, skipOriginCheck = false, tag = 'withAdmin' } = opts;
  return async (req: NextRequest, ctx?: unknown) => {
    if (isRateLimited(req, rate.limit, rate.windowMs)) return tooMany();
    if (!skipOriginCheck && !validateOrigin(req)) return forbidden();
    const admin = await verifyAdminToken(req.headers.get('authorization'));
    if (!admin) return unauthorized();
    try {
      // ctx is Next.js route context { params } — forwarded for [id] routes
      return await (handler as (req: NextRequest, admin: { uid: string; email: string }, ctx?: unknown) => Promise<NextResponse>)(
        req,
        admin,
        ctx,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logError(`[${tag}] error`, { error: message });
      return serverError();
    }
  };
}

export function withSuperAdmin(handler: Handler, opts: WithAdminOpts = {}): (req: NextRequest, ctx?: unknown) => Promise<NextResponse> {
  return withAdmin(async (req, admin) => {
    if (!isSuperAdmin(admin.email)) return forbidden('Super admin only.');
    return handler(req, admin);
  }, opts);
}
