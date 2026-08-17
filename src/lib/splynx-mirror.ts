import { randomUUID } from 'crypto';
import type { Firestore, DocumentData, DocumentReference, QuerySnapshot } from 'firebase-admin/firestore';
import { getAllCustomers, getUnpaidInvoices, getDeletedInvoices, type SplynxCustomerListRecord, type SplynxInvoice } from './splynx-api';
import { getAdminFirestore } from './firebase-admin';
import { sendInvoiceReminderEmail, sendChurnSurveyEmail, sendFeedbackEmail, sendWinBackEmail } from './email';
import { hasDeliverableEmail } from './email-validity';
import { createFeedbackToken, TOKEN_TTL_MS } from './feedback-token';
import { logInfo, logWarn, logError } from './logger';
import {
  type MirrorCustomerDoc,
  type MirrorInvoiceDoc,
  type ChurnSurveyDoc,
  type SyncStats,
  type ReminderJobResult,
  type ChurnJobResult,
  type WinBackJobResult,
  type FeedbackReminderJobResult,
  type CustomerOverdueInfo,
  type Lifecycle,
  type LifecycleTransitionUpdates,
  CUSTOMERS_COLLECTION,
  INVOICES_COLLECTION,
  CHURN_COLLECTION,
  LOCK_DOC,
  CHURN_SURVEY_WINDOW_MS,
  WINBACK_WINDOW_MS,
  REMINDER_MAX_OVERDUE_DAYS,
  INACTIVE_CHURN_MS,
} from './splynx-mirror-types';
import { clearRouteCache } from './route-cache';
import { persistStaffKPIs } from './staff-kpis';
import { getBudgetState, syncBudgetDecision, logBudgetStatus, recordReads, flushReads, CRITICAL_CAP, ABSOLUTE_CAP } from './read-budget';
import { journalBegin, journalComplete, journalFail, sweepAndReportStaleJournals } from './journal';
import { mirrorUpsertCustomer, mirrorUpsertInvoice } from './lib/db/sync-mirror';
import type { PrismaClient } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const ONLINE_WINDOW_MS = 30 * DAY_MS;
const CHURN_SURVEY_TTL_MS = 30 * DAY_MS;
const SYNC_LOCK_LEASE_MS = 25 * 60 * 1000;
const BATCH_SIZE = 400;

// ---------------------------------------------------------------------------
// Dependency injection for testability
// ---------------------------------------------------------------------------

export interface SplynxMirrorDeps {
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
  mirrorUpsertCustomer?: typeof mirrorUpsertCustomer;
  mirrorUpsertInvoice?: typeof mirrorUpsertInvoice;
  persistStaffKPIs?: typeof persistStaffKPIs;
  clearRouteCache?: typeof clearRouteCache;
  getBudgetState?: typeof getBudgetState;
  syncBudgetDecision?: typeof syncBudgetDecision;
  logBudgetStatus?: typeof logBudgetStatus;
  recordReads?: typeof recordReads;
  flushReads?: typeof flushReads;
  journalBegin?: typeof journalBegin;
  journalComplete?: typeof journalComplete;
  journalFail?: typeof journalFail;
  sweepAndReportStaleJournals?: typeof sweepAndReportStaleJournals;
  prisma?: import('@prisma/client').PrismaClient;
}

// For default Prisma import (lazy to avoid circular)
let defaultPrisma: import('@prisma/client').PrismaClient | null = null;
async function getDefaultPrisma(): Promise<import('@prisma/client').PrismaClient> {
  if (!defaultPrisma) {
    const { prisma } = await import('@/lib/prisma');
    defaultPrisma = prisma;
  }
  return defaultPrisma;
}

/** Arbitrary JSON-ish value that arrives at an I/O boundary (webhook attributes, Firestore fields). */
type RuntimeValue = string | number | boolean | null | undefined | RuntimeValue[] | WebhookAttributes;

/** Attribute payload delivered by Splynx webhooks (snake_case/camelCase varies by version). */
interface WebhookAttributes {
  [key: string]: RuntimeValue;
}

/** Update fields a customer webhook may write to the mirror doc. */
interface CustomerWebhookUpdates {
  lastSyncAt: number;
  customerName?: string;
  email?: string;
  phone?: string;
  city?: string;
  status?: string;
  lifecycle?: Lifecycle;
}

function isNumberValue(value: RuntimeValue): value is number {
  return typeof value === 'number';
}

function isStringValue(value: RuntimeValue): value is string {
  return typeof value === 'string';
}

function isRecordLike(value: RuntimeValue): value is WebhookAttributes {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

export function classifyLifecycle(status: string): Lifecycle {
  const s = (status || '').toLowerCase();
  if (s === 'blocked') return 'blocked';
  if (s === 'suspended') return 'blocked';
  if (s === 'inactive') return 'inactive';
  if (s === 'disabled') return 'churned';
  return 'active';
}

/**
 * Apply lifecycle transition tracking (churnedAt / inactiveSince) based on
 * the previous and next lifecycle. Returns an object with any timestamp
 * fields that need to be written.
 */
function applyLifecycleTransitions(
  prev: { lifecycle?: Lifecycle; churnedAt?: number | null; inactiveSince?: number | null },
  nextLifecycle: Lifecycle | undefined,
  now: number,
): LifecycleTransitionUpdates {
  const updates: LifecycleTransitionUpdates = {};
  const prevLifecycle = prev.lifecycle;
  const prevChurnedAt = prev.churnedAt;
  const prevInactiveSince = prev.inactiveSince;

  // churnedAt: set on first transition TO churned, clear when leaving churned
  if (nextLifecycle === 'churned' && prevLifecycle !== 'churned' && !prevChurnedAt) {
    updates.churnedAt = now;
  } else if (nextLifecycle !== 'churned' && prevLifecycle === 'churned') {
    updates.churnedAt = null;
  }

  // inactiveSince: set on first transition TO inactive, clear when leaving inactive
  if (nextLifecycle === 'inactive' && prevLifecycle !== 'inactive' && !prevInactiveSince) {
    updates.inactiveSince = now;
  } else if (nextLifecycle !== 'inactive' && prevLifecycle === 'inactive') {
    updates.inactiveSince = null;
  }

  return updates;
}

export function isOnline(lastOnlineAt: number | null, now = Date.now()): boolean {
  return lastOnlineAt !== null && now - lastOnlineAt <= ONLINE_WINDOW_MS;
}

export function parseSplynxDate(value: string): number | null {
  if (!value) return null;
  const clean = value.trim();
  if (!clean || /^0{4}-0{2}-0{2}/.test(clean)) return null;
  const ms = Date.parse(clean.replace(' ', 'T'));
  return Number.isNaN(ms) ? null : ms;
}

export function daysOverdue(dueDate: number, now = Date.now()): number {
  return Math.max(0, Math.floor((now - dueDate) / DAY_MS));
}

export function formatDueDate(dueDate: number): string {
  return new Date(dueDate).toISOString().slice(0, 10);
}

export function buildCustomerOverdueInfo(invoices: MirrorInvoiceDoc[], now = Date.now()): CustomerOverdueInfo {
  const overdueInvoices = invoices.filter((invoice) => !invoice.isPaid && invoice.dueDate && invoice.dueDate <= now);
  if (!overdueInvoices.length) {
    return {
      hasOverdueInvoice: false,
      overdueDays: 0,
      overdueInvoiceCount: 0,
      invoiceNumber: null,
      invoiceAmount: 0,
      lastReminderSentAt: null,
      lastReminderType: null,
    };
  }

  const sorted = overdueInvoices.slice().sort((a, b) => {
    const aDays = daysOverdue(a.dueDate!, now);
    const bDays = daysOverdue(b.dueDate!, now);
    if (aDays !== bDays) return bDays - aDays;
    return (b.total || 0) - (a.total || 0);
  });

  const top = sorted[0];
  const latestReminderSentAt =
    [top.reminder15SentAt, top.reminder30SentAt].filter((v): v is number => !!v).sort((a, b) => b - a)[0] || null;
  const lastReminderType =
    latestReminderSentAt === top.reminder30SentAt ? '30d' : latestReminderSentAt === top.reminder15SentAt ? '15d' : null;

  const overdueDays = top.dueDate ? daysOverdue(top.dueDate, now) : 0;
  return {
    hasOverdueInvoice: overdueDays >= 15,
    overdueDays,
    overdueInvoiceCount: overdueInvoices.length,
    invoiceNumber: top.number || null,
    invoiceAmount: top.total || 0,
    lastReminderSentAt: latestReminderSentAt,
    lastReminderType,
  };
}

/** Build the normalized invoice shape buildCustomerOverdueInfo expects. */
export function normalizeInvoiceForOverdue(
  invoice: Pick<SplynxInvoice, 'id' | 'customerId' | 'number' | 'title' | 'total' | 'dueDate' | 'date' | 'status' | 'isPaid' | 'paidAt'>,
  prev?: Partial<MirrorInvoiceDoc>,
  now = Date.now(),
): MirrorInvoiceDoc {
  return {
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    number: invoice.number || String(invoice.id),
    title: invoice.title || '',
    total: isNumberValue(invoice.total) ? invoice.total : Number(invoice.total) || 0,
    dueDate: isNumberValue(invoice.dueDate) ? invoice.dueDate : null,
    date: isNumberValue(invoice.date) ? invoice.date : null,
    status: invoice.status || '',
    isPaid: invoice.isPaid === true,
    paidAt: isNumberValue(invoice.paidAt) ? invoice.paidAt : null,
    reminder15SentAt: isNumberValue(prev?.reminder15SentAt) ? prev?.reminder15SentAt : null,
    reminder30SentAt: isNumberValue(prev?.reminder30SentAt) ? prev?.reminder30SentAt : null,
    syncedAt: now,
  };
}

/**
 * Recompute + write the denormalized overdue summary for one customer.
 * Used by payment/invoice webhooks so the admin list stays fresh between
 * syncs without scanning the whole invoice collection.
 */
export async function refreshCustomerOverdueInfo(db: Firestore, customerId: number | string, now = Date.now()): Promise<void> {
  const cid = Number(customerId);
  if (!Number.isFinite(cid) || cid === 0) return;

  const invoicesSnap = await db.collection(INVOICES_COLLECTION).where('customerId', '==', cid).get();
  // SAFETY: invoice mirror docs are written with normalized SplynxInvoice fields, so the
  // Firestore document conforms to the SplynxInvoice contract for overdue computation.
  const normalized: MirrorInvoiceDoc[] = invoicesSnap.docs
    .map((doc) => normalizeInvoiceForOverdue(doc.data() as SplynxInvoice, undefined, now))
    .filter((inv) => !inv.isPaid);

  const info = buildCustomerOverdueInfo(normalized, now);
  await customerDocRef(db, cid).set({ overdueInfo: info }, { merge: true });
}

// ---------------------------------------------------------------------------
// Firestore access
// ---------------------------------------------------------------------------

function customerDocRef(db: Firestore, customerId: number | string) {
  return db.collection(CUSTOMERS_COLLECTION).doc(String(customerId));
}

function invoiceDocRef(db: Firestore, invoiceId: number | string) {
  return db.collection(INVOICES_COLLECTION).doc(String(invoiceId));
}

// ---------------------------------------------------------------------------
// Upserts (used by webhook + reconcile)
// ---------------------------------------------------------------------------

export function buildCustomerFields(record: SplynxCustomerListRecord, now = Date.now()): Partial<MirrorCustomerDoc> {
  const lastOnlineAt = parseSplynxDate(record.last_online);
  const lastUpdateAt = parseSplynxDate(record.last_update);
  const status = (record.status || '').toLowerCase();
  const mrr = parseFloat(record.mrr_total);
  const lifecycle = classifyLifecycle(status);
  return {
    customerId: record.id,
    customerName: record.name || record.login || `Customer #${record.id}`,
    email: record.email || record.billing_email || '',
    billingEmail: record.billing_email || '',
    phone: record.phone || '',
    login: record.login || '',
    city: record.city || '',
    street: record.street_1 || '',
    status,
    lifecycle,
    online: isOnline(lastOnlineAt, now),
    lastOnlineAt,
    lastUpdateAt,
    mrrTotal: Number.isFinite(mrr) ? mrr : 0,
    accountType: record.account_type || 'regular',
    category: record.category || '',
    servicePlan: record.plan || '',
    lastSyncAt: now,
  };
}

/** Upsert one customer mirror doc. Returns true when a write happened. */
export async function upsertCustomer(
  db: Firestore,
  record: SplynxCustomerListRecord,
  now = Date.now(),
  deps?: SplynxMirrorDeps,
): Promise<boolean> {
  const mirrorUpsertCustomerFn = deps?.mirrorUpsertCustomer ?? mirrorUpsertCustomer;
  const ref = customerDocRef(db, record.id);
  const existing = await ref.get();
  const fields = buildCustomerFields(record, now);

  if (!existing.exists) {
    // SAFETY: the literal below sets every required MirrorCustomerDoc field.
    const doc = {
      ...fields,
      firstSyncedAt: now,
      lastChangeAt: now,
      deleted: false,
      reminder15SentAt: null,
      reminder30SentAt: null,
      churnSurveySentAt: null,
      churnSurveyToken: null,
      winBackSentAt: null,
      winBackToken: null,
      churnedAt: fields.lifecycle === 'churned' ? now : null,
      inactiveSince: fields.lifecycle === 'inactive' ? now : null,
      emailOptOut: false,
      emailInvalid: false,
    } as MirrorCustomerDoc;
    await ref.set(doc);
    await mirrorUpsertCustomerFn(doc);
    return true;
  }

  const prev: Partial<MirrorCustomerDoc> = existing.data() ?? {};
  const prevLifecycle = prev.lifecycle;

  // Churn policy computed BEFORE the change comparison so the flip is written:
  // 1. Once churned, always churned — Splynx status flapping (inactive) must
  //    not resurrect a customer. Only an explicit non-inactive status can
  //    un-churn them.
  // 2. Long-inactive (90d+) customers are reclassified as churned (periodic
  //    sync path only — webhook upserts never get here).
  let nextLifecycle: Lifecycle = fields.lifecycle ?? 'active';
  if (prevLifecycle === 'churned' && fields.lifecycle === 'inactive') {
    nextLifecycle = 'churned';
  } else if (fields.lifecycle === 'inactive') {
    const prevInactiveSince = prev.inactiveSince;
    if (prevInactiveSince && now - prevInactiveSince >= INACTIVE_CHURN_MS) {
      nextLifecycle = 'churned';
    }
  }

  const compareKeys = [
    'customerName',
    'email',
    'billingEmail',
    'phone',
    'login',
    'city',
    'street',
    'status',
    'lifecycle',
    'online',
    'lastOnlineAt',
    'lastUpdateAt',
    'mrrTotal',
    'accountType',
    'category',
    'servicePlan',
  ] as const;
  const same = compareKeys.every((key) => prev[key] === (key === 'lifecycle' ? nextLifecycle : fields[key]));
  if (same) return false; // nothing changed — no write

  // Apply lifecycle transition tracking (churnedAt / inactiveSince) using the
  // FINAL lifecycle (accounts for the inactive→churned reclassification).
  const transitionUpdates = applyLifecycleTransitions(
    { lifecycle: prevLifecycle, churnedAt: prev.churnedAt, inactiveSince: prev.inactiveSince },
    nextLifecycle,
    now,
  );

  const updates = { ...fields, lifecycle: nextLifecycle, lastChangeAt: now, ...transitionUpdates };
  await ref.update(updates);
  // SAFETY: prev is the existing mirror doc and updates carries every changed field,
  // so the merge covers the full MirrorCustomerDoc shape for the MariaDB mirror.
  await mirrorUpsertCustomerFn({ ...prev, ...updates } as MirrorCustomerDoc);
  return true;
}

/**
 * Upsert a customer from webhook `attributes` (defensive — attribute shape
 * varies by Splynx version). Returns true when a write happened.
 */
export async function upsertCustomerFromWebhook(
  db: Firestore,
  customerId: number | string,
  attributes: WebhookAttributes,
  now = Date.now(),
  deps?: SplynxMirrorDeps,
): Promise<boolean> {
  const mirrorUpsertCustomerFn = deps?.mirrorUpsertCustomer ?? mirrorUpsertCustomer;
  const id = Number(customerId) || 0;
  if (!id) return false;
  const ref = customerDocRef(db, id);
  const existing = await ref.get();

  const name = String(attributes.name || attributes.customer_name || '') || undefined;
  const email = String(attributes.email || attributes.billing_email || '') || undefined;
  const phone = String(attributes.phone || attributes.phone_1 || '') || undefined;
  const city = String(attributes.city || '') || undefined;
  const status = String(attributes.status || '') || undefined;

  const updates: CustomerWebhookUpdates = { lastSyncAt: now };
  if (name) updates.customerName = name;
  if (email) updates.email = email;
  if (phone) updates.phone = phone;
  if (city) updates.city = city;
  if (status) {
    updates.status = status.toLowerCase();
    updates.lifecycle = classifyLifecycle(status);
  }

  if (!existing.exists) {
    const initialLifecycle = status ? classifyLifecycle(status) : 'active';
    // SAFETY: the literal below sets every required MirrorCustomerDoc field.
    const doc = {
      customerId: id,
      customerName: name || `Customer #${id}`,
      email: email || '',
      billingEmail: '',
      phone: phone || '',
      login: '',
      city: city || '',
      street: '',
      status: status ? status.toLowerCase() : '',
      lifecycle: initialLifecycle,
      online: false,
      lastOnlineAt: null,
      lastUpdateAt: null,
      mrrTotal: 0,
      accountType: 'regular',
      category: '',
      servicePlan: '',
      firstSyncedAt: now,
      lastSyncAt: now,
      lastChangeAt: now,
      deleted: false,
      reminder15SentAt: null,
      reminder30SentAt: null,
      churnSurveySentAt: null,
      churnSurveyToken: null,
      winBackSentAt: null,
      winBackToken: null,
      churnedAt: initialLifecycle === 'churned' ? now : null,
      inactiveSince: initialLifecycle === 'inactive' ? now : null,
      emailOptOut: false,
      emailInvalid: false,
    } as MirrorCustomerDoc;
    await ref.set(doc);
    await mirrorUpsertCustomerFn(doc);
    return true;
  }

  const prev: Partial<MirrorCustomerDoc> = existing.data() ?? {};
  // lastSyncAt is a heartbeat, not a data change — only data fields count.
  const changed = (['customerName', 'email', 'phone', 'city', 'status', 'lifecycle'] as const).some(
    (key) => updates[key] !== undefined && prev[key] !== updates[key],
  );
  if (!changed) return false;

  // Apply lifecycle transition tracking (churnedAt / inactiveSince)
  const transitionUpdates = applyLifecycleTransitions(
    { lifecycle: prev.lifecycle, churnedAt: prev.churnedAt, inactiveSince: prev.inactiveSince },
    updates.lifecycle,
    now,
  );

  await ref.update({ ...updates, ...transitionUpdates, lastChangeAt: now });
  // SAFETY: prev is the existing mirror doc and the update carries every changed field,
  // so the merge covers the full MirrorCustomerDoc shape for the MariaDB mirror.
  await mirrorUpsertCustomerFn({ ...prev, ...updates, ...transitionUpdates, lastChangeAt: now } as MirrorCustomerDoc);
  return true;
}

/**
 * Upsert an invoice mirror doc from a PAYMENT webhook event (`finance\Payments`
 * or `payment.create`). Payment attributes carry an invoice reference — mark
 * that invoice paid in the mirror. This is the main source of invoice data when
 * the finance API is denied (403), because Splynx emits payment events but the
 * API key cannot list invoices directly.
 *
 * Attribute shapes observed on the live portal: payment events include
 * `invoice_id` (or `invoice` object/string), `amount`, `date`, `status`.
 * Returns true when a write happened.
 */
export async function upsertInvoiceFromPaymentWebhook(
  db: Firestore,
  customerId: number | string,
  attributes: WebhookAttributes,
  now = Date.now(),
  deps?: SplynxMirrorDeps,
): Promise<boolean> {
  const mirrorUpsertInvoiceFn = deps?.mirrorUpsertInvoice ?? mirrorUpsertInvoice;
  const invoiceId =
    Number(attributes.invoice_id ?? attributes.invoiceId ?? 0) ||
    (isRecordLike(attributes.invoice) ? Number(attributes.invoice.id ?? 0) : Number(attributes.invoice ?? 0)) ||
    0;
  // No resolvable invoice reference — nothing to mirror.
  if (!invoiceId) return false;

  const ref = invoiceDocRef(db, invoiceId);
  const existing = await ref.get();
  const prev: Partial<MirrorInvoiceDoc> | null = existing.exists ? (existing.data() ?? {}) : null;

  const paidAt = parseSplynxDate(String(attributes.date ?? attributes.paid_at ?? attributes.date_paid ?? ''));
  const prevTotal = prev?.total;
  const amount = isNumberValue(attributes.amount)
    ? attributes.amount
    : isStringValue(attributes.amount)
      ? parseFloat(attributes.amount)
      : isNumberValue(attributes.total)
        ? attributes.total
        : isNumberValue(prevTotal)
          ? prevTotal
          : 0;

  const doc: MirrorInvoiceDoc = {
    invoiceId,
    customerId: Number(customerId) || Number(attributes.customer_id) || prev?.customerId || 0,
    number: String(attributes.invoice_number ?? attributes.number ?? prev?.number ?? `#${invoiceId}`),
    title: String(attributes.title ?? attributes.description ?? prev?.title ?? ''),
    total: Number.isFinite(amount) ? amount : 0,
    dueDate: parseSplynxDate(String(attributes.due_date ?? '')) ?? prev?.dueDate ?? null,
    date: parseSplynxDate(String(attributes.invoice_date ?? attributes.date ?? '')) ?? prev?.date ?? null,
    status: 'paid',
    isPaid: true,
    paidAt,
    reminder15SentAt: prev?.reminder15SentAt ?? null,
    reminder30SentAt: prev?.reminder30SentAt ?? null,
    syncedAt: now,
  };

  if (existing.exists && prev) {
    const compareKeys = ['number', 'title', 'total', 'dueDate', 'date', 'status', 'isPaid', 'paidAt'] as const;
    const same = compareKeys.every((key) => prev[key] === doc[key]);
    if (same) return false;
  }

  await ref.set(doc);
  await mirrorUpsertInvoiceFn(doc);
  return true;
}

/** Upsert an invoice mirror doc from webhook `attributes`. Returns true on write. */
export async function upsertInvoiceFromWebhook(
  db: Firestore,
  customerId: number | string,
  attributes: WebhookAttributes,
  now = Date.now(),
  deps?: SplynxMirrorDeps,
): Promise<boolean> {
  const mirrorUpsertInvoiceFn = deps?.mirrorUpsertInvoice ?? mirrorUpsertInvoice;
  const invoiceId = Number(attributes.id ?? attributes.invoice_id ?? 0) || 0;
  if (!invoiceId) return false;

  const ref = invoiceDocRef(db, invoiceId);
  const existing = await ref.get();

  const status = String(attributes.status ?? attributes.state ?? '').toLowerCase();
  const paidAt = parseSplynxDate(String(attributes.paid_at ?? attributes.date_paid ?? ''));
  const isPaid =
    attributes.paid === 1 ||
    attributes.paid === true ||
    status === 'paid' ||
    status === 'partially paid' ||
    status === 'closed' ||
    status.startsWith('paid ') ||
    status.startsWith('closed ') ||
    paidAt !== null;
  // NOTE: `attributes.due` is the due AMOUNT in Splynx payloads, never a date —
  // parsing it as a date produced garbage years (e.g. "43500" → year 43500).
  const dueDate = parseSplynxDate(String(attributes.due_date ?? ''));
  const total = isNumberValue(attributes.total)
    ? attributes.total
    : isStringValue(attributes.total)
      ? parseFloat(attributes.total)
      : isNumberValue(attributes.amount)
        ? attributes.amount
        : 0;

  const doc: MirrorInvoiceDoc = {
    invoiceId,
    customerId: Number(customerId) || Number(attributes.customer_id) || 0,
    number: String(attributes.number ?? attributes.invoice_number ?? `#${invoiceId}`),
    title: String(attributes.title ?? attributes.description ?? ''),
    total: Number.isFinite(total) ? total : 0,
    dueDate,
    date: parseSplynxDate(String(attributes.date ?? attributes.invoice_date ?? '')),
    status,
    isPaid,
    paidAt,
    reminder15SentAt: existing.exists ? (existing.data()?.reminder15SentAt ?? null) : null,
    reminder30SentAt: existing.exists ? (existing.data()?.reminder30SentAt ?? null) : null,
    syncedAt: now,
  };

  if (existing.exists) {
    const prev: Partial<MirrorInvoiceDoc> = existing.data() ?? {};
    const compareKeys = ['number', 'title', 'total', 'dueDate', 'date', 'status', 'isPaid', 'paidAt'] as const;
    const same = compareKeys.every((key) => prev[key] === doc[key]);
    if (same) return false;
  }

  await ref.set(doc);
  await mirrorUpsertInvoiceFn(doc);
  return true;
}

// ---------------------------------------------------------------------------
// Reconcile (hourly)
// ---------------------------------------------------------------------------

/** Full customer mirror sync. Returns write stats. */
export async function reconcileCustomers(
  db: Firestore,
  now = Date.now(),
  deps?: SplynxMirrorDeps,
): Promise<{ upserted: number; deleted: number; fetched: number }> {
  const getAllCustomersFn = deps?.getAllCustomers ?? getAllCustomers;
  const mirrorUpsertCustomerFn = deps?.mirrorUpsertCustomer ?? mirrorUpsertCustomer;
  const records = await getAllCustomersFn();
  const seenIds = new Set<number>();

  // Bulk-load existing mirror docs once (no per-doc ref.get()).
  const existingSnap = await db.collection(CUSTOMERS_COLLECTION).get();
  const existing = new Map<string, Partial<MirrorCustomerDoc>>();
  for (const doc of existingSnap.docs) existing.set(doc.id, doc.data());

  const batches: Array<ReturnType<typeof db.batch>> = [];
  let current = db.batch();
  let ops = 0;
  const flush = () => {
    if (ops > 0) {
      batches.push(current);
      current = db.batch();
      ops = 0;
    }
  };

  let upserted = 0;
  const pendingCustomerMirrors: MirrorCustomerDoc[] = [];
  for (const record of records) {
    seenIds.add(record.id);
    // Skip write unless something changed (cheap compare via bulk-loaded map)
    const idKey = String(record.id);
    const prev = existing.get(idKey);
    const fields = buildCustomerFields(record, now);
    if (prev) {
      const compareKeys = [
        'customerName',
        'email',
        'billingEmail',
        'phone',
        'login',
        'city',
        'street',
        'status',
        'lifecycle',
        'online',
        'lastOnlineAt',
        'lastUpdateAt',
        'mrrTotal',
        'accountType',
        'category',
        'servicePlan',
      ] as const;
      const same = compareKeys.every((key) => prev[key] === fields[key]);
      if (same) continue;
      const updates = { ...fields, lastChangeAt: now };
      current.update(customerDocRef(db, idKey), updates);
      // SAFETY: prev is the existing mirror doc and updates carries the changed fields,
      // so the merge covers the full MirrorCustomerDoc shape for the MariaDB mirror.
      pendingCustomerMirrors.push({ ...prev, ...updates } as MirrorCustomerDoc);
    } else {
      // SAFETY: the literal below sets every required MirrorCustomerDoc field.
      const doc = {
        ...fields,
        firstSyncedAt: now,
        lastChangeAt: now,
        deleted: false,
        reminder15SentAt: null,
        reminder30SentAt: null,
        churnSurveySentAt: null,
        churnSurveyToken: null,
        winBackSentAt: null,
        winBackToken: null,
        emailOptOut: false,
        emailInvalid: false,
      } as MirrorCustomerDoc;
      current.set(customerDocRef(db, idKey), doc);
      pendingCustomerMirrors.push(doc);
    }
    upserted++;
    ops++;
    if (ops >= BATCH_SIZE) flush();
  }

  // Mark docs absent from the live list as deleted (only when fetch succeeded)
  let deleted = 0;
  for (const [idKey, prev] of existing.entries()) {
    const customerId = Number(prev.customerId) || Number(idKey);
    if (!Number.isFinite(customerId) || customerId === 0) continue;
    if (!seenIds.has(customerId) && prev.deleted !== true) {
      const updates = { deleted: true, lastChangeAt: now };
      current.update(customerDocRef(db, idKey), updates);
      // SAFETY: prev is the existing mirror doc and the update flips `deleted`,
      // so the merge covers the full MirrorCustomerDoc shape for the MariaDB mirror.
      pendingCustomerMirrors.push({ ...prev, ...updates } as MirrorCustomerDoc);
      deleted++;
      ops++;
      if (ops >= BATCH_SIZE) flush();
    }
  }

  flush();
  for (const batch of batches) {
    await batch.commit();
  }

  for (const doc of pendingCustomerMirrors) {
    await mirrorUpsertCustomerFn(doc);
  }

  return { upserted, deleted, fetched: records.length + existingSnap.size };
}

/**
 * Invoice mirror sync.
 *
 * The full invoice list on the live portal is ~57k records (~82MB, ~70s) and
 * the reminder job only needs UNPAID invoices, so we:
 *   - fetch only status=not_paid invoices (fast, status-filtered ~1.5k),
 *   - bulk-load existing mirror docs ONCE (no per-doc ref.get()),
 *   - upsert unpaid invoices (preserving reminder flags from existing docs),
 *   - delete mirror docs whose Splynx invoice is now 'deleted'.
 * Paid flips continue to arrive in real time via payment webhooks.
 *
 * On 403 (finance module not granted to the API key) records the denial in a
 * meta doc and skips.
 */
export async function reconcileInvoices(
  db: Firestore,
  now = Date.now(),
  deps?: SplynxMirrorDeps,
): Promise<{ upserted: number; denied: boolean; fetched: number }> {
  const getUnpaidInvoicesFn = deps?.getUnpaidInvoices ?? getUnpaidInvoices;
  const getDeletedInvoicesFn = deps?.getDeletedInvoices ?? getDeletedInvoices;
  const mirrorUpsertInvoiceFn = deps?.mirrorUpsertInvoice ?? mirrorUpsertInvoice;
  let unpaid: SplynxInvoice[];
  try {
    unpaid = await getUnpaidInvoicesFn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403')) {
      await db.collection('splynx_meta').doc('sync').set({ invoicesApiDenied: true, deniedAt: now }, { merge: true });
      return { upserted: 0, denied: true, fetched: 0 };
    }
    throw err;
  }

  let deleted: SplynxInvoice[];
  try {
    deleted = await getDeletedInvoicesFn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('403')) {
      await db.collection('splynx_meta').doc('sync').set({ invoicesApiDenied: true, deniedAt: now }, { merge: true });
      return { upserted: 0, denied: true, fetched: 0 };
    }
    throw err;
  }

  await db.collection('splynx_meta').doc('sync').set({ invoicesApiDenied: false, lastInvoiceSyncAt: now }, { merge: true });

  // Bulk-load existing mirror docs once.
  const existingSnap = await db.collection(INVOICES_COLLECTION).get();
  const existing = new Map<string, Partial<MirrorInvoiceDoc>>();
  for (const doc of existingSnap.docs) existing.set(doc.id, doc.data());

  // Group invoices by customer (fresh list + mirror) for overdue denormalization.
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

  const deletedIds = new Set(deleted.map((inv) => String(inv.id)));

  const batches: Array<ReturnType<typeof db.batch>> = [];
  let current = db.batch();
  let ops = 0;
  const flush = () => {
    if (ops > 0) {
      batches.push(current);
      current = db.batch();
      ops = 0;
    }
  };
  let upserted = 0;
  const pendingInvoiceMirrors: MirrorInvoiceDoc[] = [];

  const upsert = (invoice: SplynxInvoice) => {
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
      const compareKeys = ['number', 'title', 'total', 'dueDate', 'date', 'status', 'isPaid', 'paidAt'] as const;
      const same = compareKeys.every((key) => prev[key] === doc[key]);
      if (same) return;
    }
    current.set(invoiceDocRef(db, invoice.id), doc);
    pendingInvoiceMirrors.push(doc);
    upserted++;
    ops++;
    if (ops >= BATCH_SIZE) flush();
  };

  for (const invoice of unpaid) {
    upsert(invoice);
  }

  // Prune docs whose Splynx invoice was deleted (webhook handles paid flips).
  for (const idKey of existing.keys()) {
    if (deletedIds.has(idKey)) {
      current.delete(invoiceDocRef(db, idKey));
      ops++;
      if (ops >= BATCH_SIZE) flush();
    }
  }

  // Denormalize the overdue summary onto customer docs so admin list pages
  // never scan the invoice collection. Written for every customer that has
  // invoices (a handful of batch updates per sync; backfills the field for
  // docs created before this feature existed).
  const overdueWrites: Array<{ ref: DocumentReference; info: CustomerOverdueInfo }> = [];
  for (const [cid, fresh] of freshByCustomer) {
    const normalized = fresh.map((inv) => normalizeInvoiceForOverdue(inv, existing.get(String(inv.id)), now));
    overdueWrites.push({ ref: customerDocRef(db, cid), info: buildCustomerOverdueInfo(normalized, now) });
  }
  // Customers whose invoices all disappeared from the unpaid list (paid or
  // deleted) must have their badge cleared.
  for (const [cid] of existingByCustomer) {
    if (!freshByCustomer.has(cid)) {
      overdueWrites.push({ ref: customerDocRef(db, cid), info: buildCustomerOverdueInfo([], now) });
    }
  }
  for (const w of overdueWrites) {
    current.set(w.ref, { overdueInfo: w.info }, { merge: true });
    ops++;
    if (ops >= BATCH_SIZE) flush();
  }

  flush();
  for (const batch of batches) {
    await batch.commit();
  }

  for (const doc of pendingInvoiceMirrors) {
    await mirrorUpsertInvoiceFn(doc);
  }

  return { upserted, denied: false, fetched: unpaid.length + deleted.length + existingSnap.size };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * One email per threshold (15d / 30d). Invoices first observed when already
 * 30+ days overdue get ONLY the 30-day email (both flags set).
 */
export async function runReminderJob(
  db: Firestore,
  now = Date.now(),
  unpaidSnap?: QuerySnapshot<DocumentData>,
): Promise<ReminderJobResult> {
  const result: ReminderJobResult = { sent15: 0, sent30: 0, skippedOptOut: 0, skippedInvalid: 0, skippedChurned: 0, skippedStale: 0 };
  const unpaid = unpaidSnap ?? (await db.collection(INVOICES_COLLECTION).where('isPaid', '==', false).get());
  if (unpaid.empty) return result;

  // Resolve customer emails for invoices that actually need a reminder.
  const candidateInvoices: Array<{ doc: DocumentData; ref: DocumentReference; customerId: number; overdue: number }> = [];
  for (const snap of unpaid.docs) {
    const data = snap.data();
    const dueDate = data.dueDate;
    if (!dueDate || !isNumberValue(dueDate)) continue;
    const overdue = daysOverdue(dueDate, now);
    // Stop automated nagging on ancient invoices — 90+ days overdue is
    // collections territory, not a "friendly reminder".
    if (overdue > REMINDER_MAX_OVERDUE_DAYS) {
      result.skippedStale++;
      continue;
    }
    const needs15 = overdue >= 15 && !data.reminder15SentAt;
    const needs30 = overdue >= 30 && !data.reminder30SentAt;
    if (needs15 || needs30) {
      candidateInvoices.push({ doc: data, ref: snap.ref, customerId: data.customerId, overdue });
    }
  }
  if (!candidateInvoices.length) return result;

  // Firestore 'in' queries cap at 10 values — chunk the customer ids.
  const customerIds = [...new Set(candidateInvoices.map((c) => c.customerId))];
  const customerMap = new Map<string, { email: string; name: string; optOut: boolean; lifecycle: string; ref: DocumentReference }>();
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const customerSnaps = await db.collection(CUSTOMERS_COLLECTION).where('customerId', 'in', chunk).get();
    for (const snap of customerSnaps.docs) {
      const data = snap.data();
      customerMap.set(String(data.customerId), {
        email: data.email || '',
        name: data.customerName || '',
        optOut: !!data.emailOptOut,
        lifecycle: data.lifecycle || 'active',
        ref: snap.ref,
      });
    }
  }

  for (const candidate of candidateInvoices) {
    const customer = customerMap.get(String(candidate.customerId));
    if (!customer || !customer.email) continue;
    if (customer.lifecycle === 'churned') {
      // Their service is already cut off — a payment threat is insensitive
      // AND inaccurate. Accounts receivable handles these offline.
      result.skippedChurned++;
      continue;
    }
    if (customer.optOut) {
      result.skippedOptOut++;
      continue;
    }
    if (!(await hasDeliverableEmail(customer.email))) {
      // Bad/undeliverable address — flag the customer once so future runs skip
      // the DNS check, and stop generating bounce noise.
      await customer.ref.update({ emailInvalid: true });
      result.skippedInvalid++;
      continue;
    }

    const amount = candidate.doc.total || 0;
    const dueDate = candidate.doc.dueDate;
    const invoiceNumber = String(candidate.doc.number || Number(candidate.doc.invoiceId) || '');

    if (candidate.overdue >= 30 && !candidate.doc.reminder30SentAt) {
      try {
        await sendInvoiceReminderEmail({
          to: customer.email,
          customerName: customer.name,
          invoiceNumber,
          amount,
          dueDate: formatDueDate(dueDate),
          daysOverdue: candidate.overdue,
        });
        await candidate.ref.update({
          reminder30SentAt: now,
          reminder15SentAt: candidate.doc.reminder15SentAt ?? now, // supersede 15d
        });
        result.sent30++;
      } catch (err) {
        logWarn('[reminder] 30d email failed', { invoice: invoiceNumber, error: String(err) });
      }
    } else if (candidate.overdue >= 15 && !candidate.doc.reminder15SentAt) {
      try {
        await sendInvoiceReminderEmail({
          to: customer.email,
          customerName: customer.name,
          invoiceNumber,
          amount,
          dueDate: formatDueDate(dueDate),
          daysOverdue: candidate.overdue,
        });
        await candidate.ref.update({ reminder15SentAt: now });
        result.sent15++;
      } catch (err) {
        logWarn('[reminder] 15d email failed', { invoice: invoiceNumber, error: String(err) });
      }
    }
  }

  return result;
}

/** Send one "we miss you" survey per churned customer (idempotent). */
export async function runChurnSurveyJob(db: Firestore, baseUrl: string, now = Date.now()): Promise<ChurnJobResult> {
  const result: ChurnJobResult = { sent: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedInvalid: 0, skippedStale: 0, scanned: 0 };
  const churned = await db.collection(CUSTOMERS_COLLECTION).where('lifecycle', '==', 'churned').get();
  result.scanned = churned.size;

  for (const snap of churned.docs) {
    const data = snap.data();
    if (data.deleted) continue;
    if (data.churnSurveySentAt) continue;
    // Only survey recent churn — never people who left months/years ago
    // (mirrored before churn tracking, or outside the 30-day window).
    if (!data.churnedAt || now - data.churnedAt > CHURN_SURVEY_WINDOW_MS) {
      result.skippedStale++;
      continue;
    }
    if (data.emailOptOut) {
      result.skippedOptOut++;
      continue;
    }
    if (!data.email) {
      result.skippedNoEmail++;
      continue;
    }
    if (!(await hasDeliverableEmail(data.email))) {
      await snap.ref.update({ emailInvalid: true });
      result.skippedInvalid++;
      continue;
    }

    const token = randomUUID();
    const expiresAt = now + CHURN_SURVEY_TTL_MS;
    const surveyDoc: ChurnSurveyDoc = {
      customerId: data.customerId,
      customerName: data.customerName || 'Customer',
      customerEmail: data.email,
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
        to: data.email,
        customerName: data.customerName || 'there',
        churnUrl: `${baseUrl}/churn?token=${token}`,
      });
      await db.collection(CHURN_COLLECTION).doc(token).set(surveyDoc);
      // Best-effort MariaDB mirror (rollback only) — throttling never fails the job.
      try {
        const { prisma } = await import('@/lib/prisma');
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
      } catch (mirrorErr) {
        logWarn('[churn] MariaDB survey mirror failed (best-effort)', {
          error: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
        });
      }
      await snap.ref.update({ churnSurveySentAt: now, churnSurveyToken: token });
      result.sent++;
    } catch (err) {
      logWarn('[churn] survey email failed', { customerId: data.customerId, error: String(err) });
    }
  }

  return result;
}

/** Send one "We've Missed You" win-back email per churned customer (idempotent via winBackSentAt). */
export async function runWinBackJob(db: Firestore, baseUrl: string, now = Date.now()): Promise<WinBackJobResult> {
  const result: WinBackJobResult = { sent: 0, skippedOptOut: 0, skippedNoEmail: 0, skippedInvalid: 0, skippedStale: 0, scanned: 0 };
  const churned = await db.collection(CUSTOMERS_COLLECTION).where('lifecycle', '==', 'churned').get();
  result.scanned = churned.size;

  for (const snap of churned.docs) {
    const data = snap.data();
    if (data.deleted) continue;
    if (data.winBackSentAt) continue;
    // Same recency policy as the churn survey — welcome-back offers go only to
    // customers who left recently, not to 2-year-old churn.
    if (!data.churnedAt || now - data.churnedAt > WINBACK_WINDOW_MS) {
      result.skippedStale++;
      continue;
    }
    if (data.emailOptOut) {
      result.skippedOptOut++;
      continue;
    }
    if (!data.email) {
      result.skippedNoEmail++;
      continue;
    }
    if (!(await hasDeliverableEmail(data.email))) {
      await snap.ref.update({ emailInvalid: true });
      result.skippedInvalid++;
      continue;
    }

    try {
      // Mint one feedback token per customer so the popup link works and
      // the response lands in the admin feedback views.
      const { token } = await createFeedbackToken(db, {
        customerName: data.customerName || '',
        customerEmail: data.email,
        servicePlan: data.servicePlan || '',
        location: data.city || '',
        category: 'Reliability',
        sourceEvent: 'winback',
        eventHash: `winback-${data.customerId}`,
      });
      await sendWinBackEmail({
        to: data.email,
        customerName: data.customerName || 'there',
        portalUrl: 'https://portal.iwn.ng',
        csatUrl: baseUrl,
        feedbackUrl: `${baseUrl}/feedback/popup?token=${token}&embed=true`,
      });
      await snap.ref.update({ winBackSentAt: now, winBackToken: token });
      result.sent++;
    } catch (err) {
      logWarn('[winback] email failed', { customerId: data.customerId, error: String(err) });
    }
  }

  return result;
}

/** Send one feedback link per overdue customer (15+ days unpaid). Idempotent via token TTL. */
export async function runOverdueFeedbackReminderJob(
  db: Firestore,
  baseUrl: string,
  now = Date.now(),
  unpaidSnap?: QuerySnapshot<DocumentData>,
): Promise<FeedbackReminderJobResult> {
  const result: FeedbackReminderJobResult = {
    sent: 0,
    skippedOptOut: 0,
    skippedNoEmail: 0,
    skippedInvalid: 0,
    skippedNoOverdue: 0,
    skippedChurned: 0,
  };

  const unpaid = unpaidSnap ?? (await db.collection(INVOICES_COLLECTION).where('isPaid', '==', false).get());
  if (unpaid.empty) return result;

  // Collect overdue customer ids (15+ days, within the reminder window).
  const overdueCustomerIds = new Set<number>();
  for (const snap of unpaid.docs) {
    const data = snap.data();
    const dueDate = data.dueDate;
    if (isNumberValue(dueDate) && daysOverdue(dueDate, now) >= 15 && daysOverdue(dueDate, now) <= REMINDER_MAX_OVERDUE_DAYS) {
      const cid = data.customerId;
      if (isNumberValue(cid) && Number.isFinite(cid)) {
        overdueCustomerIds.add(cid);
      }
    }
  }

  if (overdueCustomerIds.size === 0) return result;

  // Resolve customer emails.
  const customerIds = [...overdueCustomerIds];
  const customerMap = new Map<string, { email: string; name: string; optOut: boolean; lifecycle: string }>();
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const customerSnaps = await db.collection(CUSTOMERS_COLLECTION).where('customerId', 'in', chunk).get();
    for (const snap of customerSnaps.docs) {
      const data = snap.data();
      customerMap.set(String(data.customerId), {
        email: data.email || '',
        name: data.customerName || '',
        optOut: !!data.emailOptOut,
        lifecycle: data.lifecycle || 'active',
      });
    }
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
      await db.collection(CUSTOMERS_COLLECTION).doc(String(customerId)).update({ emailInvalid: true });
      result.skippedInvalid++;
      continue;
    }

    const token = randomUUID();
    const expiresAt = now + TOKEN_TTL_MS;
    await db
      .collection('feedback_tokens')
      .doc(token)
      .set({
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
        createdAt: now,
        expiresAt,
        openedAt: null,
        submittedAt: null,
      });
    // Best-effort MariaDB mirror (rollback only) — throttling never fails the
    // job. eventHash is '' for every overdue token; the column is not unique,
    // so every token is mirrored (parity with Firestore).
    try {
      const { prisma } = await import('@/lib/prisma');
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
    } catch (mirrorErr) {
      logWarn('[overdue-feedback] MariaDB token mirror failed (best-effort)', {
        error: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
      });
    }

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
// Lock + orchestrator
// ---------------------------------------------------------------------------

export async function acquireSyncLock(db: Firestore, now = Date.now()): Promise<boolean> {
  const ref = db.collection('sync_locks').doc(LOCK_DOC);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const leaseUntil = snap.exists ? Number(snap.data()?.leaseUntil || 0) : 0;
    if (leaseUntil > now) return false;
    tx.set(ref, { leaseUntil: now + SYNC_LOCK_LEASE_MS, lastRunAt: now, lastStatus: 'running' }, { merge: true });
    return true;
  });
  return result;
}

export async function completeSyncRun(db: Firestore, stats: SyncStats, error: string | null, now = Date.now()): Promise<void> {
  await db
    .collection('sync_locks')
    .doc(LOCK_DOC)
    .set(
      {
        leaseUntil: 0,
        lastRunAt: now,
        lastStatus: error ? 'error' : 'ok',
        lastError: error || '',
        lastStats: stats,
      },
      { merge: true },
    );
}

/** Sync orchestrator: budget → lock → customers → invoices → reminders → churn. */
export async function runHourlySync(db: Firestore, baseUrl: string, now = Date.now()): Promise<SyncStats> {
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

  // ---- Read-budget gate: protect the free-tier quota before doing anything ----
  const budget = await getBudgetState(db);
  logBudgetStatus(budget);
  const { runSync, runEmailJobs } = syncBudgetDecision(budget.used);
  if (!runSync) {
    logWarn('[splynx-sync] skipped — read budget exhausted for today', {
      used: budget.used,
      cap: ABSOLUTE_CAP,
      date: budget.date,
    });
    await completeSyncRun(db, stats, 'read budget exhausted', now);
    return stats;
  }

  if (!(await acquireSyncLock(db, now))) {
    logInfo('[splynx-sync] skipped — another run in progress');
    return stats;
  }

  let error: string | null = null;
  let journalId: string | undefined;
  try {
    // Write-ahead journal: record sync intent before any writes so a crash
    // mid-run leaves a recoverable trail (see src/lib/journal.ts).
    journalId = await journalBegin({ type: 'splynx-hourly-sync', payload: { started } });
    await sweepAndReportStaleJournals({ type: 'splynx-hourly-sync' });

    const customers = await reconcileCustomers(db, now);
    stats.customersUpserted = customers.upserted;
    stats.customersMarkedDeleted = customers.deleted;
    recordReads(customers.fetched);

    const invoices = await reconcileInvoices(db, now);
    stats.invoicesUpserted = invoices.upserted;
    stats.invoicesApiDenied = invoices.denied;
    recordReads(invoices.fetched);

    if (!runEmailJobs) {
      // Keep the mirror fresh but stop spending reads on email campaigns.
      logWarn('[splynx-sync] read budget low — skipping reminder/churn email jobs', {
        used: budget.used,
        cap: CRITICAL_CAP,
      });
      clearRouteCache();
      logInfo('[splynx-sync] completed (email jobs skipped)', { stats, durationMs: Date.now() - started });
      await completeSyncRun(db, stats, null, now);
      await flushReads(db);
      return stats;
    }

    // One shared unpaid-invoice scan for both reminder jobs.
    const unpaidSnap = await db.collection(INVOICES_COLLECTION).where('isPaid', '==', false).get();
    recordReads(unpaidSnap.size);
    const reminders = await runReminderJob(db, now, unpaidSnap);
    stats.reminders15 = reminders.sent15;
    stats.reminders30 = reminders.sent30;

    const churn = await runChurnSurveyJob(db, baseUrl, now);
    stats.churnSent = churn.sent;
    recordReads(churn.scanned);

    const winBack = await runWinBackJob(db, baseUrl, now);
    stats.winBackSent = winBack.sent;
    recordReads(winBack.scanned);

    const overdueFeedback = await runOverdueFeedbackReminderJob(db, baseUrl, now, unpaidSnap);
    stats.feedbackReminders = overdueFeedback.sent;

    // Persist support staff KPIs (weekly calendar bucket; idempotent, so the
    // hourly run just refreshes today's record + snapshot). Best-effort: a
    // failure here must never kill the main mirror sync.
    try {
      await persistStaffKPIs(db, { period: 'weekly' });
    } catch (kpiErr) {
      logError('[splynx-sync] staff KPI persistence failed', {
        error: kpiErr instanceof Error ? kpiErr.message : String(kpiErr),
      });
    }

    // Data changed — drop cached admin snapshots (respects min-refresh floors).
    clearRouteCache();

    await journalComplete(journalId, { stats });

    logInfo('[splynx-sync] completed', { stats, durationMs: Date.now() - started });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logError('[splynx-sync] failed', { error, durationMs: Date.now() - started });
    if (journalId) await journalFail(journalId, error);
  }

  await completeSyncRun(db, stats, error, now);
  await flushReads(db);
  return stats;
}

export function getPublicBaseUrl(): string {
  return process.env.FEEDBACK_BASE_URL || 'https://csat.iwn.ng';
}

export function getDb(): Firestore {
  return getAdminFirestore();
}
