import { prisma } from '@/lib/prisma';

export interface InvoiceFilters {
  customerId?: string | null;
  isPaid?: boolean | null;
  status?: string | null;
  search?: string | null;
  page: number;
  pageSize: number;
}

export async function listInvoices(filters: InvoiceFilters) {
  const where: Record<string, unknown> = {};
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.isPaid !== null && filters.isPaid !== undefined) where.isPaid = filters.isPaid;
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { number: { contains: filters.search } },
      { title: { contains: filters.search } },
      { customerId: { contains: filters.search } },
    ];
  }
  const total = await prisma.invoice.count({ where: where as never });
  const rows = await prisma.invoice.findMany({
    where: where as never,
    orderBy: { dueDate: 'desc' },
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });
  const records = rows.map((r) => ({
    ...r,
    dueDate: r.dueDate != null ? Number(r.dueDate) : null,
    date: r.date != null ? Number(r.date) : null,
    paidAt: r.paidAt != null ? Number(r.paidAt) : null,
    syncedAt: r.syncedAt != null ? Number(r.syncedAt) : null,
  }));
  return { records, total, page: filters.page, pageSize: filters.pageSize, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)) };
}

export async function getInvoiceByCustomer(customerId: string, limit = 50) {
  const rows = await prisma.invoice.findMany({ where: { customerId }, orderBy: { dueDate: 'desc' }, take: limit });
  return rows.map((r) => ({ ...r, dueDate: r.dueDate != null ? Number(r.dueDate) : null, date: r.date != null ? Number(r.date) : null }));
}
