import { withAdmin } from '@/lib/middleware/withAdmin';
import { success, error, notFound } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const EDITABLE = [
  'phone', 'callStatus', 'purpose', 'feedback', 'complaint',
  'upsellNote', 'retentionRisk', 'resolution', 'accountStatus',
] as const;

/**
 * DELETE /api/admin/engagement/[id] — delete an engagement record.
 */
export const DELETE = withAdmin(
  async (_req, _admin, ctx) => {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
    const existing = await prisma.engagementLog.findUnique({ where: { id } });
    if (!existing) return notFound('Engagement record not found');
    await prisma.engagementLog.delete({ where: { id } });
    return success({ deleted: true });
  },
  { rate: { limit: 30, windowMs: 60_000 }, tag: 'engagement-delete' },
);

/**
 * PATCH /api/admin/engagement/[id] — update an engagement record's fields.
 * Agents update their daily call info here; no new rows are created.
 */
export const PATCH = withAdmin(
  async (req, _admin, ctx) => {
    const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return error('body required', 400);

    const data: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (key in body) data[key] = body[key] === '' ? null : body[key];
    }
    if ('lastContactAt' in body) {
      data.lastContactAt = body.lastContactAt ? new Date(body.lastContactAt) : null;
    }
    if ('nextFollowUpAt' in body) {
      data.nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;
    }
    if (Object.keys(data).length === 0) return error('no editable fields provided', 400);

    const existing = await prisma.engagementLog.findUnique({ where: { id } });
    if (!existing) return notFound('Engagement record not found');

    const updated = await prisma.engagementLog.update({ where: { id }, data });
    return success(updated);
  },
  { rate: { limit: 120, windowMs: 60_000 }, tag: 'engagement-update' },
);
