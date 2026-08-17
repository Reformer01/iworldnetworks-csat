import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint for Docker healthchecks, nginx, and CI/CD pipelines.
 *
 * - No auth (infrastructure probes have no user token).
 * - Pings MariaDB via Prisma as THE data layer probe (everything now reads
 *   MariaDB) — the status flips 503 when the database is unreachable.
 */
export async function GET() {
  const started = Date.now();
  let dbOk = false;
  let reason = '';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    reason = err instanceof Error ? err.message : 'unknown';
    logError('[health] Database probe failed', { error: reason });
  }

  const status: 'ok' | 'degraded' = dbOk ? 'ok' : 'degraded';

  return NextResponse.json(
    {
      status,
      database: dbOk ? 'ok' : 'error',
      reason: dbOk ? undefined : reason,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - started,
    },
    { status: dbOk ? 200 : 503 },
  );
}
