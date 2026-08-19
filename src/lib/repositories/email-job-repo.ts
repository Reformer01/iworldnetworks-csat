import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// MariaDB VARCHAR(191) truncation guard (see AGENTS.md): keep error text short.
const MAX_ERROR_LEN = 190;

export async function createEmailJob(input: {
  type: string;
  customerId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  payload: Prisma.InputJsonValue;
  status?: string;
}): Promise<string> {
  const record = await prisma.emailJob.create({
    data: {
      type: input.type,
      customerId: input.customerId ?? null,
      customerEmail: input.customerEmail ?? null,
      customerName: input.customerName ?? null,
      payload: input.payload,
      status: input.status ?? 'pending',
    },
    select: { id: true },
  });
  return record.id;
}

// BigInt/Date -> number (epoch ms) so NextResponse.json can serialize.
const toNum = (v: bigint | Date | null): number | null => (v === null ? null : v instanceof Date ? v.getTime() : Number(v));

// Shared shape for API responses; keeps /api/admin/emails routes consistent.
export function serializeEmailJob(record: {
  id: string;
  bullJobId: string | null;
  campaignId: string | null;
  type: string;
  status: string;
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  payload: Prisma.JsonValue;
  result: Prisma.JsonValue | null;
  error: string | null;
  scheduledAt: bigint | null;
  sentAt: bigint | null;
  approvedAt: bigint | null;
  approvedBy: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: record.id,
    bullJobId: record.bullJobId,
    campaignId: record.campaignId,
    type: record.type,
    status: record.status,
    customerId: record.customerId,
    customerEmail: record.customerEmail,
    customerName: record.customerName,
    payload: record.payload,
    result: record.result,
    error: record.error,
    scheduledAt: toNum(record.scheduledAt),
    sentAt: toNum(record.sentAt),
    approvedAt: toNum(record.approvedAt),
    approvedBy: record.approvedBy,
    retryCount: record.retryCount,
    maxRetries: record.maxRetries,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  };
}

export async function setEmailJobBullJobId(id: string, bullJobId: string): Promise<void> {
  await prisma.emailJob.updateMany({
    where: { id },
    data: { bullJobId },
  });
}

export async function markEmailJobProcessing(id: string): Promise<void> {
  await prisma.emailJob.updateMany({
    where: { id },
    data: { status: 'processing' },
  });
}

export async function markEmailJobSent(id: string): Promise<void> {
  await prisma.emailJob.updateMany({
    where: { id },
    data: { status: 'sent', sentAt: BigInt(Date.now()) },
  });
}

export async function markEmailJobFailed(id: string, error: string, retryCount: number): Promise<void> {
  await prisma.emailJob.updateMany({
    where: { id },
    data: { status: 'failed', error: error.slice(0, MAX_ERROR_LEN), retryCount },
  });
}
