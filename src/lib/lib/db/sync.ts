import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function acquireSyncLock(now = Date.now()): Promise<boolean> {
  // Read-then-claim: another run holding a live lease blocks this one.
  const existing = await prisma.syncLock.findUnique({ where: { id: 'splynx-hourly-sync' } });
  if (existing && existing.leaseUntil > BigInt(now)) return false;
  await prisma.syncLock.upsert({
    where: { id: 'splynx-hourly-sync' },
    update: {
      leaseUntil: BigInt(now + 25 * 60 * 1000),
      lastRunAt: BigInt(now),
      lastStatus: 'running',
    },
    create: {
      id: 'splynx-hourly-sync',
      leaseUntil: BigInt(now + 25 * 60 * 1000),
      lastRunAt: BigInt(now),
      lastStatus: 'running',
    },
  });
  return true;
}

export async function completeSyncRun(stats: Prisma.InputJsonValue, error: string | null, now = Date.now()): Promise<void> {
  await prisma.syncLock.update({
    where: { id: 'splynx-hourly-sync' },
    data: {
      leaseUntil: BigInt(0),
      lastRunAt: BigInt(now),
      lastStatus: error ? 'error' : 'ok',
      lastError: error || '',
      lastStats: stats,
    },
  });
}

export async function getSyncLock() {
  return prisma.syncLock.findUnique({ where: { id: 'splynx-hourly-sync' } });
}

export async function getSplynxMeta() {
  return prisma.splynxMeta.findUnique({ where: { id: 'sync' } });
}

export async function setSplynxMeta(data: {
  invoicesApiDenied?: boolean;
  deniedAt?: number;
  lastInvoiceSyncAt?: number;
  paymentsMaxId?: number | null;
  paymentsBackfillOffset?: number | null;
  paymentsBackfillComplete?: boolean;
  paymentsLastSyncAt?: number | null;
}) {
  return prisma.splynxMeta.upsert({
    where: { id: 'sync' },
    update: {
      ...(data.invoicesApiDenied !== undefined ? { invoicesApiDenied: data.invoicesApiDenied } : {}),
      ...(data.deniedAt !== undefined ? { deniedAt: data.deniedAt != null ? BigInt(data.deniedAt) : null } : {}),
      ...(data.lastInvoiceSyncAt !== undefined
        ? { lastInvoiceSyncAt: data.lastInvoiceSyncAt != null ? BigInt(data.lastInvoiceSyncAt) : null }
        : {}),
      ...(data.paymentsMaxId !== undefined ? { paymentsMaxId: data.paymentsMaxId } : {}),
      ...(data.paymentsBackfillOffset !== undefined ? { paymentsBackfillOffset: data.paymentsBackfillOffset } : {}),
      ...(data.paymentsBackfillComplete !== undefined ? { paymentsBackfillComplete: data.paymentsBackfillComplete } : {}),
      ...(data.paymentsLastSyncAt !== undefined
        ? { paymentsLastSyncAt: data.paymentsLastSyncAt != null ? BigInt(data.paymentsLastSyncAt) : null }
        : {}),
    },
    create: {
      id: 'sync',
      invoicesApiDenied: data.invoicesApiDenied ?? false,
      deniedAt: data.deniedAt ? BigInt(data.deniedAt) : null,
      lastInvoiceSyncAt: data.lastInvoiceSyncAt ? BigInt(data.lastInvoiceSyncAt) : null,
      paymentsMaxId: data.paymentsMaxId ?? null,
      paymentsBackfillOffset: data.paymentsBackfillOffset ?? 0,
      paymentsBackfillComplete: data.paymentsBackfillComplete ?? false,
      paymentsLastSyncAt: data.paymentsLastSyncAt ? BigInt(data.paymentsLastSyncAt) : null,
    },
  });
}
