import { prisma } from "@/lib/prisma"
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'

export async function journalBegin(data: { type: string; payload: Prisma.InputJsonValue }) {
  return prisma.journal.create({
    data: {
      id: randomUUID(),
      type: data.type,
      payload: data.payload,
      status: 'pending',
    },
  })
}

export async function journalComplete(id: string, result: Prisma.InputJsonValue) {
  return prisma.journal.update({
    where: { id },
    data: {
      status: 'completed',
      result,
    },
  })
}

export async function journalFail(id: string, error: string) {
  return prisma.journal.update({
    where: { id },
    data: {
      status: 'failed',
      error,
    },
  })
}

export async function sweepStaleJournals(type: string, maxAgeMs = 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs
  return prisma.journal.findMany({
    where: {
      type,
      status: 'pending',
      createdAt: { lt: new Date(cutoff) },
    },
  })
}
