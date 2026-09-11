import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logInfo } from '@/lib/logger';
import { isRateLimited } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/track/click?j={emailJobId}&c={campaignId}&url={encodedUrl}
 *
 * Records the click event and redirects to the original URL.
 *
 * No authentication required — this is called by email clients.
 */
export async function GET(request: NextRequest) {
  if (isRateLimited(request, 200, 60 * 1000)) {
    return NextResponse.redirect(new URL('/', request.url), { status: 302 });
  }
  const { searchParams } = new URL(request.url);
  const emailJobId = searchParams.get('j');
  const campaignId = searchParams.get('c');
  const originalUrl = searchParams.get('url');

  // Validate URL — only allow http/https to prevent open redirect
  if (originalUrl && !/^https?:\/\//i.test(originalUrl)) {
    return NextResponse.redirect(new URL('/', request.url), { status: 302 });
  }

  // If any required param is missing, redirect to homepage as fallback
  if (!emailJobId || !originalUrl) {
    return NextResponse.redirect(new URL('/', request.url), { status: 302 });
  }

  try {
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

    // Store click event
    await prisma.emailClickEvent.create({
      data: {
        emailJobId,
        campaignId: resolvedCampaignId,
        customerEmail: customerEmail.slice(0, 255),
        url: originalUrl.slice(0, 2000),
        originalUrl: originalUrl.slice(0, 2000),
        userAgent: userAgent?.slice(0, 500) || null,
        ip,
      },
    });

    logInfo('[track/click] Click recorded', {
      emailJobId,
      campaignId: resolvedCampaignId,
      customerEmail,
      url: originalUrl.slice(0, 100),
    });
  } catch (err) {
    // Log but don't fail — tracking is best-effort
    console.error('[track/click] Error:', err instanceof Error ? err.message : err);
  }

  // Redirect to original URL
  return NextResponse.redirect(originalUrl, { status: 302 });
}
