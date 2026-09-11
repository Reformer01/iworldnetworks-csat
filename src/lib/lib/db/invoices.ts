import { prisma } from "@/lib/prisma"

export async function upsertInvoice(data: {
  invoiceId: string
  customerId: string
  number?: string
  title?: string
  total?: number
  dueDate?: bigint | number | null
  date?: bigint | number | null
  status?: string
  isPaid?: boolean
  paidAt?: bigint | number | null
  reminder15SentAt?: bigint | number | null
  reminder30SentAt?: bigint | number | null
}) {
  return prisma.invoice.upsert({
    where: { invoiceId: data.invoiceId },
    update: {
      customerId: data.customerId,
      number: data.number,
      title: data.title,
      total: data.total ?? 0,
      dueDate: data.dueDate,
      date: data.date,
      status: data.status,
      isPaid: data.isPaid ?? false,
      paidAt: data.paidAt,
      reminder15SentAt: data.reminder15SentAt,
      reminder30SentAt: data.reminder30SentAt,
      syncedAt: BigInt(Date.now()),
    },
    create: {
      invoiceId: data.invoiceId,
      customerId: data.customerId,
      number: data.number,
      title: data.title,
      total: data.total ?? 0,
      dueDate: data.dueDate,
      date: data.date,
      status: data.status,
      isPaid: data.isPaid ?? false,
      paidAt: data.paidAt,
      reminder15SentAt: data.reminder15SentAt,
      reminder30SentAt: data.reminder30SentAt,
      syncedAt: BigInt(Date.now()),
    },
  })
}

export async function getUnpaidInvoices() {
  return prisma.invoice.findMany({
    where: { isPaid: false },
    orderBy: { dueDate: 'asc' },
  })
}

export async function getInvoicesByCustomerId(customerId: string) {
  return prisma.invoice.findMany({
    where: { customerId },
    orderBy: { dueDate: 'asc' },
  })
}

export async function getInvoiceById(invoiceId: string) {
  return prisma.invoice.findUnique({ where: { invoiceId } })
}

export async function markInvoicePaid(invoiceId: string, paidAt: number, total?: number) {
  return prisma.invoice.update({
    where: { invoiceId },
    data: {
      isPaid: true,
      paidAt: BigInt(paidAt),
      status: 'paid',
      ...(total !== undefined ? { total } : {}),
      syncedAt: BigInt(Date.now()),
    },
  })
}

export async function deleteInvoice(invoiceId: string) {
  return prisma.invoice.delete({ where: { invoiceId } })
}

export async function getDeletedInvoices() {
  // This would need a separate tracking mechanism
  // For now, return empty array - deleted invoices are handled via webhook
  return []
}

export async function getAllInvoices() {
  return prisma.invoice.findMany({
    orderBy: { syncedAt: 'desc' },
  })
}
