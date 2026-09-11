import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function getCustomers(limit = 1000) {
  return prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getCustomerById(id: string) {
  return prisma.customer.findUnique({ where: { id } });
}

export async function getCustomerByCustomerId(customerId: string) {
  return prisma.customer.findUnique({ where: { customerId } });
}

export async function upsertCustomer(data: any) {
  return prisma.customer.upsert({
    where: { customerId: data.customerId },
    update: data,
    create: data,
  });
}

export async function getCustomersByLifecycle(lifecycle: string) {
  return prisma.customer.findMany({ where: { lifecycle } });
}

export async function getCustomersByCity(city: string) {
  return prisma.customer.findMany({ where: { city } });
}

export interface CustomerPageParams {
  lifecycle?: string;
  status?: string;
  search?: string;
  overdue?: 'true' | 'false';
  page: number;
  pageSize: number;
}

export interface CustomerSummary {
  total: number;
  active: number;
  blocked: number;
  inactive: number;
  churned: number;
  totalMrr: number;
  reminders15: number;
  reminders30: number;
  churnSurveySent: number;
  churnResponses: number;
}

export interface SyncMeta {
  lastSyncAt: number | null;
  lastStatus: string;
  lastError: string;
  invoicesApiDenied: boolean;
}

export interface CustomerWithChurn {
  id: string;
  customerId: string | null;
  customerName: string | null;
  email: string | null;
  billingEmail: string | null;
  phone: string | null;
  login: string | null;
  city: string | null;
  street: string | null;
  status: string | null;
  lifecycle: string | null;
  online: boolean | null;
  lastOnlineAt: number | null;
  lastUpdateAt: number | null;
  mrrTotal: number | null;
  accountType: string | null;
  category: string | null;
  servicePlan: string | null;
  firstSyncedAt: number | null;
  lastSyncAt: number | null;
  lastChangeAt: number | null;
  deleted: boolean;
  reminder15SentAt: number | null;
  reminder30SentAt: number | null;
  churnSurveySentAt: number | null;
  churnSurveyToken: string | null;
  winBackSentAt: number | null;
  winBackToken: string | null;
  churnedAt: number | null;
  inactiveSince: number | null;
  blockedSince: number | null;
  emailOptOut: boolean;
  emailInvalid: boolean;
  overdueInfo: Prisma.JsonValue | null;
  createdAt: number | null;
  updatedAt: number | null;
  btsName: string | null;
  matchState: string | null;
  matchMethod: string | null;
  churnResponse: { rating: number | null; reason: string | null; comment: string | null } | null;
  overdueInvoice: {
    hasOverdueInvoice: boolean;
    overdueDays: number;
    overdueInvoiceCount: number;
    invoiceNumber: string | null;
    invoiceAmount: number;
    lastReminderSentAt: number | null;
    lastReminderType: string | null;
  } | null;
}

export interface CustomerPageResult {
  records: CustomerWithChurn[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: CustomerSummary;
  meta: SyncMeta;
}

export async function getCustomersPage(params: CustomerPageParams): Promise<CustomerPageResult> {
  const { lifecycle, status, search, overdue, page, pageSize } = params;
  const start = (page - 1) * pageSize;

  // Build where clause
  const where: Prisma.CustomerWhereInput = { deleted: false };
  if (lifecycle) where.lifecycle = lifecycle;
  if (status) where.status = status;
  if (search) {
    where.OR = [{ customerName: { contains: search } }, { email: { contains: search } }, { login: { contains: search } }];
  }
  // Invoice is the source of truth for overdue status. Resolve customer IDs
  // before count/pagination so totals and pages remain accurate.
  if (overdue === 'true' || overdue === 'false') {
    const overdueInvoices = await prisma.invoice.findMany({
      where: { isPaid: false, dueDate: { not: null, lte: BigInt(Date.now()) } },
      select: { customerId: true },
    });
    const overdueCustomerIds = [...new Set(overdueInvoices.map((invoice) => invoice.customerId))];
    where.customerId = overdue === 'true' ? { in: overdueCustomerIds } : { notIn: overdueCustomerIds };
  }

  // Get total count for summary
  const totalCount = await prisma.customer.count({ where: { deleted: false } });

  // Get filtered total for pagination
  const filteredTotal = await prisma.customer.count({ where });

  // Get paged records
  let records = await prisma.customer.findMany({
    where,
    orderBy: { customerId: 'desc' },
    skip: start,
    take: pageSize,
  });

  // Get churn responses for paged records
  const customerIds = records.map((r) => r.customerId).filter((id): id is string => id !== null && id !== '');

  let churnByCustomer = new Map<string, { rating: number | null; reason: string | null; comment: string | null }>();
  if (customerIds.length > 0) {
    // Chunk into 10 for 'in' query equivalent
    for (let i = 0; i < customerIds.length; i += 10) {
      const chunk = customerIds.slice(i, i + 10);
      const churns = await prisma.churnSurvey.findMany({
        where: {
          customerId: { in: chunk },
          used: true,
        },
        select: { customerId: true, rating: true, reason: true, comment: true },
      });
      for (const c of churns) {
        churnByCustomer.set(c.customerId, {
          rating: c.rating ?? null,
          reason: c.reason ?? null,
          comment: c.comment ?? null,
        });
      }
    }
  }

  // Get sync metadata
  const syncLock = await prisma.syncLock.findUnique({ where: { id: 'splynx-hourly-sync' } });
  const splynxMeta = await prisma.splynxMeta.findUnique({ where: { id: 'sync' } });

  // Build summary
  const allRecords = await prisma.customer.findMany({
    where: { deleted: false },
    select: {
      lifecycle: true,
      mrrTotal: true,
      reminder15SentAt: true,
      reminder30SentAt: true,
      churnSurveySentAt: true,
    },
  });

  const summary = {
    total: totalCount,
    active: allRecords.filter((r) => r.lifecycle === 'active').length,
    blocked: allRecords.filter((r) => r.lifecycle === 'blocked').length,
    inactive: allRecords.filter((r) => r.lifecycle === 'inactive').length,
    churned: allRecords.filter((r) => r.lifecycle === 'churned').length,
    totalMrr: allRecords.reduce((acc, r) => acc + (r.mrrTotal ?? 0), 0),
    reminders15: allRecords.filter((r) => r.reminder15SentAt !== null).length,
    reminders30: allRecords.filter((r) => r.reminder30SentAt !== null).length,
    churnSurveySent: allRecords.filter((r) => r.churnSurveySentAt !== null).length,
    churnResponses: 0, // Will be overwritten below
  };

  // Get churn responses count
  const churnResponsesCount = await prisma.churnSurvey.count({ where: { used: true } });
  summary.churnResponses = churnResponsesCount;

  // Build meta
  const meta = {
    lastSyncAt: syncLock?.lastRunAt ? Number(syncLock.lastRunAt) : null,
    lastStatus: syncLock?.lastStatus || '',
    lastError: syncLock?.lastError || '',
    invoicesApiDenied: splynxMeta?.invoicesApiDenied === true,
  };

  // Map records with churn and overdue.
  // BigInt/Date -> number (epoch ms) so NextResponse.json can serialize
  // (matches the Firestore path's shape where all timestamps are numbers).
  const toNum = (v: bigint | Date | null): number | null => (v === null ? null : v instanceof Date ? v.getTime() : Number(v));

  const recordsWithChurn = records.map((r) => {
    const overdueInfo = r.overdueInfo as
      | {
          hasOverdueInvoice?: boolean;
          overdueDays?: number;
          overdueInvoiceCount?: number;
          invoiceNumber?: string | null;
          invoiceAmount?: number;
          lastReminderSentAt?: number | null;
          lastReminderType?: string | null;
        }
      | null
      | undefined;

    // Generated Prisma client predates the unified tower fields; runtime
    // rows carry them (same cast pattern as runMatching.ts).
    const unified = r as unknown as { btsName: string | null; matchState: string | null; matchMethod: string | null };

    return {
      id: r.id,
      customerId: r.customerId,
      customerName: r.customerName,
      email: r.email,
      billingEmail: r.billingEmail,
      phone: r.phone,
      login: r.login,
      city: r.city,
      street: r.street,
      status: r.status,
      lifecycle: r.lifecycle,
      online: r.online,
      lastOnlineAt: toNum(r.lastOnlineAt),
      lastUpdateAt: toNum(r.lastUpdateAt),
      mrrTotal: r.mrrTotal,
      accountType: r.accountType,
      category: r.category,
      servicePlan: r.servicePlan,
      firstSyncedAt: toNum(r.firstSyncedAt),
      lastSyncAt: toNum(r.lastSyncAt),
      lastChangeAt: toNum(r.lastChangeAt),
      deleted: r.deleted,
      reminder15SentAt: toNum(r.reminder15SentAt),
      reminder30SentAt: toNum(r.reminder30SentAt),
      churnSurveySentAt: toNum(r.churnSurveySentAt),
      churnSurveyToken: r.churnSurveyToken,
      winBackSentAt: toNum(r.winBackSentAt),
      winBackToken: r.winBackToken,
      churnedAt: toNum(r.churnedAt),
      inactiveSince: toNum(r.inactiveSince),
      blockedSince: toNum(r.blockedSince),
      emailOptOut: r.emailOptOut,
      emailInvalid: r.emailInvalid,
      overdueInfo: r.overdueInfo,
      createdAt: toNum(r.createdAt),
      updatedAt: toNum(r.updatedAt),
      btsName: unified.btsName,
      matchState: unified.matchState,
      matchMethod: unified.matchMethod,
      churnResponse: r.customerId ? (churnByCustomer.get(r.customerId) ?? null) : null,
      overdueInvoice: overdueInfo
        ? {
            hasOverdueInvoice: overdueInfo.hasOverdueInvoice === true,
            overdueDays: overdueInfo.overdueDays ?? 0,
            overdueInvoiceCount: overdueInfo.overdueInvoiceCount ?? 0,
            invoiceNumber: overdueInfo.invoiceNumber ?? null,
            invoiceAmount: overdueInfo.invoiceAmount ?? 0,
            lastReminderSentAt: overdueInfo.lastReminderSentAt ?? null,
            lastReminderType: overdueInfo.lastReminderType ?? null,
          }
        : null,
    };
  });

  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  return {
    records: recordsWithChurn,
    total: filteredTotal,
    page: params.page,
    pageSize,
    totalPages,
    summary,
    meta,
  };
}
