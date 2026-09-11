import { prisma } from "@/lib/prisma"
import { randomUUID } from 'crypto'

export async function createFeedbackToken(data: {
  customerName: string
  customerEmail: string
  servicePlan: string
  location: string
  serviceDate: string
  sourceEvent: string
  category?: string
  staffName?: string
  eventHash?: string
}) {
  const token = randomUUID()
  const now = Date.now()
  const ttlMs = 30 * 24 * 60 * 60 * 1000 // 30 days
  
  await prisma.feedbackToken.create({
    data: {
      id: token,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: data.servicePlan,
      location: data.location,
      serviceDate: data.serviceDate,
      sourceEvent: data.sourceEvent,
      category: data.category || 'Reliability',
      staffName: data.staffName,
      eventHash: data.eventHash,
      used: false,
      createdAt: BigInt(now),
      expiresAt: BigInt(now + ttlMs),
      openedAt: null,
      submittedAt: null,
    },
  })
  return { token }
}

export async function getFeedbackToken(token: string) {
  return prisma.feedbackToken.findUnique({ where: { id: token } })
}

export async function getFeedbackTokenByEventHash(eventHash: string) {
  return prisma.feedbackToken.findFirst({ where: { eventHash }, orderBy: { createdAt: 'desc' } })
}

export async function markTokenOpened(token: string, openedAt: number) {
  return prisma.feedbackToken.update({
    where: { id: token },
    data: { openedAt: BigInt(openedAt) },
  })
}

export async function markTokenUsed(token: string, submittedAt: number) {
  return prisma.feedbackToken.update({
    where: { id: token },
    data: { used: true, submittedAt: BigInt(submittedAt) },
  })
}

export async function validateFeedbackToken(token: string) {
  const record = await prisma.feedbackToken.findUnique({ where: { id: token } })
  if (!record) return { success: false, error: 'Invalid token' }
  if (record.used) return { success: false, error: 'Token already used' }
  if (record.expiresAt && Number(record.expiresAt) < Date.now()) {
    return { success: false, error: 'Token expired' }
  }
  return {
    success: true,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    servicePlan: record.servicePlan,
    location: record.location,
    serviceDate: record.serviceDate,
    sourceEvent: record.sourceEvent,
    category: record.category,
    staffName: record.staffName,
  }
}
