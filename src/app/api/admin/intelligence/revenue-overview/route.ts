import { NextResponse } from 'next/server';
import { success } from '@/lib/api-response';

// Deprecated: revenue health/upsell/anomaly data is now served via /api/admin/intelligence/overview
// This stub prevents stale cached clients from spamming 401s (no auth required, always 200).
// Keep stub until 2026-09-30, then delete file and let 404 surface.
export async function GET() {
  return NextResponse.json(
    success({
      deprecated: true,
      redirect: '/api/admin/intelligence/overview',
      message: 'Deprecated — use /api/admin/intelligence/overview. This endpoint now returns 200 to stop cached-client 401 spam.',
    }),
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
