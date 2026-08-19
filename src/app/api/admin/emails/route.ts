import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { queueManualEmail } from '@/lib/queues/email-producer';
import { serializeEmailJob } from '@/lib/repositories/email-job-repo';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getStats() {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const [pending, processing, pendingApproval, sent24h, failed24h] = await Promise.all([
    prisma.emailJob.count({ where: { status: 'pending' } }),
    prisma.emailJob.count({ where: { status: 'processing' } }),
    prisma.emailJob.count({ where: { status: 'pending_approval' } }),
    prisma.emailJob.count({ where: { status: 'sent', sentAt: { gte: BigInt(dayAgo) } } }),
    prisma.emailJob.count({ where: { status: 'failed', updatedAt: { gte: new Date(dayAgo) } } }),
  ]);
  return { pending, processing, pendingApproval, sent24h, failed24h };
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const status = searchParams.get('status') || undefined;
    const campaignId = searchParams.get('campaignId') || undefined;
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 200);

    const where: Prisma.EmailJobWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (campaignId) where.campaignId = campaignId;
    if (search) {
      where.OR = [{ customerName: { contains: search } }, { customerEmail: { contains: search } }];
    }

    const [records, total, stats] = await Promise.all([
      prisma.emailJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.emailJob.count({ where }),
      getStats(),
    ]);

    return success({
      records: records.map(serializeEmailJob),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-emails] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => null);
    const to = typeof body?.to === 'string' ? body.to.trim() : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    if (!to || !subject) return error('to and subject are required');
    if (!EMAIL_RE.test(to)) return error('to must be a valid email address');

    // Manual emails need super-admin approval before sending, unless the
    // composer IS a super admin (they are the approver). Editors draft.
    const requiresApproval = !isSuperAdmin(admin.email);

    await queueManualEmail(
      to,
      typeof body?.customerName === 'string' ? body.customerName : '',
      // CRLF in subject could inject SMTP headers; strip newlines.
      subject.replace(/[\r\n]+/g, ' ').slice(0, 200),
      typeof body?.html === 'string' ? body.html : '',
      typeof body?.text === 'string' ? body.text : '',
      requiresApproval,
    );

    return success({ ok: true, status: requiresApproval ? 'pending_approval' : 'pending' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-emails] POST error', { error: message });
    return serverError();
  }
}
