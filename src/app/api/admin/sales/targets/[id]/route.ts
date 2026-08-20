import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, error, notFound } from '@/lib/api-response';
import { getSalesTargetByIdDb, updateSalesTargetDb, deleteSalesTargetDb } from '@/lib/sales-db';
import { writeAuditLog } from '@/lib/audit-log';
import { clearRouteCache } from '@/lib/route-cache';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(
  async (_req: NextRequest, _admin, ctx?: unknown) => {
    const id = (ctx as { params?: { id?: string } })?.params?.id || '';
    const target = await getSalesTargetByIdDb(id);
    if (!target) return notFound('Target not found.');
    return success({ target });
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'sales-target-get' },
);

export const PUT = withAdmin(
  async (req: NextRequest, admin, ctx?: unknown) => {
    const id = (ctx as { params?: { id?: string } })?.params?.id || new URL(req.url).pathname.split('/').slice(-1)[0] || '';
    const body = await req.json().catch(() => null);
    if (!body) return error('Invalid JSON.', 400);
    const prev = await getSalesTargetByIdDb(id);
    if (!prev) return notFound('Target not found.');
    const data: Record<string, unknown> = {};
    if (body.targetRevenue !== undefined) data.targetRevenue = Number(body.targetRevenue);
    if (body.targetCustomers !== undefined) data.targetCustomers = Number(body.targetCustomers);
    if (body.region !== undefined) data.region = body.region;
    if (body.agentName !== undefined) data.agentName = body.agentName;
    const updated = await updateSalesTargetDb(id, data as never);
    if (!updated) return notFound('Target not found.');
    await writeAuditLog({
      action: 'update',
      collection: 'sales_targets',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: data,
      previousState: prev as never,
    });
    clearRouteCache();
    return success({ target: updated });
  },
  { rate: { limit: 60, windowMs: 60_000 }, tag: 'sales-target-put' },
);

export const DELETE = withAdmin(
  async (_req: NextRequest, admin, ctx?: unknown) => {
    const id = (ctx as { params?: { id?: string } })?.params?.id || '';
    const prev = await getSalesTargetByIdDb(id);
    if (!prev) return notFound('Target not found.');
    const ok = await deleteSalesTargetDb(id);
    if (!ok) return notFound('Target not found.');
    await writeAuditLog({
      action: 'delete',
      collection: 'sales_targets',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: prev as never,
    });
    clearRouteCache();
    return success({ deleted: true });
  },
  { rate: { limit: 30, windowMs: 60_000 }, tag: 'sales-target-delete' },
);
