import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function createChurnSurvey(data: {
  customerId: string;
  customerName: string;
  customerEmail: string;
  sentAt: number;
  expiresAt: number;
}) {
  const token = randomUUID();
  await prisma.churnSurvey.create({
    data: {
      id: token,
      customerId: data.customerId,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      sentAt: BigInt(data.sentAt),
      expiresAt: BigInt(data.expiresAt),
      used: false,
    },
  });
  return { token };
}

export async function getChurnSurvey(token: string) {
  return prisma.churnSurvey.findUnique({ where: { id: token } });
}

export async function markChurnSurveyUsed(token: string, submittedAt: number, rating?: number, reason?: string, comment?: string) {
  return prisma.churnSurvey.update({
    where: { id: token },
    data: {
      used: true,
      submittedAt: BigInt(submittedAt),
      rating: rating ?? null,
      reason: reason ?? null,
      comment: comment ?? null,
    },
  });
}

export async function getChurnSurveysSent() {
  return prisma.churnSurvey.findMany({
    where: { used: false },
    orderBy: { sentAt: 'desc' },
  });
}
