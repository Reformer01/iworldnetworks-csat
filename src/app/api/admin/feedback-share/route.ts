import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { createFeedbackToken, getFeedbackBaseUrl } from '@/lib/feedback-token';
import { isValidCategory } from '@/lib/splynx-categories';
import { success, unauthorized, forbidden, tooMany, error, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const shareSchema = z
  .object({
    customerName: z.string().min(1, 'Name is required').max(100),
    customerEmail: z.string().email('Invalid email'),
    servicePlan: z.string().max(100).optional().default(''),
    location: z.string().max(100).optional().default(''),
    serviceDate: z.string().max(20).optional().default(''),
    subject: z.string().min(1, 'Subject is required'),
    staffName: z.string().max(100).optional().default(''),
  })
  .strict();

/**
 * Admin-authenticated share-link generator.
 * Creates a feedback token pinned to a specific subject/category so staff can
 * send customers a link that points directly at the relevant department
 * (e.g. Field Support) instead of making them choose.
 */
export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) {
      return tooMany();
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) {
      return unauthorized('Unauthorized Administrative Access.');
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return error('Invalid JSON request body.', 400);
    }

    const validation = shareSchema.safeParse(body);
    if (!validation.success) {
      return error('Validation failed.', 400, { errors: validation.error.flatten().fieldErrors });
    }

    const data = validation.data;

    if (!isValidCategory(data.subject)) {
      return error('Validation failed.', 400, { errors: { subject: ['Invalid subject.'] } });
    }

    const db = getAdminFirestore();
    const { token } = await createFeedbackToken(db, {
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: data.servicePlan,
      location: data.location,
      serviceDate: data.serviceDate,
      category: data.subject,
      staffName: data.staffName,
      sourceEvent: `admin-share:${data.subject}`,
    });

    const base = getFeedbackBaseUrl(request);
    const url = `${base}/feedback?token=${token}&subject=${encodeURIComponent(data.subject)}`;
    const popupUrl = `${base}/feedback/popup?token=${token}&subject=${encodeURIComponent(data.subject)}&embed=true`;

    return success({ token, url, popupUrl });
  } catch (err: unknown) {
    logError('[admin-feedback-share] POST error', { error: err instanceof Error ? err.message : String(err) });
    return serverError();
  }
}
