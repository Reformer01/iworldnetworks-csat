import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, verifySuperAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, tooMany, notFound, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { serializeCampaign, sendCampaign, retryCampaignFailed, getCampaignStats, finalizeCampaignStatus } from '@/lib/services/campaign-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isRateLimited(request, 120, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return notFound('Campaign not found');

    const status = await finalizeCampaignStatus(campaign);
    const stats = await getCampaignStats(id);
    return success({ ...serializeCampaign({ ...campaign, status }), stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-campaigns-id] GET error', { error: message });
    return serverError();
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return notFound('Campaign not found');
    if (campaign.status !== 'draft') return error('Only draft campaigns can be edited');

    const body = await request.json().catch(() => null);
    const data: Record<string, unknown> = {};
    if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (typeof body?.subject === 'string' && body.subject.trim())
      data.subject = body.subject
        .trim()
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 200);
    if (typeof body?.text === 'string' && body.text.trim()) data.text = body.text.trim();
    if (typeof body?.html === 'string') data.html = body.html;
    if (
      body?.audience &&
      typeof body.audience === 'object' &&
      ['all', 'lifecycle', 'city', 'status', 'servicePlan', 'bts'].includes(body.audience.type)
    ) {
      data.audienceJson = body.audience;
    }

    const updated = await prisma.campaign.update({ where: { id }, data });
    return success(serializeCampaign(updated));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-campaigns-id] PATCH error', { error: message });
    return serverError();
  }
}

// POST actions are super-admin only. Sending a campaign IS the approval step:
// one review gates the whole audience, then per-recipient EmailJob rows are
// created and enqueued.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifySuperAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const action = body?.action;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return notFound('Campaign not found');

    if (action === 'send') {
      if (campaign.status !== 'draft') return error(`Campaign cannot be sent (status: ${campaign.status})`);
      const count = await sendCampaign(id);
      await prisma.campaign.update({
        where: { id },
        data: { status: 'sending', sentAt: BigInt(Date.now()), approvedAt: BigInt(Date.now()), approvedBy: admin.email, error: null },
      });
      return success({ ok: true, status: 'sending', recipients: count });
    }

    if (action === 'cancel') {
      if (campaign.status === 'sent' || campaign.status === 'cancelled')
        return error(`Campaign cannot be cancelled (status: ${campaign.status})`);
      const updated = await prisma.campaign.update({ where: { id }, data: { status: 'cancelled' } });
      return success(serializeCampaign(updated));
    }

    if (action === 'retry') {
      if (campaign.status !== 'failed' && campaign.status !== 'partial')
        return error(`Campaign cannot be retried (status: ${campaign.status})`);
      const count = await retryCampaignFailed(id);
      if (count === 0) return error('No failed emails to retry');
      await prisma.campaign.update({
        where: { id },
        data: { status: 'sending', sentAt: BigInt(Date.now()), approvedAt: BigInt(Date.now()), approvedBy: admin.email, error: null },
      });
      return success({ ok: true, status: 'sending', retried: count });
    }

    return error('action must be send, cancel or retry');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-campaigns-id] POST error', { error: message });
    return serverError();
  }
}
