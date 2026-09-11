import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTrackingPixelBuffer } from '@/lib/email-tracking';
import { logInfo } from '@/lib/logger';
import { isRateLimited } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/track/open?j={emailJobId}&c={campaignId}
 *
 * Returns a 1x1 transparent GIF pixel. Email clients load this image when
 * the email is opened, which records the open event.
 *
 * No authentication required — this is called by email clients.
 */
export async function GET(request: NextRequest) {
  if (isRateLimited(request, 200, 60 * 1000)) {
    return new NextResponse(getTrackingPixelBuffer(), {
      status: 200,
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
    });
  }
  try {
    const { searchParams } = new URL(request.url);
    const emailJobId = searchParams.get('j');
    const campaignId = searchParams.get('c');

    if (!emailJobId) {
      // Return pixel even if params are missing — don't break email rendering
      return new NextResponse(getTrackingPixelBuffer(), {
        status: 200,
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      });
    }

    // Look up the email job to get customer email
    const emailJob = await prisma.emailJob.findUnique({
      where: { id: emailJobId },
      select: { customerEmail: true, campaignId: true },
    });

    const customerEmail = emailJob?.customerEmail || 'unknown';
    const resolvedCampaignId = campaignId || emailJob?.campaignId || null;

    // Get user agent and IP
    const userAgent = request.headers.get('user-agent') || null;
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : null;

    // Store open event
    await prisma.emailOpenEvent.create({
      data: {
        emailJobId,
        campaignId: resolvedCampaignId,
        customerEmail: customerEmail.slice(0, 255),
        userAgent: userAgent?.slice(0, 500) || null,
        ip,
      },
    });

    logInfo('[track/open] Open recorded', {
      emailJobId,
      campaignId: resolvedCampaignId,
      customerEmail,
    });
  } catch (err) {
    // Log but don't fail — tracking is best-effort
    console.error('[track/open] Error:', err instanceof Error ? err.message : err);
  }

  // Always return the pixel, even if tracking failed
  return new NextResponse(getTrackingPixelBuffer(), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}
