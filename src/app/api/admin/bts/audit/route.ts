import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, tooMany, serverError } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { computeTowerAudit as towerAudit } from '@/lib/audit/computeTowerAudit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) {
      return tooMany();
    }

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const includeEmpty = searchParams.get('includeEmpty') === 'true';
    const towers = await towerAudit({ includeEmpty });

    // Device-telemetry freshness is a separate signal from the customer
    // roster: UISP sync needs UISP_API_TOKEN, while the roster rides the
    // Splynx sync. The page banners device staleness instead of flagging
    // every tower for an upstream credential gap.
    const devicesSyncAt = towers.reduce<number | null>(
      (max, t) => (t.lastSyncAt != null && (max == null || t.lastSyncAt > max) ? t.lastSyncAt : max),
      null,
    );
    const meta = {
      devicesSyncAt,
      devicesStale: devicesSyncAt != null && Date.now() - devicesSyncAt > 86400000,
      uispConfigured: !!process.env.UISP_API_TOKEN,
    };

    return success({ towers, total: towers.length, generatedAt: Date.now(), meta });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[bts-audit] GET error', { error: message });
    return serverError();
  }
}