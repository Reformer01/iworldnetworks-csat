import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError, logInfo } from '@/lib/logger';
import { getPublicBaseUrl } from '@/lib/splynx-mirror';
import { runHourlySyncDb } from '@/lib/splynx-sync-db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 5, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }
    if (!isSuperAdmin(admin.email) && !isEditor(admin.email)) {
      return error('Only authorised editors can trigger a sync.', 403);
    }

    const started = Date.now();
    logInfo('[admin-splynx-sync] manual sync triggered', { user: admin.email });
    const stats = await runHourlySyncDb(getPublicBaseUrl());

    return success({
      durationMs: Date.now() - started,
      stats,
      note: stats.invoicesApiDenied
        ? 'Invoice sync skipped: the Splynx API key lacks Finance module permission. Grant it in Splynx (Config > API keys) to backfill invoices.'
        : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-splynx-sync] POST error', { error: message });
    return serverError();
  }
}
