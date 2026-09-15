import { logWarn } from '@/lib/logger';
import type { Prisma } from '@prisma/client';
import type { MirrorCustomerDoc, MirrorInvoiceDoc } from '@/lib/splynx-mirror-types';

// Best-effort MariaDB mirrors of the Splynx sync's Firestore writes.
// Firestore stays the source of truth during the strangler-fig transition;
// a mirror failure must never fail the sync, so every call is wrapped in
// try/catch + logWarn. Gated by CUSTOMERS_DB_WRITE (separate from the read
// flag) so dual-write can be enabled and monitored before reads flip.
//
// The DB layer is imported dynamically: the sync module is unit-tested with
// mocked Firestore, and tests must never load Prisma.

const enabled = process.env.CUSTOMERS_DB_WRITE === '1';

function toBigInt(v: number | null | undefined): bigint | null {
  if (v === null || v === undefined) return null;
  return BigInt(v);
}

export function mapCustomer(doc: MirrorCustomerDoc) {
  return {
    customerId: String(doc.customerId),
    customerName: doc.customerName,
    email: doc.email,
    billingEmail: doc.billingEmail,
    phone: doc.phone,
    login: doc.login,
    city: doc.city,
    state: doc.state ?? null,
    discountPercent: doc.discountPercent ?? null,
    splynxDateAdded: toBigInt(doc.splynxDateAdded),
    street: doc.street,
    status: doc.status,
    lifecycle: doc.lifecycle,
    online: doc.online,
    lastOnlineAt: toBigInt(doc.lastOnlineAt),
    lastUpdateAt: toBigInt(doc.lastUpdateAt),
    mrrTotal: doc.mrrTotal,
    accountType: doc.accountType,
    category: doc.category,
    servicePlan: doc.servicePlan,
    btsId: doc.btsId ?? null,
    btsName: doc.btsName ?? null,
    uispEndpointId: doc.uispEndpointId ?? null,
    uispEndpointName: doc.uispEndpointName ?? null,
    uispDeviceStatus: doc.uispDeviceStatus ?? null,
    uispOutageCount: doc.uispOutageCount ?? null,
    matchState: doc.matchState ?? 'pending',
    matchMethod: doc.matchMethod ?? null,
    matchScore: doc.matchScore ?? null,
    matchedAt: toBigInt(doc.matchedAt),
    matchUpdatedAt: toBigInt(doc.matchUpdatedAt),
    firstSyncedAt: toBigInt(doc.firstSyncedAt),
    lastSyncAt: toBigInt(doc.lastSyncAt),
    lastChangeAt: toBigInt(doc.lastChangeAt),
    deleted: doc.deleted,
    reminder15SentAt: toBigInt(doc.reminder15SentAt),
    reminder30SentAt: toBigInt(doc.reminder30SentAt),
    churnSurveySentAt: toBigInt(doc.churnSurveySentAt),
    churnSurveyToken: doc.churnSurveyToken,
    winBackSentAt: toBigInt(doc.winBackSentAt),
    winBackToken: doc.winBackToken,
    churnedAt: toBigInt(doc.churnedAt),
    inactiveSince: toBigInt(doc.inactiveSince),
    blockedSince: toBigInt(doc.blockedSince),
    emailOptOut: doc.emailOptOut,
    emailInvalid: doc.emailInvalid ?? false,
    overdueInfo: (doc.overdueInfo ?? null) as unknown as Prisma.InputJsonValue,
  };
}

export function mapInvoice(doc: MirrorInvoiceDoc) {
  return {
    invoiceId: String(doc.invoiceId),
    customerId: String(doc.customerId),
    number: doc.number,
    title: doc.title,
    total: doc.total,
    dueDate: toBigInt(doc.dueDate),
    date: toBigInt(doc.date),
    status: doc.status,
    isPaid: doc.isPaid,
    paidAt: toBigInt(doc.paidAt),
    items: (doc.items ?? null) as unknown as Prisma.InputJsonValue,
    reminder15SentAt: toBigInt(doc.reminder15SentAt),
    reminder30SentAt: toBigInt(doc.reminder30SentAt),
    syncedAt: toBigInt(doc.syncedAt),
  };
}

export async function mirrorUpsertCustomer(doc: MirrorCustomerDoc): Promise<void> {
  if (!enabled) return;
  try {
    const { upsertCustomer } = await import('@/lib/lib/db/customers');
    await upsertCustomer(mapCustomer(doc));
  } catch (e) {
    logWarn('[dual-write] MariaDB customer upsert failed', { customerId: doc.customerId, error: String(e) });
  }
}

export async function mirrorUpsertInvoice(doc: MirrorInvoiceDoc): Promise<void> {
  if (!enabled) return;
  try {
    const { upsertInvoice } = await import('@/lib/lib/db/invoices');
    await upsertInvoice(mapInvoice(doc));
  } catch (e) {
    logWarn('[dual-write] MariaDB invoice upsert failed', { invoiceId: doc.invoiceId, error: String(e) });
  }
}
