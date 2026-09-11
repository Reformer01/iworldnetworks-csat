import { prisma } from '@/lib/prisma';
import { getAllActiveCustomers } from '@/lib/splynx-api';

/**
 * Weekly database validation (meeting decision: recurring cross-check until
 * a verified customer dataset is achieved). Compares the three sources and
 * stores the discrepancy report in SyncLock('weekly-validation').lastStats.
 *
 * Sources:
 *  - Splynx  : live active-customer count via API
 *  - UISP    : UispSite endpoint count + device count
 *  - Master  : unified Customer table (total / matched / pending)
 */

export interface ValidationReport {
  ranAt: string;
  splynx: { activeCustomers: number | null; error?: string };
  uisp: { endpoints: number; towers: number; devices: number };
  master: {
    total: number;
    matched: number;
    pending: number;
    manual: number;
    coveragePct: number;
    activeTotal: number;
    activeMatched: number;
    activeCoveragePct: number;
  };
}

export async function runWeeklyValidation(now = new Date()): Promise<ValidationReport> {
  const [splynxActive, endpoints, towers, devices, byState, activeByState] = await Promise.all([
    getAllActiveCustomers().then((rows) => rows.length).catch((err: unknown) => {
      return { error: err instanceof Error ? err.message.slice(0, 190) : 'unknown' };
    }),
    prisma.uispSite.count({ where: { type: 'endpoint' } }),
    prisma.uispSite.count({ where: { type: 'site' } }),
    prisma.uispDevice.count(),
    prisma.customer.groupBy({ by: ['matchState'], _count: { _all: true }, where: { deleted: false } }),
    prisma.customer.groupBy({ by: ['matchState'], _count: { _all: true }, where: { deleted: false, status: 'active' } }),
  ]);

  const total = byState.reduce((a, g) => a + g._count._all, 0);
  const matched = byState.find((g) => g.matchState === 'matched')?._count._all ?? 0;
  const pending = byState.find((g) => g.matchState === 'pending')?._count._all ?? 0;
  const manual = byState.find((g) => g.matchState === 'manual')?._count._all ?? 0;
  const activeTotal = activeByState.reduce((a, g) => a + g._count._all, 0);
  const activeMatched = activeByState.find((g) => g.matchState === 'matched')?._count._all ?? 0;

  const report: ValidationReport = {
    ranAt: now.toISOString(),
    splynx: typeof splynxActive === 'number'
      ? { activeCustomers: splynxActive }
      : { activeCustomers: null, error: (splynxActive as { error: string }).error },
    uisp: { endpoints, towers, devices },
    master: {
      total,
      matched,
      pending,
      manual,
      coveragePct: total ? Math.round((matched / total) * 1000) / 10 : 0,
      activeTotal,
      activeMatched,
      activeCoveragePct: activeTotal ? Math.round((activeMatched / activeTotal) * 1000) / 10 : 0,
    },
  };

  await prisma.syncLock.upsert({
    where: { id: 'weekly-validation' },
    update: { lastRunAt: BigInt(now.getTime()), lastStatus: 'ok', lastStats: JSON.parse(JSON.stringify(report)) },
    create: { id: 'weekly-validation', leaseUntil: BigInt(0), lastRunAt: BigInt(now.getTime()), lastStatus: 'ok', lastStats: JSON.parse(JSON.stringify(report)) },
  });

  return report;
}

export async function getLatestValidation(): Promise<ValidationReport | null> {
  const row = await prisma.syncLock.findUnique({ where: { id: 'weekly-validation' } });
  if (!row?.lastStats) return null;
  return row.lastStats as unknown as ValidationReport;
}
