import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, serverError, validateOrigin, forbidden, tooMany } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { displayAssigneeName } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// GET /api/admin/tickets/summary — per-assignee workload (mirrors the Splynx
// "Assigned to administrators" view): open + total per assignee, display
// names resolved, sorted by open desc. Cheap aggregation, no Firestore.
export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const groups = await prisma.ticket.groupBy({
      by: ['assignedTo', 'status'],
      where: { deletedAt: null },
      _count: { _all: true },
    });

    const byAssignee = new Map<string | null, { open: number; total: number }>();
    for (const g of groups) {
      const key = g.assignedTo ?? null;
      const entry = byAssignee.get(key) ?? { open: 0, total: 0 };
      entry.total += g._count._all;
      if (g.status === 'open') entry.open += g._count._all;
      byAssignee.set(key, entry);
    }

    const totalOpen = [...byAssignee.values()].reduce((a, e) => a + e.open, 0);
    const breakdown = [...byAssignee.entries()]
      .map(([assignee, e]) => ({
        assignee,
        name: displayAssigneeName(assignee),
        open: e.open,
        total: e.total,
        pctOpen: totalOpen > 0 ? Math.round((e.open / totalOpen) * 100) : 0,
      }))
      .sort((a, b) => b.open - a.open);

    return success({ breakdown, totalOpen, generatedAt: Date.now() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[tickets-summary] GET error', { error: message });
    return serverError();
  }
}
