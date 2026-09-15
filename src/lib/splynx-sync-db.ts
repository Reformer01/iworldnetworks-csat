import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Firestore } from 'firebase-admin/firestore';
import { getAllCustomers, getUnpaidInvoices, getDeletedInvoices, getSupportTickets, parseSplynxApiDate } from './splynx-api';
import type { SplynxInvoice, SplynxTicket } from './splynx-api';
import { getRegionForLocation } from './sales-staff';
import { resolveTicketAssignee } from './splynx-admins';
import { sendInvoiceReminderEmail, sendChurnSurveyEmail, sendFeedbackEmail, sendWinBackEmail } from './email';
import { hasDeliverableEmail } from './email-validity';
import { createFeedbackToken, findRecentFeedbackToken, TOKEN_TTL_MS } from './feedback-token';
import { createEmailJob, markEmailJobSent, markEmailJobFailed } from '@/lib/repositories/email-job-repo';
import { logInfo, logWarn, logError } from './logger';
import { buildCustomerFields, buildCustomerOverdueInfo, daysOverdue, formatDueDate, normalizeInvoiceForOverdue } from './splynx-mirror';
import {
  CHURN_SURVEY_WINDOW_MS,
  WINBACK_WINDOW_MS,
  REMINDER_MAX_OVERDUE_DAYS,
  INACTIVE_CHURN_MS,
  CUSTOMERS_COLLECTION,
  INVOICES_COLLECTION,
  CHURN_COLLECTION,
} from './splynx-mirror-types';
import type {
  MirrorCustomerDoc,
  MirrorInvoiceDoc,
  ChurnSurveyDoc,
  CustomerOverdueInfo,
  Lifecycle,
  ReminderJobResult,
  ChurnJobResult,
  WinBackJobResult,
  FeedbackReminderJobResult,
  SyncStats,
  TicketSyncResult,
} from './splynx-mirror-types';
import { acquireSyncLock, completeSyncRun, setSplynxMeta } from './lib/db/sync';
import { mapCustomer, mapInvoice } from './lib/db/sync-mirror';
import { clearRouteCache } from './route-cache';
import type { PrismaClient } from '@prisma/client';
import { isBundledServicePlan } from './bts-account-type';

type FirestoreData = { [key: string]: string | number | boolean | null | undefined | string[] | number[] | boolean[] | FirestoreData };

// ---------------------------------------------------------------------------
// Dependency injection for testability
// ---------------------------------------------------------------------------

export interface SplynxSyncDbDeps {
  prisma?: PrismaClient;
  getAllCustomers?: typeof getAllCustomers;
  getUnpaidInvoices?: typeof getUnpaidInvoices;
  getDeletedInvoices?: typeof getDeletedInvoices;
  sendInvoiceReminderEmail?: typeof sendInvoiceReminderEmail;
  sendChurnSurveyEmail?: typeof sendChurnSurveyEmail;
  sendFeedbackEmail?: typeof sendFeedbackEmail;
  sendWinBackEmail?: typeof sendWinBackEmail;
  hasDeliverableEmail?: typeof hasDeliverableEmail;
  createFeedbackToken?: typeof createFeedbackToken;
  logInfo?: typeof logInfo;
  logWarn?: typeof logWarn;
  logError?: typeof logError;
  acquireSyncLock?: typeof acquireSyncLock;
  completeSyncRun?: typeof completeSyncRun;
  setSplynxMeta?: typeof setSplynxMeta;
  mapCustomer?: typeof mapCustomer;
  mapInvoice?: typeof mapInvoice;
  clearRouteCache?: typeof clearRouteCache;
  journalBegin?: typeof import('@/lib/journal').journalBegin;
  journalComplete?: typeof import('@/lib/journal').journalComplete;
  journalFail?: typeof import('@/lib/journal').journalFail;
  persistStaffKPIs?: typeof import('@/lib/staff-kpis').persistStaffKPIs;
  getAdminFirestore?: typeof import('@/lib/firebase-admin').getAdminFirestore;
}

// For default Prisma import (lazy to avoid circular)
let defaultPrisma: PrismaClient | null = null;
async function getDefaultPrisma(): Promise<PrismaClient> {
  if (!defaultPrisma) {
    const { prisma } = await import('@/lib/prisma');
    defaultPrisma = prisma;
  }
  return defaultPrisma;
}



const DAY_MS = 24 * 60 * 60 * 1000;
const CHURN_SURVEY_TTL_MS = 30 * DAY_MS;

const CUSTOMER_COMPARE_KEYS = [
  'customerName', 'email', 'billingEmail', 'phone', 'login', 'city', 'street',
  'status', 'lifecycle', 'online', 'lastOnlineAt', 'lastUpdateAt', 'mrrTotal',
  'accountType', 'category', 'servicePlan',
] as const;



let mirrorFs: Firestore | null | undefined;

async function getMirrorFirestore(): Promise<Firestore | null> {
  if (mirrorFs !== undefined) return mirrorFs;
  try {
    const { getAdminFirestore } = await import('@/lib/firebase-admin');
    mirrorFs = getAdminFirestore();
  } catch {
    mirrorFs = null;
  }
  return mirrorFs;
}

async function mirrorCustomerSet(doc: MirrorCustomerDoc): Promise<void> {
  try {
    const fs = await getMirrorFirestore();
    if (!fs) return;
    // SAFETY: MirrorCustomerDoc is a known-key object with JSON-serializable values,
    // matching the FirestoreData contract for document writes.
    await fs.collection(CUSTOMERS_COLLECTION).doc(String(doc.customerId)).set(doc as unknown as FirestoreData);
  } catch (err) {
    logWarn('[splynx-sync-db] Firestore customer mirror failed (best-effort)', {
      customerId: doc.customerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function mirrorCustomerUpdate(customerId: number | string, updates: FirestoreData): Promise<void> {
  try {
    const fs = await getMirrorFirestore();
    if (!fs) return;
    await fs.collection(CUSTOMERS_COLLECTION).doc(String(customerId)).update(updates);
  } catch (err) {
    logWarn('[splynx-sync-db] Firestore customer mirror update failed (best-effort)', {
      customerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function mirrorInvoiceSet(doc: MirrorInvoiceDoc): Promise<void> {
  try {
    const fs = await getMirrorFirestore();
    if (!fs) return;
    // SAFETY: MirrorInvoiceDoc is a known-key object with JSON-serializable values,
    // matching the FirestoreData contract for document writes.
    await fs.collection(INVOICES_COLLECTION).doc(String(doc.invoiceId)).set(doc as unknown as FirestoreData);
  } catch (err) {
    logWarn('[splynx-sync-db] Firestore invoice mirror failed (best-effort)', {
      invoiceId: doc.invoiceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function mirrorInvoiceUpdate(invoiceId: number | string, updates: FirestoreData): Promise<void> {
  try {
    const fs = await getMirrorFirestore();
    if (!fs) return;
    await fs.collection(INVOICES_COLLECTION).doc(String(invoiceId)).update(updates);
  } catch (err) {
    logWarn('[splynx-sync-db] Firestore invoice mirror update failed (best-effort)', {
      invoiceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function mirrorInvoiceDelete(invoiceId: number | string): Promise<void> {
  try {
    const fs = await getMirrorFirestore();
    if (!fs) return;
    await fs.collection(INVOICES_COLLECTION).doc(String(invoiceId)).delete();
  } catch (err) {
    logWarn('[splynx-sync-db] Firestore invoice mirror delete failed (best-effort)', {
      invoiceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function mirrorChurnSurveySet(doc: ChurnSurveyDoc): Promise<void> {
  try {
    const fs = await getMirrorFirestore();
    if (!fs) return;
    await fs.collection(CHURN_COLLECTION).doc(String(doc.customerId)).set(doc as unknown as FirestoreData);
  } catch (err) {
    logWarn('[splynx-sync-db] Firestore churn survey mirror failed (best-effort)', {
      customerId: doc.customerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function mirrorFeedbackTokenSet(token: string, data: {
  customerName: string;
  customerEmail: string;
  sourceEvent: string;
  createdAt: number;
  expiresAt: number;
  location?: string;
}): Promise<void> {
  try {
    const fs = await getMirrorFirestore();
    if (!fs) return;
    await fs.collection('feedback_tokens').doc(token).set({
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: '',
      location: data.location || '',
      serviceDate: '',
      sourceEvent: data.sourceEvent,
      eventHash: '',
      category: 'Billing',
      staffName: '',
      used: false,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      openedAt: null,
      submittedAt: null,
    });
  } catch (err) {
    logWarn('[splynx-sync-db] Firestore feedback token mirror failed (best-effort)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Row <-> doc mappers (MariaDB rows are the source of truth here)
// ---------------------------------------------------------------------------

function toNum(v: bigint | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

export function rowToCustomerDoc(row: {
  customerId: string;
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
  lastOnlineAt: bigint | null;
  lastUpdateAt: bigint | null;
  mrrTotal: number | null;
  accountType: string | null;
  category: string | null;
  servicePlan: string | null;
  firstSyncedAt: bigint | null;
  lastSyncAt: bigint | null;
  lastChangeAt: bigint | null;
  deleted: boolean | null;
  reminder15SentAt: bigint | null;
  reminder30SentAt: bigint | null;
  churnSurveySentAt: bigint | null;
  churnSurveyToken: string | null;
  winBackSentAt: bigint | null;
  winBackToken: string | null;
  churnedAt: bigint | null;
  inactiveSince: bigint | null;
  blockedSince: bigint | null;
  emailOptOut: boolean | null;
  emailInvalid: boolean | null;
  overdueInfo: unknown;
  btsId?: string | null;
  btsName?: string | null;
  uispEndpointId?: string | null;
  uispEndpointName?: string | null;
  uispDeviceStatus?: string | null;
  uispOutageCount?: number | null;
  matchState?: string | null;
  matchMethod?: string | null;
  matchScore?: number | null;
  matchedAt?: bigint | null;
  matchUpdatedAt?: bigint | null;
}): MirrorCustomerDoc {

  const lifecycle: Lifecycle = (row.lifecycle ?? 'active') as Lifecycle;
  const overdueInfo = (row.overdueInfo ?? null) as CustomerOverdueInfo | null;
  return {
    customerId: Number(row.customerId),
    customerName: row.customerName ?? '',
    email: row.email ?? '',
    billingEmail: row.billingEmail ?? '',
    phone: row.phone ?? '',
    login: row.login ?? '',
    city: row.city ?? '',
    street: row.street ?? '',
    status: row.status ?? '',
    lifecycle,
    online: !!row.online,
    lastOnlineAt: toNum(row.lastOnlineAt),
    lastUpdateAt: toNum(row.lastUpdateAt),
    mrrTotal: row.mrrTotal ?? 0,
    accountType: row.accountType ?? 'regular',
    category: row.category ?? '',
    servicePlan: row.servicePlan ?? '',
    firstSyncedAt: toNum(row.firstSyncedAt) ?? 0,
    lastSyncAt: toNum(row.lastSyncAt) ?? 0,
    lastChangeAt: toNum(row.lastChangeAt) ?? 0,
    deleted: !!row.deleted,
    reminder15SentAt: toNum(row.reminder15SentAt),
    reminder30SentAt: toNum(row.reminder30SentAt),
    churnSurveySentAt: toNum(row.churnSurveySentAt),
    churnSurveyToken: row.churnSurveyToken ?? null,
    winBackSentAt: toNum(row.winBackSentAt),
    winBackToken: row.winBackToken ?? null,
    churnedAt: toNum(row.churnedAt),
    inactiveSince: toNum(row.inactiveSince),
    blockedSince: toNum(row.blockedSince),
    emailOptOut: !!row.emailOptOut,
    emailInvalid: !!row.emailInvalid,
    overdueInfo,
    btsId: row.btsId,
    btsName: row.btsName,
    uispEndpointId: row.uispEndpointId,
    uispEndpointName: row.uispEndpointName,
    uispDeviceStatus: row.uispDeviceStatus,
    uispOutageCount: row.uispOutageCount,
    matchState: row.matchState,
    matchMethod: row.matchMethod,
    matchScore: row.matchScore,
    matchedAt: toNum(row.matchedAt),
    matchUpdatedAt: toNum(row.matchUpdatedAt),
  };
}

export function rowToInvoiceDoc(row: {
  invoiceId: string;
  customerId: string;
  number: string | null;
  title: string | null;
  total: number | null;
  dueDate: bigint | null;
  date: bigint | null;
  status: string | null;
  isPaid: boolean | null;
  paidAt: bigint | null;
  reminder15SentAt: bigint | null;
  reminder30SentAt: bigint | null;
  syncedAt: bigint | null;
}): MirrorInvoiceDoc {
  return {
    invoiceId: Number(row.invoiceId),
    customerId: Number(row.customerId),
    number: row.number ?? '',
    title: row.title ?? '',
    total: row.total ?? 0,
    dueDate: toNum(row.dueDate),
    date: toNum(row.date),
    status: row.status ?? '',
    isPaid: !!row.isPaid,
    paidAt: toNum(row.paidAt),
    reminder15SentAt: toNum(row.reminder15SentAt),
    reminder30SentAt: toNum(row.reminder30SentAt),
    syncedAt: toNum(row.syncedAt) ?? 0,
  };
}




// Customer reconcile



export function buildCustomerDoc(
  prev: MirrorCustomerDoc | undefined,
  fields: Partial<MirrorCustomerDoc>,
  now: number,
): MirrorCustomerDoc {
  const prevLifecycle = prev?.lifecycle ?? 'active';
  let lifecycle: Lifecycle = (fields.lifecycle ?? 'active') as Lifecycle;
  if (prevLifecycle === 'churned' && lifecycle === 'inactive') {
    lifecycle = 'churned';
  } else if (lifecycle === 'inactive') {
    if (prev?.inactiveSince && now - prev.inactiveSince >= INACTIVE_CHURN_MS) {
      lifecycle = 'churned';
    }
  }

  let churnedAt = prev?.churnedAt ?? null;
  let inactiveSince = prev?.inactiveSince ?? null;
  let blockedSince = prev?.blockedSince ?? null;
  if (lifecycle === 'churned' && prevLifecycle !== 'churned' && !churnedAt) churnedAt = now;
  else if (lifecycle !== 'churned' && prevLifecycle === 'churned') churnedAt = null;
  if (lifecycle === 'inactive' && prevLifecycle !== 'inactive' && !inactiveSince) inactiveSince = now;
  else if (lifecycle !== 'inactive' && prevLifecycle === 'inactive') inactiveSince = null;
  if (lifecycle === 'blocked' && prevLifecycle !== 'blocked' && !blockedSince) blockedSince = now;
  else if (lifecycle !== 'blocked' && prevLifecycle === 'blocked') blockedSince = null;


  const preserveBundle = !!prev && isBundledServicePlan(prev.servicePlan) && !isBundledServicePlan(fields.servicePlan);
  const nextMrrTotal = preserveBundle
    ? prev?.mrrTotal ?? 0
    : (fields.mrrTotal ?? 0) > 0 ? fields.mrrTotal ?? 0 : prev?.mrrTotal ?? 0;
  const nextServicePlan = preserveBundle ? prev?.servicePlan ?? '' : fields.servicePlan || prev?.servicePlan || '';

  const changed = !prev || CUSTOMER_COMPARE_KEYS.some((key) => {
    const a = prev?.[key as keyof MirrorCustomerDoc];
    const b = fields[key as keyof MirrorCustomerDoc];
    if (key === 'lifecycle') return a !== lifecycle;
    if (key === 'mrrTotal') return a !== nextMrrTotal;
    if (key === 'servicePlan') return a !== nextServicePlan;
    return a !== b;
  });

  return {
    customerId: fields.customerId ?? prev?.customerId ?? 0,
    customerName: fields.customerName ?? prev?.customerName ?? '',
    email: fields.email ?? prev?.email ?? '',
    billingEmail: fields.billingEmail ?? prev?.billingEmail ?? '',
    phone: fields.phone ?? prev?.phone ?? '',
    login: fields.login ?? prev?.login ?? '',
    city: fields.city ?? prev?.city ?? '',
    street: fields.street ?? prev?.street ?? '',
    status: fields.status ?? prev?.status ?? '',
    lifecycle,
    online: fields.online ?? prev?.online ?? false,
    lastOnlineAt: fields.lastOnlineAt ?? prev?.lastOnlineAt ?? null,
    lastUpdateAt: fields.lastUpdateAt ?? prev?.lastUpdateAt ?? null,
 
    mrrTotal: nextMrrTotal,
    accountType: fields.accountType ?? prev?.accountType ?? 'regular',
    category: fields.category ?? prev?.category ?? '',
    servicePlan: nextServicePlan,
    firstSyncedAt: prev?.firstSyncedAt ?? now,
    lastSyncAt: now,
    lastChangeAt: changed ? now : prev?.lastChangeAt ?? now,
    deleted: false,
    reminder15SentAt: prev?.reminder15SentAt ?? null,
    reminder30SentAt: prev?.reminder30SentAt ?? null,
    churnSurveySentAt: prev?.churnSurveySentAt ?? null,
    churnSurveyToken: prev?.churnSurveyToken ?? null,
    winBackSentAt: prev?.winBackSentAt ?? null,
    winBackToken: prev?.winBackToken ?? null,
    churnedAt,
    inactiveSince,
    blockedSince,
    emailOptOut: prev?.emailOptOut ?? false,
    emailInvalid: prev?.emailInvalid ?? false,
    overdueInfo: prev?.overdueInfo ?? null,

    btsId: prev?.btsId ?? null,
    btsName: prev?.btsName ?? fields.btsName ?? null,
    uispEndpointId: prev?.uispEndpointId ?? null,
    uispEndpointName: prev?.uispEndpointName ?? null,
    uispDeviceStatus: prev?.uispDeviceStatus ?? null,
    uispOutageCount: prev?.uispOutageCount ?? null,
    matchState: prev?.matchState ?? null,
    matchMethod: prev?.matchMethod ?? null,
    matchScore: prev?.matchScore ?? null,
    matchedAt: prev?.matchedAt ?? null,
    matchUpdatedAt: prev?.matchUpdatedAt ?? null,
  };
}








export async function reconcileCustomersDb(now = Date.now()): Promise<{ upserted: number; deleted: number; fetched: number }> {
  const records = await getAllCustomers();
  const existingRows = await prisma.customer.findMany();
  const existing = new Map<string, MirrorCustomerDoc>();
  for (const row of existingRows) existing.set(String(row.customerId), rowToCustomerDoc(row));

  let upserted = 0;
  const seen = new Set<string>();
  for (const record of records) {
    const idKey = String(record.id);
    seen.add(idKey);
    const prev = existing.get(idKey);
    const fields = buildCustomerFields(record, now);
    const doc = buildCustomerDoc(prev, fields, now);
    if (prev && !docChanged(prev, doc)) continue;
    await prisma.customer.upsert({
      where: { customerId: idKey },
      update: mapCustomer(doc),
      create: mapCustomer(doc),
    });
    await mirrorCustomerSet(doc);
    upserted++;
  }

  let deleted = 0;
  for (const [idKey, prev] of existing.entries()) {
    if (prev.deleted || seen.has(idKey)) continue;
    await prisma.customer.update({
      where: { customerId: idKey },
      data: { deleted: true, lastChangeAt: BigInt(now) },
    });
    await mirrorCustomerUpdate(idKey, { deleted: true, lastChangeAt: now });
    deleted++;
  }

  return { upserted, deleted, fetched: records.length };
}

export function docChanged(prev: MirrorCustomerDoc, next: MirrorCustomerDoc): boolean {
  if (prev.lastChangeAt !== next.lastChangeAt) return true;
  return CUSTOMER_COMPARE_KEYS.some((key) => {
    const a = prev[key as keyof MirrorCustomerDoc];
    const b = next[key as keyof MirrorCustomerDoc];
    return a !== b;
  });
}





// Invoice reconcile

export async function reconcileInvoicesDb(now = Date.now()): Promise<{ upserted: number; denied: boolean; fetched: number }> {
  let unpaid: SplynxInvoice[];
  try {
    unpaid = await getUnpaidInvoices();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403')) {
      await setSplynxMeta({ invoicesApiDenied: true, deniedAt: now });
      return { upserted: 0, denied: true, fetched: 0 };
    }
    throw err;
  }

  let deleted: SplynxInvoice[];
  try {
    deleted = await getDeletedInvoices();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403')) {
      await setSplynxMeta({ invoicesApiDenied: true, deniedAt: now });
      return { upserted: 0, denied: true, fetched: 0 };
    }
    throw err;
  }

  await setSplynxMeta({ invoicesApiDenied: false, lastInvoiceSyncAt: now });

  const existingRows = await prisma.invoice.findMany();
  const existing = new Map<string, MirrorInvoiceDoc>();
  for (const row of existingRows) existing.set(String(row.invoiceId), rowToInvoiceDoc(row));

  const deletedIds = new Set(deleted.map((inv) => String(inv.id)));

  let upserted = 0;
  for (const invoice of unpaid) {
    const idKey = String(invoice.id);
    const prev = existing.get(idKey);
    const doc: MirrorInvoiceDoc = {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      number: invoice.number,
      title: invoice.title,
      total: invoice.total,
      dueDate: invoice.dueDate,
      date: invoice.date,
      status: invoice.status,
      isPaid: invoice.isPaid,
      paidAt: invoice.paidAt,
      reminder15SentAt: prev?.reminder15SentAt ?? null,
      reminder30SentAt: prev?.reminder30SentAt ?? null,
      syncedAt: now,
    };
    if (prev) {
      const same = ['number', 'title', 'total', 'dueDate', 'date', 'status', 'isPaid', 'paidAt']
        .every((key) => {
          const a = prev[key as keyof MirrorInvoiceDoc];
          const b = doc[key as keyof MirrorInvoiceDoc];
          return a === b;
        });
      if (same) continue;
    }
    await prisma.invoice.upsert({
      where: { invoiceId: idKey },
      update: mapInvoice(doc),
      create: mapInvoice(doc),
    });
    await mirrorInvoiceSet(doc);
    upserted++;
  }

  // Prune invoices deleted in Splynx 
  for (const idKey of deletedIds) {
    if (!existing.has(idKey)) continue;
    await prisma.invoice.delete({ where: { invoiceId: idKey } });
    await mirrorInvoiceDelete(idKey);
  }

  // Denormalize the overdue summary onto customer rows so admin list pages never scan the invoice table.
  const freshByCustomer = new Map<number, SplynxInvoice[]>();
  for (const inv of unpaid) {
    const bucket = freshByCustomer.get(inv.customerId) || [];
    bucket.push(inv);
    freshByCustomer.set(inv.customerId, bucket);
  }
  const existingByCustomer = new Map<number, Set<string>>();
  for (const [idKey, prev] of existing.entries()) {
    const cid = Number(prev.customerId);
    if (!Number.isFinite(cid) || cid === 0) continue;
    const bucket = existingByCustomer.get(cid) || new Set<string>();
    bucket.add(idKey);
    existingByCustomer.set(cid, bucket);
  }
  for (const [cid, fresh] of freshByCustomer) {
    const normalized = fresh.map((inv) => normalizeInvoiceForOverdue(inv, existing.get(String(inv.id)), now));
    await prisma.customer.update({
      where: { customerId: String(cid) },
      data: { overdueInfo: buildCustomerOverdueInfo(normalized, now) as unknown as Prisma.InputJsonValue },
    });
  }

  for (const [cid] of existingByCustomer) {
    if (!freshByCustomer.has(cid)) {
      await prisma.customer.update({
        where: { customerId: String(cid) },
        data: { overdueInfo: buildCustomerOverdueInfo([], now) as unknown as Prisma.InputJsonValue },
      });
    }
  }

  return { upserted, denied: false, fetched: unpaid.length + deleted.length + existingRows.length };
}

// Ticket reconcile (Splynx helpdesk → Ticket table)






const TICKET_PAGE_SIZE = 1000;
const TICKET_MAX_PAGES = 20;

const TICKET_SLA_BREACH_MS = 90 * 60 * 1000;
const TICKET_PRIORITY_MAP: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 4, critical: 5 };

export interface TicketCustomerLink {
  name: string;
  email: string;
  city: string;
  btsId: string | null;
  btsName: string | null;
}


export function mapSplynxTicket(
  t: SplynxTicket,
  now: number,
  customer: TicketCustomerLink | null,
): {
  id: string;
  ticketNumber: number;
  customerName: string | null;
  customerEmail: string | null;
  location: string | null;
  region: string | null;
  bts: string | null;
  complaintType: string | null;
  description: string | null;
  assignedTo: string | null;
  status: string;
  createdAt: bigint | null;
  updatedAt: bigint | null;
  resolvedAt: bigint | null;
  deletedAt: bigint | null;
  slaBreached: boolean;
  priority: number | null;
} {
  const splynxId = Number(t.id) || 0;
  const trashed = String(t.trash) === '1';
  const closed = String(t.closed) === '1';
  const createdAt = parseSplynxApiDate(t.created_at);
  const updatedAt = parseSplynxApiDate(t.updated_at);
  const resolvedAt = closed ? updatedAt : null;
  // SLA clocks against resolution (or now while still open).
  const slaBreached = createdAt != null && (resolvedAt ?? now) - createdAt > TICKET_SLA_BREACH_MS;
  const subject = String(t.subject ?? '').trim();
  const note = String(t.note ?? '').trim();
  const priorityKey = String(t.priority ?? '').toLowerCase();
  return {
    id: `splynx-${splynxId}`,
    ticketNumber: splynxId,
    customerName: customer?.name || null,
    customerEmail: customer?.email || null,
    location: customer?.city || null,
    region: customer?.city ? getRegionForLocation(customer.city) : null,
    bts: customer?.btsName || null,
    complaintType: null,
    description: note ? `${subject}\n\n${note}` : subject || null,
    assignedTo: resolveTicketAssignee(t.assign_to),
    status: closed ? 'closed' : 'open',
    createdAt: createdAt != null ? BigInt(createdAt) : null,
    updatedAt: updatedAt != null ? BigInt(updatedAt) : BigInt(now),
    resolvedAt: resolvedAt != null ? BigInt(resolvedAt) : null,
    deletedAt: trashed ? (updatedAt != null ? BigInt(updatedAt) : BigInt(now)) : null,
    slaBreached,
    priority: TICKET_PRIORITY_MAP[priorityKey] ?? null,
  };
}

const TICKET_COMPARE_KEYS = [
  'customerName', 'customerEmail', 'location', 'region', 'bts', 'description',
  'assignedTo', 'status', 'createdAt', 'updatedAt', 'resolvedAt', 'deletedAt',
  'slaBreached', 'priority',
] as const;

export async function reconcileTicketsDb(now = Date.now()): Promise<TicketSyncResult> {
  const result: TicketSyncResult = { upserted: 0, trashed: 0, fetched: 0, denied: false };
  const all: SplynxTicket[] = [];
  try {
    for (let page = 0; page < TICKET_MAX_PAGES; page++) {
      const batch = await getSupportTickets(TICKET_PAGE_SIZE, page * TICKET_PAGE_SIZE);
      all.push(...batch);
      if (batch.length < TICKET_PAGE_SIZE) break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403')) {
      logWarn('[tickets] Splynx tickets API denied (403) — skipping ticket sync');
      return { ...result, denied: true };
    }
    throw err;
  }
  result.fetched = all.length;

  // Enrich from the unified customer roster (Splynx customer_id → row).
  const customerRows = await prisma.customer.findMany({
    select: { customerId: true, customerName: true, email: true, city: true, btsId: true, btsName: true },
  });
  const customerMap = new Map<string, TicketCustomerLink>();
  for (const r of customerRows) {
    customerMap.set(String(r.customerId), {
      name: r.customerName || '',
      email: r.email || '',
      city: r.city || '',
      btsId: r.btsId ?? null,
      btsName: r.btsName ?? null,
    });
  }

  const existingRows = await prisma.ticket.findMany({
    where: { id: { startsWith: 'splynx-' } },
    select: {
      id: true, customerName: true, customerEmail: true, location: true, region: true,
      bts: true, description: true, assignedTo: true, status: true, createdAt: true,
      updatedAt: true, resolvedAt: true, deletedAt: true, slaBreached: true, priority: true,
    },
  });
  const existing = new Map(existingRows.map((r) => [r.id, r]));

  for (const t of all) {
    const splynxId = Number((t as SplynxTicket).id) || 0;
    if (!splynxId) continue;
    const cid = Number((t as SplynxTicket).customer_id) || 0;
    const mapped = mapSplynxTicket(t as SplynxTicket, now, cid ? customerMap.get(String(cid)) ?? null : null);
    const prev = existing.get(mapped.id);
    if (prev) {
      const same = TICKET_COMPARE_KEYS.every((key) => {
        const a = prev[key as keyof typeof prev];
        const b = mapped[key as keyof typeof mapped];
        return String(a ?? '') === String(b ?? '');
      });
      if (same) continue;
    }
    const { id, ...data } = mapped;
    await prisma.ticket.upsert({ where: { id }, update: data, create: { id, ...data } });
    result.upserted++;
    if (mapped.deletedAt !== null) result.trashed++;
  }

  logInfo('[tickets] reconcile finished', { ...result });
  return result;
}

// ---------------------------------------------------------------------------
// Email jobs (scan MariaDB)
// ---------------------------------------------------------------------------


export async function runReminderJobDb(now = Date.now(), unpaidRows?: Array<{ invoiceId: string; customerId: string; number: string | null; title: string | null; total: number | null; dueDate: bigint | null; date: bigint | null; status: string | null; isPaid: boolean | null; paidAt: bigint | null; reminder15SentAt: bigint | null; reminder30SentAt: bigint | null; syncedAt: bigint | null }>): Promise<ReminderJobResult> {
  const result: ReminderJobResult = { sent15: 0, sent30: 0, skippedOptOut: 0, skippedInvalid: 0, skippedChurned: 0, skippedStale: 0, skippedConnected: 0 };
  const unpaid = unpaidRows ?? (await prisma.invoice.findMany({ where: { isPaid: false } }));
  if (!unpaid.length) return result;

  // Group by customer, then pick one representative invoice per threshold
  type UnpaidRow = (typeof unpaid)[number] & { _overdue: number };
  const byCustomer = new Map<number, { needs15: UnpaidRow[]; needs30: UnpaidRow[] }>();
  for (const row of unpaid) {
    const dueDate = toNum(row.dueDate);
    if (!dueDate) continue;
    const overdue = daysOverdue(dueDate, now);
    if (overdue > REMINDER_MAX_OVERDUE_DAYS) {
      result.skippedStale++;
      continue;
    }
    const needs15 = overdue >= 15 && overdue < 30 && row.reminder15SentAt === null;
    const needs30 = overdue >= 30 && row.reminder30SentAt === null;
    if (!needs15 && !needs30) continue;
    const cid = Number(row.customerId);
    if (!Number.isFinite(cid)) continue;
    const entry = byCustomer.get(cid) || { needs15: [], needs30: [] };
    if (needs15) entry.needs15.push({ ...row, _overdue: overdue });
    if (needs30) entry.needs30.push({ ...row, _overdue: overdue });
    byCustomer.set(cid, entry);
  }
  if (byCustomer.size === 0) return result;

  const customerIds = [...byCustomer.keys()];
  const customerRows = await prisma.customer.findMany({ where: { customerId: { in: customerIds.map(String) } } });
  const customerMap = new Map<string, (typeof customerRows)[number]>();
  for (const r of customerRows) customerMap.set(String(r.customerId), r);

  for (const [cid, buckets] of byCustomer) {
    const customerRow = customerMap.get(String(cid));
    if (!customerRow || !customerRow.email) continue;
    const lifecycle = customerRow.lifecycle || 'active';
    if (lifecycle === 'churned') {
      result.skippedChurned++;
      continue;
    }
    // Disconnected-only: Splynx must have cut them (blocked/inactive) AND they must have
    // no current access (online == Splynx last_online within 30d). Overdue customers who
    // still have access are still-paying customers with balances — never remind them.
    if (lifecycle !== 'blocked' && lifecycle !== 'inactive') {
      result.skippedConnected!++;
      continue;
    }
    if (customerRow.online) {
      result.skippedConnected!++;
      continue;
    }
    if (customerRow.emailOptOut) {
      result.skippedOptOut++;
      continue;
    }
    if (!(await hasDeliverableEmail(customerRow.email))) {
      await prisma.customer.update({ where: { customerId: String(cid) }, data: { emailInvalid: true } });
      await mirrorCustomerUpdate(cid, { emailInvalid: true });
      result.skippedInvalid++;
      continue;
    }

    // Send at most one 15d and one 30d per customer per run — never joined
    const toSend: Array<{ type: '15d' | '30d'; row: (typeof unpaid)[number]; overdue: number }> = [];
    if (buckets.needs30.length > 0) {
      const mostOverdue = [...buckets.needs30].sort((a, b) => b._overdue - a._overdue)[0];
      toSend.push({ type: '30d', row: mostOverdue, overdue: mostOverdue._overdue });
    }
    if (buckets.needs15.length > 0) {
      const mostOverdue = [...buckets.needs15].sort((a, b) => b._overdue - a._overdue)[0];
      toSend.push({ type: '15d', row: mostOverdue, overdue: mostOverdue._overdue });
    }

    for (const { type, row, overdue } of toSend) {
      const emailInvoices = [
        {
          invoiceNumber: String(row.number || Number(row.invoiceId) || ''),
          amount: row.total || 0,
          dueDate: formatDueDate(Number(row.dueDate)),
          daysOverdue: overdue,
        },
      ];
      // Create the audit row first so the send is always traceable, then mark the
      // terminal state — a sent email must never sit in `pending` (Kunike/Ajumobi).
      const emailJobId = await createEmailJob({
        type: 'invoice_reminder',
        customerId: String(cid),
        customerEmail: customerRow.email!,
        customerName: customerRow.customerName || '',
        payload: { invoices: emailInvoices, reminderType: type },
      });
      try {
        await sendInvoiceReminderEmail({
          to: customerRow.email!,
          customerName: customerRow.customerName || '',
          invoices: emailInvoices,
          reminderType: type,
        });
        await markEmailJobSent(emailJobId);
        if (type === '30d') {
          const updated = await prisma.invoice.updateMany({
            where: { invoiceId: String(row.invoiceId), reminder30SentAt: null },
            data: { reminder30SentAt: BigInt(now), reminder15SentAt: BigInt(now) },
          });
          if (updated.count > 0) {
            await mirrorInvoiceUpdate(String(row.invoiceId), { reminder30SentAt: now, reminder15SentAt: now });
            result.sent30++;
          }
        } else {
          const updated = await prisma.invoice.updateMany({
            where: { invoiceId: String(row.invoiceId), reminder15SentAt: null },
            data: { reminder15SentAt: BigInt(now) },
          });
          if (updated.count > 0) {
            await mirrorInvoiceUpdate(String(row.invoiceId), { reminder15SentAt: now });
            result.sent15++;
          }
        }
      } catch (err) {
        await markEmailJobFailed(emailJobId, err instanceof Error ? err.message : String(err), 0);
        logWarn('[reminder] email failed', { customerId: cid, error: String(err) });
      }
    }
  }

  return result;
}

/** Churn survey — disabled per product decision (win-back covers retention). */
export async function runChurnSurveyJobDb(baseUrl: string, now = Date.now()): Promise<ChurnJobResult> {
  void baseUrl;
  void now;
  return { sent: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedInvalid: 0, skippedStale: 0, scanned: 0 };
}

export async function _legacyRunChurnSurveyJobDb(baseUrl: string, now = Date.now()): Promise<ChurnJobResult> {
  const result: ChurnJobResult = { sent: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedInvalid: 0, skippedStale: 0, scanned: 0 };
  const churned = await prisma.customer.findMany({ where: { lifecycle: 'churned' } });
  result.scanned = churned.length;

  for (const row of churned) {
    if (row.deleted) continue;
    // Only survey recent churn — never people who left months/years ago.
    const churnedAt = toNum(row.churnedAt);
    if (!churnedAt || now - churnedAt > CHURN_SURVEY_WINDOW_MS) {
      result.skippedStale++;
      continue;
    }
    if (row.emailOptOut) {
      result.skippedOptOut++;
      continue;
    }
    if (!row.email) {
      result.skippedNoEmail++;
      continue;
    }
    if (!(await hasDeliverableEmail(row.email))) {
      await prisma.customer.update({ where: { customerId: String(row.customerId) }, data: { emailInvalid: true } });
      await mirrorCustomerUpdate(row.customerId, { emailInvalid: true });
      result.skippedInvalid++;
      continue;
    }
    // Pre-check: skip if already surveyed (atomic update is safety net for races)
    if (row.churnSurveySentAt !== null) continue;

    const token = randomUUID();
    const expiresAt = now + CHURN_SURVEY_TTL_MS;
    const surveyDoc: ChurnSurveyDoc = {
      customerId: Number(row.customerId),
      customerName: row.customerName || 'Customer',
      customerEmail: row.email,
      sentAt: now,
      expiresAt,
      used: false,
      submittedAt: null,
      rating: null,
      reason: null,
      comment: null,
    };

    try {
      // Track email in audit log
      await createEmailJob({
        type: 'churn_survey',
        customerId: String(row.customerId),
        customerEmail: row.email,
        customerName: row.customerName || 'there',
        payload: { churnUrl: `${baseUrl}/churn?token=${token}` },
      });
      await sendChurnSurveyEmail({
        to: row.email,
        customerName: row.customerName || 'there',
        churnUrl: `${baseUrl}/churn?token=${token}`,
      });
      await prisma.churnSurvey.create({
        data: {
          id: token,
          customerId: String(surveyDoc.customerId),
          customerName: surveyDoc.customerName,
          customerEmail: surveyDoc.customerEmail,
          sentAt: BigInt(surveyDoc.sentAt),
          expiresAt: BigInt(surveyDoc.expiresAt),
          used: false,
          submittedAt: null,
          rating: null,
          reason: null,
          comment: null,
          clientIp: null,
        },
      });
      // Atomic check-and-set: only update if churnSurveySentAt is still null
      const updated = await prisma.customer.updateMany({
        where: {
          customerId: String(row.customerId),
          churnSurveySentAt: null,
        },
        data: { churnSurveySentAt: BigInt(now), churnSurveyToken: token },
      });
      if (updated.count > 0) {
        await mirrorChurnSurveySet(surveyDoc);
        await mirrorCustomerUpdate(row.customerId, { churnSurveySentAt: now, churnSurveyToken: token });
        result.sent++;
      } else {
        logWarn('[churn] survey already sent by another process', { customerId: row.customerId });
      }
    } catch (err) {
      logWarn('[churn] survey email failed', { customerId: row.customerId, error: String(err) });
    }
  }

  return result;
}

/**
 * Queue one "We've Missed You" win-back email per qualifying customer (idempotent).
 * STRICT audience: lifecycle inactive/blocked for 90+ days AND currently offline
 * (no access). Churned, active, and recently-blocked customers never qualify.
 * Nothing sends directly — every job is created as pending_approval and only a
 * super-admin approval enqueues it for delivery.
 */
export async function runWinBackJobDb(baseUrl: string, now = Date.now()): Promise<WinBackJobResult> {
  const THREE_MONTHS_MS = 90 * DAY_MS;
  const result: WinBackJobResult = { sent: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedInvalid: 0, skippedStale: 0, scanned: 0 };
  const candidates = await prisma.customer.findMany({ where: { lifecycle: { in: ['inactive', 'blocked'] } } });
  result.scanned = candidates.length;

  for (const row of candidates) {
    if (row.deleted) continue;
    // Duration gate: inactive needs inactiveSince 90d+, blocked needs blockedSince 90d+.
    const since = toNum(row.lifecycle === 'blocked' ? row.blockedSince : row.inactiveSince);
    if (!since || now - since < THREE_MONTHS_MS) {
      result.skippedStale++;
      continue;
    }
    // Disconnected-only: anyone still online has access — never win them back.
    if (row.online) {
      result.skippedStale++;
      continue;
    }
    if (row.emailOptOut) {
      result.skippedOptOut++;
      continue;
    }
    if (!row.email) {
      result.skippedNoEmail++;
      continue;
    }
    if (!(await hasDeliverableEmail(row.email))) {
      await prisma.customer.update({ where: { customerId: String(row.customerId) }, data: { emailInvalid: true } });
      await mirrorCustomerUpdate(row.customerId, { emailInvalid: true });
      result.skippedInvalid++;
      continue;
    }
    // Pre-check: skip if already sent (atomic update is safety net for races)
    if (row.winBackSentAt !== null) continue;

    try {
      // Mint one feedback token per customer so the popup link works and
      // the response lands in the admin feedback views.
      const fs = await getMirrorFirestore();
      const { token } = await createFeedbackToken(fs, {
        customerName: row.customerName || '',
        customerEmail: row.email,
        servicePlan: row.servicePlan || '',
        location: row.city || '',
        category: 'Reliability',
        sourceEvent: 'winback',
        eventHash: `winback-${row.customerId}`,
      });
      // Require super-admin approval before sending — create as pending_approval and do NOT auto-send.
      // The payload carries the pre-minted token + final links so the worker sends
      // exactly what was approved (no re-mint, no audit mismatch).
      await createEmailJob({
        type: 'winback',
        customerId: String(row.customerId),
        customerEmail: row.email,
        customerName: row.customerName || 'there',
        payload: {
          portalUrl: 'https://portal.iwn.ng',
          csatUrl: baseUrl,
          feedbackUrl: `${baseUrl}/feedback/popup?token=${token}&embed=true`,
          winBackToken: token,
        },
        status: 'pending_approval',
      });
      // Atomic check-and-set: only update if winBackSentAt is still null
      const updated = await prisma.customer.updateMany({
        where: {
          customerId: String(row.customerId),
          winBackSentAt: null,
        },
        data: { winBackSentAt: BigInt(now), winBackToken: token },
      });
      if (updated.count > 0) {
        await mirrorCustomerUpdate(row.customerId, { winBackSentAt: now, winBackToken: token });
        result.sent++;
      } else {
        logWarn('[winback] email already sent by another process', { customerId: row.customerId });
      }
    } catch (err) {
      logWarn('[winback] email failed', { customerId: row.customerId, error: String(err) });
    }
  }

  return result;
}

/** Send one feedback link per customer whose invoice was just paid (once per month). */
export async function runOverdueFeedbackReminderJobDb(
  baseUrl: string,
  now = Date.now(),
  unpaidRows?: Array<{ invoiceId: string; customerId: string; number: string | null; title: string | null; total: number | null; dueDate: bigint | null; date: bigint | null; status: string | null; isPaid: boolean | null; paidAt: bigint | null; reminder15SentAt: bigint | null; reminder30SentAt: bigint | null; syncedAt: bigint | null }>,
): Promise<FeedbackReminderJobResult> {
  void unpaidRows;
  const result: FeedbackReminderJobResult = { sent: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedInvalid: 0, skippedNoOverdue: 0, skippedChurned: 0 };

  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();

  const paidThisMonth = await prisma.invoice.findMany({
    where: { isPaid: true, paidAt: { gte: BigInt(monthStartMs) } },
    select: { customerId: true, paidAt: true },
  });
  if (!paidThisMonth.length) return result;

  const paidCustomerIds = new Set<number>();
  for (const row of paidThisMonth) {
    const cid = Number(row.customerId);
    if (Number.isFinite(cid)) paidCustomerIds.add(cid);
  }
  if (paidCustomerIds.size === 0) return result;

  const customerIds = [...paidCustomerIds];
  const customerRows = await prisma.customer.findMany({ where: { customerId: { in: customerIds.map(String) } } });
  const customerMap = new Map<string, { email: string; name: string; optOut: boolean; lifecycle: string; city: string }>();
  for (const row of customerRows) {
    customerMap.set(String(row.customerId), {
      email: row.email || '',
      name: row.customerName || '',
      optOut: !!row.emailOptOut,
      lifecycle: row.lifecycle || 'active',
      city: row.city || '',
    });
  }

  for (const customerId of customerIds) {
    const customer = customerMap.get(String(customerId));
    if (!customer || !customer.email) {
      result.skippedNoEmail++;
      continue;
    }
    if (customer.lifecycle === 'churned') {
      result.skippedChurned++;
      continue;
    }
    if (customer.optOut) {
      result.skippedOptOut++;
      continue;
    }
    if (!(await hasDeliverableEmail(customer.email))) {
      await prisma.customer.update({ where: { customerId: String(customerId) }, data: { emailInvalid: true } });
      await mirrorCustomerUpdate(customerId, { emailInvalid: true });
      result.skippedInvalid++;
      continue;
    }

    // Once per month per customer when they have a paid invoice
    const monthKey = new Date(now).toISOString().slice(0, 7);
    const sourceEvent = `paid-feedback:${customerId}:${monthKey}`;
    const recent = await findRecentFeedbackToken(customer.email, sourceEvent, 30 * 24 * 60 * 60 * 1000);
    if (recent) {
      result.skippedNoOverdue++;
      continue;
    }

    const token = randomUUID();
    const expiresAt = now + TOKEN_TTL_MS;
    await prisma.feedbackToken.create({
      data: {
        id: token,
        customerName: customer.name,
        customerEmail: customer.email,
        servicePlan: '',
        // Carry the Splynx city so responses land in Regional Pulse instead
        // of "Unspecified".
        location: customer.city,
        serviceDate: '',
        sourceEvent,
        eventHash: '',
        category: 'Billing',
        staffName: '',
        used: false,
        createdAt: BigInt(now),
        expiresAt: BigInt(expiresAt),
        openedAt: null,
        submittedAt: null,
      },
    });
    await mirrorFeedbackTokenSet(token, {
      customerName: customer.name,
      customerEmail: customer.email,
      sourceEvent,
      createdAt: now,
      expiresAt,
      location: customer.city,
    });

    const feedbackJobId = await createEmailJob({
      type: 'feedback_request',
      customerId: String(customerId),
      customerEmail: customer.email,
      customerName: customer.name,
      payload: { feedbackUrl: `${baseUrl}/feedback?token=${token}&subject=Billing` },
    });
    try {
      await sendFeedbackEmail({
        to: customer.email,
        customerName: customer.name,
        feedbackUrl: `${baseUrl}/feedback?token=${token}&subject=Billing`,
      });
      await markEmailJobSent(feedbackJobId);
      result.sent++;
    } catch (err) {
      await markEmailJobFailed(feedbackJobId, err instanceof Error ? err.message : String(err), 0);
      // Release the monthly slot: the token was minted for an email that never
      // went out, so delete it — otherwise the dedup check skips this customer
      // for the rest of the month and the failure can never self-heal.
      await prisma.feedbackToken.deleteMany({ where: { id: token } }).catch(() => undefined);
      logWarn('[paid-feedback] email failed', { customerId, error: String(err) });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Hourly sync orchestrator (MariaDB-native). Never throws: failures are
 * recorded on the SyncLock row and returned as partial stats, matching the
 * old Firestore orchestrator's contract so the scheduler behaves identically.
 */
export async function runHourlySyncDb(baseUrl: string, now = Date.now()): Promise<SyncStats> {
  const started = Date.now();
  const stats: SyncStats = {
    customersUpserted: 0,
    customersMarkedDeleted: 0,
    invoicesUpserted: 0,
    reminders15: 0,
    reminders30: 0,
    churnSent: 0,
    winBackSent: 0,
    feedbackReminders: 0,
    invoicesApiDenied: false,
    ticketsSynced: 0,
    ticketsApiDenied: false,
  };

  let journalId: string | undefined;
  try {
    const { journalBegin } = await import('@/lib/journal');
    journalId = await journalBegin({ type: 'splynx-hourly-sync', payload: { started } });
  } catch {
    // Journal is best-effort — never fail the sync over it.
  }

  try {
    if (!(await acquireSyncLock(now))) {
      logInfo('[splynx-sync] skipped — another run in progress');
      return stats;
    }

    const customers = await reconcileCustomersDb(now);
    stats.customersUpserted = customers.upserted;
    stats.customersMarkedDeleted = customers.deleted;

    const invoices = await reconcileInvoicesDb(now);
    stats.invoicesUpserted = invoices.upserted;
    stats.invoicesApiDenied = invoices.denied;

    // Ticket mirror (helpdesk → Ticket table). Best-effort within the hourly
    // run: a ticket failure must never take down customers/invoices/mail.
    try {
      const tickets = await reconcileTicketsDb(now);
      stats.ticketsSynced = tickets.upserted;
      stats.ticketsApiDenied = tickets.denied;
    } catch (ticketErr) {
      logWarn('[splynx-sync] ticket reconcile failed (best-effort)', {
        error: ticketErr instanceof Error ? ticketErr.message : String(ticketErr),
      });
    }

    // One shared unpaid-invoice scan for both reminder jobs.
    const unpaidRows = await prisma.invoice.findMany({ where: { isPaid: false } });

    // MAIL STOP: when MAIL_JOBS_DISABLED=true, skip all scheduled email jobs
    // (invoice reminders, churn surveys, win-back, overdue feedback). The
    // invoice-paid / ticket-closed webhook path is NOT affected.
    const mailDisabled = process.env.MAIL_JOBS_DISABLED === 'true';
    if (!mailDisabled) {
      const reminders = await runReminderJobDb(now, unpaidRows);
      stats.reminders15 = reminders.sent15;
      stats.reminders30 = reminders.sent30;

      const churn = await runChurnSurveyJobDb(baseUrl, now);
      stats.churnSent = churn.sent;

      const winBack = await runWinBackJobDb(baseUrl, now);
      stats.winBackSent = winBack.sent;

      const overdueFeedback = await runOverdueFeedbackReminderJobDb(baseUrl, now, unpaidRows);
      stats.feedbackReminders = overdueFeedback.sent;
    }

    // Persist support staff KPIs (weekly calendar bucket; idempotent).
    // Best-effort: a failure here must never kill the main mirror sync.
    try {
      const { getAdminFirestore } = await import('@/lib/firebase-admin');
      const { persistStaffKPIs } = await import('@/lib/staff-kpis');
      await persistStaffKPIs(getAdminFirestore(), { period: 'weekly' });
    } catch (kpiErr) {
      logWarn('[splynx-sync] staff KPI persistence failed (best-effort)', {
        error: kpiErr instanceof Error ? kpiErr.message : String(kpiErr),
      });
    }

    // Data changed — drop cached admin snapshots (respects min-refresh floors).
    clearRouteCache();

    if (journalId) {
      try {
        const { journalComplete } = await import('@/lib/journal');
        // SAFETY: SyncStats is a known-key object with JSON-serializable values,
        // matching the journal's expected payload shape.
        await journalComplete(journalId, { stats } as unknown as Parameters<typeof journalComplete>[1]);
      } catch {
        // best-effort
      }
    }

    logInfo('[splynx-sync] completed', { stats, durationMs: Date.now() - started });
    // SAFETY: SyncStats is a known-key object with JSON-serializable values,
    // matching Prisma's InputJsonValue requirement.
    await completeSyncRun(stats as unknown as Prisma.InputJsonValue, null, now);
    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('[splynx-sync] failed', { error: message, durationMs: Date.now() - started });
    if (journalId) {
      try {
        const { journalFail } = await import('@/lib/journal');
        await journalFail(journalId, message);
      } catch {
        // best-effort
      }
    }
    try {
      // SAFETY: SyncStats is a known-key object with JSON-serializable values,
      // matching Prisma's InputJsonValue requirement.
      await completeSyncRun(stats as unknown as Prisma.InputJsonValue, message, now);
    } catch (completeErr) {
      logWarn('[splynx-sync] failed to record completion', { error: String(completeErr) });
    }
    return stats;
  }
}
