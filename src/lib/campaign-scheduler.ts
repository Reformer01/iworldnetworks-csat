/**
 * Campaign Scheduler
 *
 * Checks for campaigns with status="scheduled" whose scheduledAt time has
 * arrived, then transitions them to "sending" and triggers the send action.
 *
 * Runs every minute when registered in instrumentation.ts.
 */

import { prisma } from '@/lib/prisma';

/**
 * Find scheduled campaigns that are due and send them.
 * Called by the interval timer in instrumentation.ts.
 */
export async function processScheduledCampaigns(): Promise<{
  processed: number;
  errors: string[];
}> {
  const now = Date.now();
  const errors: string[] = [];
  let processed = 0;

  try {
    // Find all campaigns that are scheduled and due
    const dueCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { not: null, lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    for (const campaign of dueCampaigns) {
      try {
        // Transition to sending
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'sending' },
        });

        // Trigger the actual send via the API endpoint logic
        const result = await sendCampaign(campaign.id);

        if (result.ok) {
          processed++;
          console.log(`[campaign-scheduler] Sent campaign ${campaign.id} (${campaign.name}) to ${result.recipients} recipients`);
        } else {
          errors.push(`Campaign ${campaign.id}: ${result.error}`);
          console.error(`[campaign-scheduler] Failed campaign ${campaign.id}: ${result.error}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Campaign ${campaign.id}: ${msg}`);
        console.error(`[campaign-scheduler] Error processing campaign ${campaign.id}:`, msg);

        // Mark campaign as failed
        try {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              status: 'failed',
              error: msg.slice(0, 190), // Truncate for VARCHAR(191)
            },
          });
        } catch {
          // Best effort
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Scheduler error: ${msg}`);
    console.error('[campaign-scheduler] Fatal error:', msg);
  }

  return { processed, errors };
}

/**
 * Send a campaign — resolves audience, creates email jobs, queues them.
 * Mirrors the POST /api/admin/campaigns/[id] action=send logic.
 */
async function sendCampaign(campaignId: string): Promise<{ ok: boolean; recipients?: number; error?: string }> {
  const { prisma: db } = await import('@/lib/prisma');

  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { ok: false, error: 'Campaign not found' };
  if (campaign.status !== 'sending') return { ok: false, error: `Campaign status is ${campaign.status}, not sending` };

  const audience = campaign.audienceJson as { type: string; values?: string[] };

  // Resolve recipients from the Customer table
  let where: Record<string, unknown> = { deleted: false };

  if (audience && typeof audience === 'object' && audience.type !== 'all' && audience.values?.length) {
    const fieldMap: Record<string, string> = {
      lifecycle: 'lifecycle',
      city: 'city',
      status: 'status',
      servicePlan: 'servicePlan',
      bts: 'btsName',
    };
    const field = fieldMap[audience.type];
    if (field) {
      where = { ...where, [field]: { in: audience.values } };
    }
  }

  const customers = await db.customer.findMany({
    where: where as never,
    select: {
      id: true,
      customerName: true,
      email: true,
    },
  });

  const recipients = customers.filter((c) => c.email);

  if (recipients.length === 0) {
    await db.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed', error: 'No recipients with email addresses' },
    });
    return { ok: false, error: 'No recipients with email addresses' };
  }

  // Create email jobs for each recipient
  const jobs = recipients.map((customer) => ({
    campaignId,
    type: 'campaign',
    status: 'pending',
    customerId: customer.id,
    customerEmail: customer.email!,
    customerName: customer.customerName || null,
    payload: {
      subject: campaign.subject,
      html: campaign.html || '',
      text: campaign.text,
      customerName: customer.customerName || 'there',
    },
  }));

  // Batch create (chunks of 100 to avoid SQL limits) and enqueue to BullMQ
  const { getEmailQueue } = await import('@/lib/queues/email-queue');
  const queue = getEmailQueue();
  const CHUNK = 100;
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const chunk = jobs.slice(i, i + CHUNK);
    await db.emailJob.createMany({ data: chunk });
    // Fetch back the created jobs to get their IDs for queueing
    const created = await db.emailJob.findMany({
      where: { campaignId, customerId: { in: chunk.map((j) => j.customerId) } },
      select: { id: true, customerId: true, customerEmail: true, customerName: true, payload: true },
      orderBy: { createdAt: 'desc' },
      take: chunk.length,
    });
    for (const job of created) {
      try {
        const bullJob = await queue.add('campaign', {
          type: 'campaign',
          emailJobId: job.id,
          customerId: job.customerId,
          customerEmail: job.customerEmail,
          customerName: job.customerName,
          ...((job.payload as Record<string, unknown>) || {}),
        });
        await db.emailJob.update({ where: { id: job.id }, data: { bullJobId: bullJob.id ?? '' } });
      } catch (err) {
        await db.emailJob.update({ where: { id: job.id }, data: { status: 'failed', error: String(err).slice(0, 190) } });
      }
    }
  }

  // Update campaign status
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'sending',
      audienceCount: recipients.length,
    },
  });

  return { ok: true, recipients: recipients.length };
}

// NOTE (Sep 2026 audit): cancelScheduledCampaign was removed — zero callers,
// and POST /api/admin/campaigns/[id] { action: 'cancel' } is the live path.

