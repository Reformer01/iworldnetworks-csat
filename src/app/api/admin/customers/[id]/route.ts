import { NextRequest } from 'next/server';
import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, error, notFound } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit-log';
import { clearRouteCache } from '@/lib/route-cache';

export const dynamic = 'force-dynamic';

const ALLOWED_PATCH_FIELDS = new Set(['emailOptOut', 'emailInvalid', 'btsId', 'btsName', 'city', 'phone', 'email', 'lifecycle', 'status']);

/** GET /api/admin/customers/:id — detail with overdue + churn join */
export const GET = withAdmin(
  async (req: NextRequest, _admin, ctx?: unknown) => {
    const params = (ctx as { params?: { id?: string } })?.params;
    const id = params?.id || new URL(req.url).pathname.split('/').pop() || '';
    const customer = await prisma.customer.findUnique({ where: { id } }).catch(() => null);
    if (!customer || (customer as { deleted?: boolean }).deleted) return notFound('Customer not found.');
    return success(customer);
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'customer-detail' },
);

/** PATCH /api/admin/customers/:id — correct sync data (emailOptOut, bts, etc.) */
export const PATCH = withAdmin(
  async (req: NextRequest, admin) => {
    const id = new URL(req.url).pathname.split('/').pop() || '';
    const body = await req.json().catch(() => null);
    if (!body) return error('Invalid JSON body.', 400);

    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED_PATCH_FIELDS.has(k)) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) return error('No valid fields to update.', 400);

    const prev = await prisma.customer.findUnique({ where: { id } }).catch(() => null);
    if (!prev) return notFound('Customer not found.');

    const updated = await prisma.customer.update({ where: { id }, data: updates as never }).catch(() => null);
    if (!updated) return notFound('Customer not found.');

    await writeAuditLog({
      action: 'update',
      collection: 'customers',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: updates,
      previousState: prev as Record<string, unknown>,
    });
    clearRouteCache();
    return success(updated);
  },
  { rate: { limit: 60, windowMs: 60_000 }, tag: 'customer-patch' },
);
