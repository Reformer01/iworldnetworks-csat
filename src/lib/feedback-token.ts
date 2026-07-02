import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getFeedbackBaseUrl(request: NextRequest): string {
  return process.env.FEEDBACK_BASE_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

export interface CreateTokenData {
  customerName: string;
  customerEmail: string;
  servicePlan?: string;
  location?: string;
  serviceDate?: string;
  sourceEvent?: string;
}

export async function createFeedbackToken(db: Firestore, data: CreateTokenData): Promise<{ token: string; expiresAt: number }> {
  const token = randomUUID();
  const expiresAt = Date.now() + TOKEN_TTL_MS;

  await db.collection('feedback_tokens').doc(token).set({
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    servicePlan: data.servicePlan || '',
    location: data.location || '',
    serviceDate: data.serviceDate || '',
    sourceEvent: data.sourceEvent || '',
    used: false,
    createdAt: Date.now(),
    expiresAt,
    openedAt: null,
    submittedAt: null,
  });

  return { token, expiresAt };
}
