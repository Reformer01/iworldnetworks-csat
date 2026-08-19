import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { getEmailQueue, getPriorityForType } from '@/lib/queues/email-queue';
import { createEmailJob, setEmailJobBullJobId, markEmailJobFailed } from '@/lib/repositories/email-job-repo';

// Audience selector built from a Campaign's stored audienceJson. Always
// excludes deleted customers, opted-out/invalid email addresses, and
// customers without an email address.
export type Audience = { type: 'all' } | { type: 'lifecycle' | 'city' | 'status' | 'servicePlan' | 'bts'; values: string[] };

export function buildAudienceWhere(audience: Audience): Prisma.CustomerWhereInput {
  const base: Prisma.CustomerWhereInput = {
    deleted: false,
    emailOptOut: false,
    emailInvalid: false,
    email: { not: null, notIn: ['', 'N/A'] },
  };

  if (audience.type === 'all') return base;

  const values = audience.values;
  if (values.length === 0) return { ...base, id: { in: [] } };

  switch (audience.type) {
    case 'lifecycle':
      return { ...base, lifecycle: { in: values } };
    case 'city':
      return { ...base, city: { in: values } };
    case 'status':
      return { ...base, status: { in: values } };
    case 'servicePlan':
      return { ...base, servicePlan: { in: values } };
    case 'bts':
      return { ...base, btsId: { in: values } };
    default:
      return base;
  }
}

export async function resolveAudienceIds(audience: Audience): Promise<string[]> {
  const rows = await prisma.customer.findMany({
    where: buildAudienceWhere(audience),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function countAudience(audience: Audience): Promise<number> {
  return prisma.customer.count({ where: buildAudienceWhere(audience) });
}

// Sends a campaign: resolves the audience, creates one EmailJob row + one
// BullMQ job per recipient. Returns the recipient count.
export async function sendCampaign(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status !== 'draft') throw new Error(`Campaign cannot be sent (status: ${campaign.status})`);

  const audience = campaign.audienceJson as unknown as Audience;
  const recipients = await prisma.customer.findMany({
    where: buildAudienceWhere(audience),
    select: { id: true, email: true, customerName: true },
  });

  const payload = { subject: campaign.subject, html: campaign.html ?? '', text: campaign.text, campaignId };
  const queue = getEmailQueue();
  for (const c of recipients) {
    const email = c.email as string;
    let emailJobId: string | null = null;
    try {
      emailJobId = await createEmailJob({
        type: 'campaign',
        customerId: c.id,
        customerEmail: email,
        customerName: c.customerName || '',
        campaignId,
        payload: payload as unknown as Prisma.InputJsonValue,
      });
      const job = await queue.add(
        'campaign',
        { type: 'campaign', emailJobId, customerId: c.id, customerEmail: email, customerName: c.customerName || '', ...payload },
        { priority: getPriorityForType('campaign') },
      );
      await setEmailJobBullJobId(emailJobId, job.id ?? '');
    } catch (err) {
      // Enqueue failed after row creation: mark it failed so it stays visible
      // in the campaign audit instead of sitting forever as pending.
      if (emailJobId) {
        await markEmailJobFailed(emailJobId, err instanceof Error ? err.message : String(err), 0);
      }
    }
  }
  return recipients.length;
}

export async function getCampaignStats(campaignId: string) {
  const grouped = await prisma.emailJob.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });
  const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  return {
    total: count('pending') + count('processing') + count('sent') + count('failed') + count('pending_approval') + count('rejected'),
    pending: count('pending'),
    processing: count('processing'),
    sent: count('sent'),
    failed: count('failed'),
  };
}

// Campaign status is derived from its EmailJob rows on read, so the worker
// never touches the Campaign row. Applies to campaigns that left 'draft'.
export async function finalizeCampaignStatus(campaign: { id: string; status: string; audienceCount: number }): Promise<string> {
  if (campaign.status === 'draft' || campaign.status === 'cancelled') return campaign.status;
  const stats = await getCampaignStats(campaign.id);
  if (stats.total === 0) return campaign.status; // nothing enqueued yet
  if (stats.failed === stats.total) return 'failed';
  if (stats.sent === 0 && stats.failed > 0) return 'failed';
  if (stats.sent === stats.total) return 'sent';
  if (stats.sent > 0 || stats.processing > 0) return 'partial';
  return campaign.status;
}
