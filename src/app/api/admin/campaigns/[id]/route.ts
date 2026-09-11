import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, verifySuperAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin } from '@/lib/admin-config';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, tooMany, notFound, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import {
  serializeCampaign,
  sendCampaign,
  retryCampaignFailed,
  getCampaignStats,
  finalizeCampaignStatus,
} from '@/lib/services/campaign-service';

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
    if (!['draft', 'scheduled', 'rejected'].includes(campaign.status)) return error('Only draft, scheduled, or rejected campaigns can be edited');

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

    // Allow updating scheduledAt
    if (body?.scheduledAt === null) {
      data.scheduledAt = null;
      data.status = 'draft';
    } else if (typeof body?.scheduledAt === 'number' && body.scheduledAt > Date.now()) {
      data.scheduledAt = BigInt(body.scheduledAt);
      data.status = 'scheduled';
    }

    const updated = await prisma.campaign.update({ where: { id }, data });
    return success(serializeCampaign(updated));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-campaigns-id] PATCH error', { error: message });
    return serverError();
  }
}

// POST actions: submit_for_review is any admin, approve/reject/send/cancel/retry are super-admin only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const action = body?.action;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return notFound('Campaign not found');

    if (action === 'submit_for_review') {
      // Editor submits campaign for super admin review
      if (campaign.status !== 'draft' && campaign.status !== 'rejected')
        return error(`Only draft or rejected campaigns can be submitted for review (current: ${campaign.status})`);
      const updated = await prisma.campaign.update({
        where: { id },
        data: { status: 'pending_approval', submittedBy: admin.email, submittedAt: BigInt(Date.now()), error: null },
      });
      return success(serializeCampaign(updated));
    }

    if (action === 'approve') {
      if (!isSuperAdmin(admin.email)) return forbidden('Super admin only.');
      if (campaign.status !== 'pending_approval')
        return error(`Only campaigns pending approval can be approved (current: ${campaign.status})`);
      const updated = await prisma.campaign.update({
        where: { id },
        data: { status: 'approved', approvedAt: BigInt(Date.now()), approvedBy: admin.email, error: null },
      });
      return success(serializeCampaign(updated));
    }

    if (action === 'reject') {
      if (!isSuperAdmin(admin.email)) return forbidden('Super admin only.');
      if (campaign.status !== 'pending_approval')
        return error(`Only campaigns pending approval can be rejected (current: ${campaign.status})`);
      const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
      const updated = await prisma.campaign.update({
        where: { id },
        data: { status: 'rejected', rejectedAt: BigInt(Date.now()), rejectedBy: admin.email, rejectionReason: reason || null },
      });
      return success(serializeCampaign(updated));
    }

    if (action === 'send') {
      if (!isSuperAdmin(admin.email)) return forbidden('Super admin only.');
      // sendCampaign atomically claims draft -> sending (double-send guard).
      // Also works for approved campaigns.
      if (campaign.status !== 'draft' && campaign.status !== 'approved')
        return error(`Only draft or approved campaigns can be sent (current: ${campaign.status})`);
      let count: number;
      try {
        count = await sendCampaign(id);
      } catch (err) {
        return error(err instanceof Error ? err.message : 'Campaign cannot be sent', 409);
      }
      await prisma.campaign.update({
        where: { id },
        data: { approvedAt: campaign.approvedAt ?? BigInt(Date.now()), approvedBy: campaign.approvedBy ?? admin.email, error: null },
      });
      return success({ ok: true, status: 'sending', recipients: count });
    }

    if (action === 'cancel') {
      if (!isSuperAdmin(admin.email)) return forbidden('Super admin only.');
      if (campaign.status === 'sent' || campaign.status === 'cancelled')
        return error(`Campaign cannot be cancelled (status: ${campaign.status})`);
      const updated = await prisma.campaign.update({ where: { id }, data: { status: 'cancelled' } });
      return success(serializeCampaign(updated));
    }

    if (action === 'retry') {
      if (!isSuperAdmin(admin.email)) return forbidden('Super admin only.');
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

// DELETE is super-admin only. Removes the campaign and its EmailJob rows
// (campaign emails are meaningless without the campaign).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifySuperAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return notFound('Campaign not found');

    await prisma.$transaction([
      prisma.emailJob.deleteMany({ where: { campaignId: id } }),
      prisma.campaign.delete({ where: { id } }),
    ]);

    return success({ ok: true, deleted: id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[admin-campaigns-id] DELETE error', { error: message });
    return serverError();
  }
}
