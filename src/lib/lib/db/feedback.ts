import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

type JsonValue = Prisma.InputJsonValue

interface CreateFeedbackInput {
  customerName?: string
  customerEmail?: string
  category?: string
  location?: string
  servicePlan?: string
  comment?: string
  staffName?: string
  ratings?: JsonValue
  referralSource?: string
  spotlightInterview?: string
  serviceDate?: string
  serviceTime?: string
  submissionDate?: string
  timestamp?: number
  status?: string
  resolutionNotes?: string
  aiAnalysis?: JsonValue
  satisfied?: string
  source?: string
}

export async function createFeedback(data: CreateFeedbackInput) {
  return prisma.feedback.create({
    data: {
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      category: data.category,
      location: data.location,
      servicePlan: data.servicePlan,
      comment: data.comment,
      staffName: data.staffName,
      // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
      ratings: data.ratings as JsonValue,
      referralSource: data.referralSource,
      spotlightInterview: data.spotlightInterview,
      serviceDate: data.serviceDate,
      serviceTime: data.serviceTime,
      submissionDate: data.submissionDate,
      timestamp: data.timestamp ? BigInt(data.timestamp) : BigInt(Date.now()),
      status: data.status || 'new',
      resolutionNotes: data.resolutionNotes,
      // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
      aiAnalysis: data.aiAnalysis as JsonValue,
      satisfied: data.satisfied,
      source: data.source,
    },
  })
}

export async function getFeedbacks(limit = 1000) {
  return prisma.feedback.findMany({
    orderBy: { timestamp: 'desc' },
    take: limit,
  })
}

export async function getFeedbackById(id: string) {
  return prisma.feedback.findUnique({ where: { id } })
}

interface UpdateFeedbackInput extends Partial<CreateFeedbackInput> {
  updatedAt?: bigint
}

export async function updateFeedback(id: string, data: UpdateFeedbackInput) {
  return prisma.feedback.update({
    where: { id },
    data: {
      ...data,
      // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
      ratings: data.ratings as JsonValue,
      // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
      aiAnalysis: data.aiAnalysis as JsonValue,
      timestamp: data.timestamp ? BigInt(data.timestamp) : undefined,
      updatedAt: BigInt(Date.now()),
    },
  })
}

export async function deleteFeedback(id: string) {
  return prisma.feedback.delete({ where: { id } })
}

export async function getFeedbacksByCategory(category: string, limit = 1000) {
  return prisma.feedback.findMany({
    where: { category },
    orderBy: { timestamp: 'desc' },
    take: limit,
  })
}
