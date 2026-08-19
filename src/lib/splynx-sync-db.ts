import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { Firestore } from 'firebase-admin/firestore';
import { getAllCustomers, getUnpaidInvoices, getDeletedInvoices } from './splynx-api';
import type { SplynxInvoice } from './splynx-api';
import { sendInvoiceReminderEmail, sendChurnSurveyEmail, sendFeedbackEmail, sendWinBackEmail } from './email';
import { hasDeliverableEmail } from './email-validity';
import { createFeedbackToken, TOKEN_TTL_MS } from './feedback-token';
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
} from './splynx-mirror-types';
import { acquireSyncLock, completeSyncRun, setSplynxMeta } from './lib/db/sync';
import { mapCustomer, mapInvoice } from './lib/db/sync-mirror';
import { clearRouteCache } from './route-cache';
import type { PrismaClient } from '@prisma/client';
import { queueInvoiceReminder, queueChurnSurvey, queueWinBack, queueFeedbackRequest } from '@/lib/queues/email-producer';

/** Firestore document data — known-key object with JSON-serializable values. */
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

// ---------------------------------------------------------------------------
// MariaDB-native Splynx sync.
//
// The Firestore version of this pipeline (splynx-mirror.ts) bulk-loads the
// whole customer + invoice collections every run (~8.9k reads) and blew the
// Spark daily read quota. This module is the strangler replacement:
//
//   - reconcile compares against MariaDB (bulk findMany — zero Firestore reads)
//   - email jobs scan MariaDB (Customer / Invoice tables)
//   - lock + status live in MariaDB (SyncLock / SplynxMeta)
//   - the read-budget gate is gone (DB reads are free)
//
// Firestore is now WRITE-ONLY and best-effort: a small mirror of the same
// docs the old sync kept, so the old module stays a viable rollback path and
// the data remains inspectable. A mirror failure never fails the sync.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const CHURN_SURVEY_TTL_MS = 30 * DAY_MS;

const CUSTOMER_COMPARE_KEYS = [
  'customerName', 'email', 'billingEmail', 'phone', 'login', 'city', 'street',
  'status', 'lifecycle', 'online', 'lastOnlineAt', 'lastUpdateAt', 'mrrTotal',
  'accountType', 'category', 'servicePlan',
] as const;

// ---------------------------------------------------------------------------
// Firestore mirror (write-only, best-effort)
// ---------------------------------------------------------------------------

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
    // SAFETY: ChurnSurveyDoc is a known-key object with JSON-serializable values,
    // matching the FirestoreData contract for document writes.
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
}): Promise<void> {
  try {
    const fs = await getMirrorFirestore();
    if (!fs) return;
    await fs.collection('feedback_tokens').doc(token).set({
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: '',
      location: '',
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
  emailOptOut: boolean | null;
  emailInvalid: boolean | null;
  overdueInfo: unknown;
}): MirrorCustomerDoc {
  // SAFETY: DB lifecycle column only stores valid Lifecycle enum values ('active'|'blocked'|'inactive'|'churned'),
  // defaulting to 'active' for null/unknown.
  const lifecycle: Lifecycle = (row.lifecycle ?? 'active') as Lifecycle;
  // SAFETY: overdueInfo is written by this module as CustomerOverdueInfo | null; reading back preserves the shape.
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
    emailOptOut: !!row.emailOptOut,
    emailInvalid: !!row.emailInvalid,
    overdueInfo,
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

// ---------------------------------------------------------------------------
// Customer reconcile
// ---------------------------------------------------------------------------

/**
 * Build the full mirror doc for one Splynx customer, applying the same
 * lifecycle transition policy as the Firestore sync:
 *  1. Once churned, always churned — status flapping must not resurrect them.
 *  2. Long-inactive (90d+) customers are reclassified as churned.
 */
export function buildCustomerDoc(
  prev: MirrorCustomerDoc | undefined,
  fields: Partial<MirrorCustomerDoc>,
  now: number,
): MirrorCustomerDoc {
  const prevLifecycle = prev?.lifecycle ?? 'active';
  // SAFETY: fields.lifecycle only comes from buildCustomerFields which produces valid Lifecycle values.
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
  if (lifecycle === 'churned' && prevLifecycle !== 'churned' && !churnedAt) churnedAt = now;
  else if (lifecycle !== 'churned' && prevLifecycle === 'churned') churnedAt = null;
  if (lifecycle === 'inactive' && prevLifecycle !== 'inactive' && !inactiveSince) inactiveSince = now;
  else if (lifecycle !== 'inactive' && prevLifecycle === 'inactive') inactiveSince = null;

  const changed = !prev || CUSTOMER_COMPARE_KEYS.some((key) => {
    // SAFETY: CUSTOMER_COMPARE_KEYS are known keys of MirrorCustomerDoc; prev is a full doc when present.
    const a = prev?.[key as keyof MirrorCustomerDoc];
    // SAFETY: fields is Partial<MirrorCustomerDoc> with the same key set.
    const b = fields[key as keyof MirrorCustomerDoc];
    if (key === 'lifecycle') return a !== lifecycle;
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
    mrrTotal: fields.mrrTotal ?? prev?.mrrTotal ?? 0,
    accountType: fields.accountType ?? prev?.accountType ?? 'regular',
    category: fields.category ?? prev?.category ?? '',
    servicePlan: fields.servicePlan ?? prev?.servicePlan ?? '',
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
    emailOptOut: prev?.emailOptOut ?? false,
    emailInvalid: prev?.emailInvalid ?? false,
    overdueInfo: prev?.overdueInfo ?? null,
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

  // Mark customers absent from the live list as deleted (never hard-delete).
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

/** True when the two docs differ on any customer data field or lastChangeAt. */
export function docChanged(prev: MirrorCustomerDoc, next: MirrorCustomerDoc): boolean {
  if (prev.lastChangeAt !== next.lastChangeAt) return true;
  return CUSTOMER_COMPARE_KEYS.some((key) => {
    // SAFETY: CUSTOMER_COMPARE_KEYS are known keys of MirrorCustomerDoc.
    const a = prev[key as keyof MirrorCustomerDoc];
    // SAFETY: CUSTOMER_COMPARE_KEYS are known keys of MirrorCustomerDoc.
    const b = next[key as keyof MirrorCustomerDoc];
    return a !== b;
  });
}

// ---------------------------------------------------------------------------
// Invoice reconcile
// ---------------------------------------------------------------------------

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
          // SAFETY: Keys are known properties of MirrorInvoiceDoc.
          const a = prev[key as keyof MirrorInvoiceDoc];
          // SAFETY: Keys are known properties of MirrorInvoiceDoc.
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

  // Prune invoices deleted in Splynx (webhook handles paid flips).
  for (const idKey of deletedIds) {
    if (!existing.has(idKey)) continue;
    await prisma.invoice.delete({ where: { invoiceId: idKey } });
    await mirrorInvoiceDelete(idKey);
  }

  // Denormalize the overdue summary onto customer rows so admin list pages
  // never scan the invoice table.
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
      // SAFETY: buildCustomerOverdueInfo returns CustomerOverdueInfo which is JSON-serializable,
      // matching Prisma's InputJsonValue requirement.
      data: { overdueInfo: buildCustomerOverdueInfo(normalized, now) as unknown as Prisma.InputJsonValue },
    });
  }
  // Customers whose invoices all disappeared from the unpaid list (paid or
  // deleted) must have their badge cleared.
  for (const [cid] of existingByCustomer) {
    if (!freshByCustomer.has(cid)) {
      await prisma.customer.update({
        where: { customerId: String(cid) },
        // SAFETY: buildCustomerOverdueInfo returns CustomerOverdueInfo which is JSON-serializable,
        // matching Prisma's InputJsonValue requirement.
        data: { overdueInfo: buildCustomerOverdueInfo([], now) as unknown as Prisma.InputJsonValue },
      });
    }
  }

  return { upserted, denied: false, fetched: unpaid.length + deleted.length + existingRows.length };
}

// ---------------------------------------------------------------------------
// Email jobs (scan MariaDB)
// ---------------------------------------------------------------------------

/** Send 15/30-day payment reminders for overdue invoices (idempotent).
 *  Groups invoices by customer — ONE email per customer per run. */
export async function runReminderJobDb(now = Date.now(), unpaidRows?: Array<{ invoiceId: string; customerId: string; number: string | null; title: string | null; total: number | null; dueDate: bigint | null; date: bigint | null; status: string | null; isPaid: boolean | null; paidAt: bigint | null; reminder15SentAt: bigint | null; reminder30SentAt: bigint | null; syncedAt: bigint | null }>): Promise<ReminderJobResult> {
  const result: ReminderJobResult = { sent15: 0, sent30: 0, skippedOptOut: 0, skippedInvalid: 0, skippedChurned: 0, skippedStale: 0 };
  const unpaid = unpaidRows ?? (await prisma.invoice.findMany({ where: { isPaid: false } }));
  if (!unpaid.length) return result;

  // Group invoices by customer that need reminders
  const customerInvoices = new Map<number, Array<{ row: (typeof unpaid)[number]; overdue: number; needs15: boolean; needs30: boolean }>>();
  for (const row of unpaid) {
    const dueDate = toNum(row.dueDate);
    if (!dueDate) continue;
    const overdue = daysOverdue(dueDate, now);
    if (overdue > REMINDER_MAX_OVERDUE_DAYS) {
      result.skippedStale++;
      continue;
    }
    const needs15 = overdue >= 15 && row.reminder15SentAt === null;
    const needs30 = overdue >= 30 && row.reminder30SentAt === null;
    if (needs15 || needs30) {
      const cid = Number(row.customerId);
      if (!Number.isFinite(cid)) continue;
      const arr = customerInvoices.get(cid) || [];
      arr.push({ row, overdue, needs15, needs30 });
      customerInvoices.set(cid, arr);
    }
  }
  if (customerInvoices.size === 0) return result;

  const customerIds = [...customerInvoices.keys()];
  const customerRows = await prisma.customer.findMany({ where: { customerId: { in: customerIds.map(String) } } });
  const customerMap = new Map<string, { email: string; name: string; optOut: boolean; lifecycle: string }>();
  for (const row of customerRows) {
    customerMap.set(String(row.customerId), {
      email: row.email || '',
      name: row.customerName || '',
      optOut: !!row.emailOptOut,
      lifecycle: row.lifecycle || 'active',
    });
  }

  for (const [customerId, invoices] of customerInvoices.entries()) {
    const customer = customerMap.get(String(customerId));
    if (!customer || !customer.email) continue;
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

    // Determine reminder type: 30d takes priority, else 15d
    // When 30d, include ALL invoices needing reminders (15d + 30d) since 30d supersedes 15d
    const has30 = invoices.some((i) => i.needs30);
    const reminderType = has30 ? '30d' : '15d';
    const relevantInvoices = has30
      ? invoices.filter((i) => i.needs15 || i.needs30) // include all needing reminders
      : invoices.filter((i) => i.needs15);

    // Build invoice list for email
    const emailInvoices = relevantInvoices.map((i) => ({
      invoiceNumber: String(i.row.number || Number(i.row.invoiceId) || ''),
      amount: i.row.total || 0,
      dueDate: formatDueDate(Number(i.row.dueDate)),
      daysOverdue: i.overdue,
    }));

    try {
      await sendInvoiceReminderEmail({
        to: customer.email,
        customerName: customer.name,
        invoices: emailInvoices,
        reminderType,
      });

      // Update all relevant invoices atomically with check-and-set
      const invoiceIds = relevantInvoices.map((i) => String(i.row.invoiceId));
      if (has30) {
        // 30d reminder: only update invoices that still have reminder30SentAt=null
        const updated = await prisma.invoice.updateMany({
          where: {
            invoiceId: { in: invoiceIds },
            reminder30SentAt: null,
          },
          data: {
            reminder30SentAt: BigInt(now),
            reminder15SentAt: BigInt(now),
          },
        });
        if (updated.count > 0) {
          for (const id of invoiceIds) {
            await mirrorInvoiceUpdate(id, { reminder30SentAt: now, reminder15SentAt: now });
          }
          result.sent30++;
        } else {
          logWarn('[reminder] 30d reminder already sent by another process', { customerId, invoiceIds });
        }
      } else {
        // 15d reminder only: only update invoices that still have reminder15SentAt=null
        const updated = await prisma.invoice.updateMany({
          where: {
            invoiceId: { in: invoiceIds },
            reminder15SentAt: null,
          },
          data: { reminder15SentAt: BigInt(now) },
        });
        if (updated.count > 0) {
          for (const id of invoiceIds) {
            await mirrorInvoiceUpdate(id, { reminder15SentAt: now });
          }
          result.sent15++;
        } else {
          logWarn('[reminder] 15d reminder already sent by another process', { customerId, invoiceIds });
        }
      }
    } catch (err) {
      logWarn('[reminder] email failed', { customerId, error: String(err) });
    }
  }

  return result;
}

/** Send one "we miss you" survey per churned customer (idempotent via atomic check-and-set). */
export async function runChurnSurveyJobDb(baseUrl: string, now = Date.now()): Promise<ChurnJobResult> {
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

/** Send one "We've Missed You" win-back email per churned customer (idempotent via atomic check-and-set). */
export async function runWinBackJobDb(baseUrl: string, now = Date.now()): Promise<WinBackJobResult> {
  const result: WinBackJobResult = { sent: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedInvalid: 0, skippedStale: 0, scanned: 0 };
  const churned = await prisma.customer.findMany({ where: { lifecycle: 'churned' } });
  result.scanned = churned.length;

  for (const row of churned) {
    if (row.deleted) continue;
    // Same recency policy as the churn survey — welcome-back offers go only to
    // customers who left recently, not to 2-year-old churn.
    const churnedAt = toNum(row.churnedAt);
    if (!churnedAt || now - churnedAt > WINBACK_WINDOW_MS) {
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
      await sendWinBackEmail({
        to: row.email,
        customerName: row.customerName || 'there',
        portalUrl: 'https://portal.iwn.ng',
        csatUrl: baseUrl,
        feedbackUrl: `${baseUrl}/feedback/popup?token=${token}&embed=true`,
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

/** Send one feedback link per overdue customer (15+ days unpaid). Idempotent via token TTL. */
export async function runOverdueFeedbackReminderJobDb(
  baseUrl: string,
  now = Date.now(),
  unpaidRows?: Array<{ invoiceId: string; customerId: string; number: string | null; title: string | null; total: number | null; dueDate: bigint | null; date: bigint | null; status: string | null; isPaid: boolean | null; paidAt: bigint | null; reminder15SentAt: bigint | null; reminder30SentAt: bigint | null; syncedAt: bigint | null }>,
): Promise<FeedbackReminderJobResult> {
  const result: FeedbackReminderJobResult = { sent: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedInvalid: 0, skippedNoOverdue: 0, skippedChurned: 0 };

  const unpaid = unpaidRows ?? (await prisma.invoice.findMany({ where: { isPaid: false } }));
  if (!unpaid.length) return result;

  // Collect overdue customer ids (15+ days, within the reminder window).
  const overdueCustomerIds = new Set<number>();
  for (const row of unpaid) {
    const dueDate = toNum(row.dueDate);
    if (dueDate) {
      const overdue = daysOverdue(dueDate, now);
      if (overdue >= 15 && overdue <= REMINDER_MAX_OVERDUE_DAYS) {
        const cid = Number(row.customerId);
        if (Number.isFinite(cid)) overdueCustomerIds.add(cid);
      }
    }
  }

  if (overdueCustomerIds.size === 0) return result;

  const customerIds = [...overdueCustomerIds];
  const customerRows = await prisma.customer.findMany({ where: { customerId: { in: customerIds.map(String) } } });
  const customerMap = new Map<string, { email: string; name: string; optOut: boolean; lifecycle: string }>();
  for (const row of customerRows) {
    customerMap.set(String(row.customerId), {
      email: row.email || '',
      name: row.customerName || '',
      optOut: !!row.emailOptOut,
      lifecycle: row.lifecycle || 'active',
    });
  }

  for (const customerId of customerIds) {
    const customer = customerMap.get(String(customerId));
    if (!customer || !customer.email) {
      result.skippedNoEmail++;
      continue;
    }
    if (customer.lifecycle === 'churned') {
      // Never ask customers we've already cut off for billing feedback.
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

    const token = randomUUID();
    const expiresAt = now + TOKEN_TTL_MS;
    await prisma.feedbackToken.create({
      data: {
        id: token,
        customerName: customer.name,
        customerEmail: customer.email,
        servicePlan: '',
        location: '',
        serviceDate: '',
        sourceEvent: `overdue:${customerId}`,
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
      sourceEvent: `overdue:${customerId}`,
      createdAt: now,
      expiresAt,
    });

    try {
      await sendFeedbackEmail({
        to: customer.email,
        customerName: customer.name,
        feedbackUrl: `${baseUrl}/feedback?token=${token}&subject=Billing`,
      });
      result.sent++;
    } catch (err) {
      logWarn('[overdue-feedback] email failed', { customerId, error: String(err) });
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