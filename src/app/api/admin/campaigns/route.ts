import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, tooMany, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { serializeCampaign } from '@/lib/services/campaign-service';

export const dynamic = 'force-dynamic';

const CAMPAIGN_TYPES = ['campaign', 'downtime', 'notice', 'other'];

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const type = searchParams.get('type') || undefined;
    const search = searchParams.get('search')?.toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 200);

    const where: { status?: string; type?: string; OR?: { name: { contains: string } }[] } = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) where.OR = [{ name: { contains: search } }];

    const [records, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.campaign.count({ where }),
    ]);

    return success({
      records: records.map(serializeCampaign),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-campaigns] GET error', { error: message });
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
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!name || !subject || !text) return error('name, subject and text are required');

    const type = CAMPAIGN_TYPES.includes(body?.type) ? body.type : 'campaign';
    const html = typeof body?.html === 'string' ? body.html : '';

    const audience = body?.audience ?? { type: 'all' };
    if (
      !audience ||
      typeof audience !== 'object' ||
      !['all', 'lifecycle', 'city', 'status', 'servicePlan', 'bts'].includes(audience.type)
    ) {
      return error('audience must be { type: "all" } or { type, values }');
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        type,
        subject: subject.replace(/[\r\n]+/g, ' ').slice(0, 200),
        html,
        text,
        audienceJson: audience,
        createdBy: admin.email,
      },
    });

    return success({ ok: true, id: campaign.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-campaigns] POST error', { error: message });
    return serverError();
  }
}
