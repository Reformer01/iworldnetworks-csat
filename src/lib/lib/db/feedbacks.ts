import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import type { FeedbackDoc } from "@/lib/feedback-types"

type JsonValue = Prisma.InputJsonValue

export async function getFeedbacks(limit = 1000): Promise<FeedbackDoc[]> {
  const rows = await prisma.feedback.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
  })
  return rows.map(mapFeedbackRow)
}

export async function getFeedbackById(id: string): Promise<FeedbackDoc | null> {
  const row = await prisma.feedback.findUnique({ where: { id } })
  return row ? mapFeedbackRow(row) : null
}

export async function createFeedback(data: Partial<FeedbackDoc>): Promise<FeedbackDoc> {
  const row = await prisma.feedback.create({
    data: {
      id: data.id,
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
      timestamp: data.timestamp || BigInt(Date.now()),
      status: data.status || "new",
      resolutionNotes: data.resolutionNotes,
      // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
      aiAnalysis: data.aiAnalysis as JsonValue,
      satisfied: data.satisfied,
      source: data.source,
    },
  })
  return mapFeedbackRow(row)
}

export async function updateFeedback(id: string, data: Partial<FeedbackDoc>): Promise<FeedbackDoc> {
  const row = await prisma.feedback.update({
    where: { id },
    data: {
      ...data,
      // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
      ratings: data.ratings as JsonValue,
      // SAFETY: JsonValue is a subset of Prisma.InputJsonValue.
      aiAnalysis: data.aiAnalysis as JsonValue,
      updatedAt: BigInt(Date.now()),
    },
  })
  return mapFeedbackRow(row)
}

export async function deleteFeedback(id: string): Promise<void> {
  await prisma.feedback.delete({ where: { id } })
}

function mapFeedbackRow(row: any): FeedbackDoc {
  return {
    id: row.id,
    customerName: row.customerName ?? undefined,
    customerEmail: row.customerEmail ?? undefined,
    category: row.category ?? undefined,
    location: row.location ?? undefined,
    servicePlan: row.servicePlan ?? undefined,
    comment: row.comment ?? undefined,
    staffName: row.staffName ?? undefined,
    // SAFETY: Prisma JSON column returns JsonValue-compatible data.
    ratings: row.ratings as unknown as FeedbackDoc['ratings'],
    referralSource: row.referralSource ?? undefined,
    spotlightInterview: row.spotlightInterview ?? undefined,
    serviceDate: row.serviceDate ?? undefined,
    serviceTime: row.serviceTime ?? undefined,
    submissionDate: row.submissionDate ?? undefined,
    timestamp: row.timestamp ? Number(row.timestamp) : undefined,
    status: row.status ?? undefined,
    resolutionNotes: row.resolutionNotes ?? undefined,
    // SAFETY: Prisma JSON column returns JsonValue-compatible data.
    aiAnalysis: row.aiAnalysis as unknown as FeedbackDoc['aiAnalysis'],
    satisfied: row.satisfied ?? undefined,
    source: row.source ?? undefined,
    updatedAt: row.updatedAt ? Number(row.updatedAt) : undefined,
  }
}
