import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { createFeedbackToken, getFeedbackBaseUrl } from '@/lib/feedback-token';
import { isRateLimitedFirestore } from '@/lib/rate-limit-firestore';
import { logError } from '@/lib/logger';
import { z } from 'zod';

const popupTokenSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  servicePlan: z.string().optional().default(''),
  location: z.string().optional().default(''),
  serviceDate: z.string().optional().default(''),
  sourceEvent: z.string().optional().default('finance.invoice.paid'),
  invoiceId: z.string().optional(),
  amountPaid: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (await isRateLimitedFirestore(request, 20, 60 * 1000)) {
      return NextResponse.json({ success: false, error: 'Too many requests.' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON.' }, { status: 400 });
    }

    const validation = popupTokenSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed.', details: validation.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = validation.data;
    const db = getAdminFirestore();
    const { token } = await createFeedbackToken(db, {
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: data.servicePlan,
      location: data.location,
      serviceDate: data.serviceDate,
      sourceEvent: data.sourceEvent,
    });

    const baseUrl = getFeedbackBaseUrl(request);
    const popupUrl = `${baseUrl}/feedback/popup?token=${token}&embed=true`;
    const feedbackUrl = `${baseUrl}/feedback?token=${token}`;

    return NextResponse.json({
      success: true,
      token,
      url: feedbackUrl,
      popupUrl,
      embedHtml: `<iframe src="${popupUrl}" width="100%" height="500" frameborder="0" style="border-radius: 12px; border: 1px solid #e5e7eb;"></iframe>`,
    });
  } catch (err) {
    logError('[feedback-popup] POST error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ success: false, error: 'Token required' }, { status: 400 });
  }
  return NextResponse.redirect(new URL(`/feedback/popup?token=${token}`, request.url));
}
