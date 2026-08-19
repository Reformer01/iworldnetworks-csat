import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted so vi.mock factories can reference them)
// ---------------------------------------------------------------------------

const prismaMock = vi.hoisted(() => ({
  customer: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  invoice: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn(),
  },
  churnSurvey: { create: vi.fn() },
  feedbackToken: { create: vi.fn(), findFirst: vi.fn() },
  syncLock: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  splynxMeta: { upsert: vi.fn(), findUnique: vi.fn() },
}));

const apiMock = vi.hoisted(() => ({
  getAllCustomers: vi.fn(),
  getUnpaidInvoices: vi.fn(),
  getDeletedInvoices: vi.fn(),
}));

const emailMock = vi.hoisted(() => ({
  sendInvoiceReminderEmail: vi.fn(),
  sendChurnSurveyEmail: vi.fn(),
  sendFeedbackEmail: vi.fn(),
  sendWinBackEmail: vi.fn(),
}));

const syncDbMock = vi.hoisted(() => ({
  acquireSyncLock: vi.fn(),
  completeSyncRun: vi.fn(),
  setSplynxMeta: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const journalMock = vi.hoisted(() => ({
  journalBegin: vi.fn(),
  journalComplete: vi.fn(),
  journalFail: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => {
    throw new Error('no firebase in tests');
  },
}));
vi.mock('../splynx-api', () => apiMock);
vi.mock('../email', () => emailMock);
vi.mock('../email-validity', () => ({ hasDeliverableEmail: vi.fn(async () => true) }));
vi.mock('../lib/db/sync', () => syncDbMock);
vi.mock('../logger', () => loggerMock);
vi.mock('../route-cache', () => ({ clearRouteCache: vi.fn() }));
vi.mock('@/lib/journal', () => journalMock);
vi.mock('@/lib/staff-kpis', () => ({ persistStaffKPIs: vi.fn(async () => ({})) }));

import {
  rowToCustomerDoc,
  rowToInvoiceDoc,
  buildCustomerDoc,
  docChanged,
  reconcileCustomersDb,
  reconcileInvoicesDb,
  runReminderJobDb,
  runChurnSurveyJobDb,
  runWinBackJobDb,
  runOverdueFeedbackReminderJobDb,
  runHourlySyncDb,
} from '../splynx-sync-db';
import { hasDeliverableEmail } from '../email-validity';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = Date.UTC(2026, 7, 14, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

type CustomerRowOverrides = Partial<{
  customerId: string;
  customerName: string;
  email: string;
  billingEmail: string;
  phone: string;
  login: string;
  city: string;
  street: string;
  status: string;
  lifecycle: string;
  online: boolean;
  lastOnlineAt: bigint | null;
  lastUpdateAt: bigint | null;
  mrrTotal: number;
  accountType: string;
  category: string;
  servicePlan: string;
  firstSyncedAt: bigint;
  lastSyncAt: bigint;
  lastChangeAt: bigint;
  deleted: boolean;
  reminder15SentAt: bigint | null;
  reminder30SentAt: bigint | null;
  churnSurveySentAt: bigint | null;
  churnSurveyToken: string | null;
  winBackSentAt: bigint | null;
  winBackToken: string | null;
  churnedAt: bigint | null;
  inactiveSince: bigint | null;
  emailOptOut: boolean;
  emailInvalid: boolean;
  overdueInfo: unknown;
}>;

function customerRow(over: CustomerRowOverrides = {}) {
  return {
    customerId: '1',
    customerName: 'Acme ISP',
    email: 'billing@acme.test',
    billingEmail: '',
    phone: '',
    login: 'acme',
    city: 'Ibadan',
    street: '',
    status: 'active',
    lifecycle: 'active',
    online: false,
    lastOnlineAt: null,
    lastUpdateAt: null,
    mrrTotal: 1000,
    accountType: 'regular',
    category: '',
    servicePlan: 'Home 10',
    firstSyncedAt: BigInt(NOW - DAY),
    lastSyncAt: BigInt(NOW - DAY),
    lastChangeAt: BigInt(NOW - DAY),
    deleted: false,
    reminder15SentAt: null,
    reminder30SentAt: null,
    churnSurveySentAt: null,
    churnSurveyToken: null,
    winBackSentAt: null,
    winBackToken: null,
    churnedAt: null,
    inactiveSince: null,
    emailOptOut: false,
    emailInvalid: false,
    overdueInfo: null,
    ...over,
  };
}

type InvoiceRowOverrides = Partial<{
  invoiceId: string;
  customerId: string;
  number: string;
  title: string;
  total: number;
  dueDate: bigint;
  date: bigint;
  status: string;
  isPaid: boolean;
  paidAt: bigint | null;
  reminder15SentAt: bigint | null;
  reminder30SentAt: bigint | null;
  syncedAt: bigint;
}>;

function invoiceRow(over: InvoiceRowOverrides = {}) {
  return {
    invoiceId: '101',
    customerId: '1',
    number: 'INV-101',
    title: 'Monthly',
    total: 1000,
    dueDate: BigInt(NOW - 20 * DAY),
    date: BigInt(NOW - 50 * DAY),
    status: 'unpaid',
    isPaid: false,
    paidAt: null,
    reminder15SentAt: null,
    reminder30SentAt: null,
    syncedAt: BigInt(NOW - DAY),
    ...over,
  };
}

type CustomerRecordOverrides = Partial<{
  id: number;
  name: string;
  login: string;
  email: string;
  billing_email: string;
  phone: string;
  city: string;
  street_1: string;
  status: string;
  last_online: string;
  last_update: string;
  mrr_total: string;
  account_type: string;
  category: string;
  plan: string;
}>;

function customerRecord(over: CustomerRecordOverrides = {}) {
  return {
    id: 1,
    name: 'Acme ISP',
    login: 'acme',
    email: 'billing@acme.test',
    billing_email: '',
    phone: '',
    city: 'Ibadan',
    street_1: '',
    status: 'active',
    last_online: '',
    last_update: '',
    mrr_total: '1000',
    account_type: 'regular',
    category: '',
    plan: 'Home 10',
    ...over,
  };
}

type InvoiceRecordOverrides = Partial<{
  id: number;
  customerId: number;
  number: string;
  title: string;
  total: number;
  dueDate: number;
  date: number;
  status: string;
  isPaid: boolean;
  paidAt: number | null;
}>;

function invoiceRecord(over: InvoiceRecordOverrides = {}) {
  return {
    id: 101,
    customerId: 1,
    number: 'INV-101',
    title: 'Monthly',
    total: 1000,
    dueDate: NOW - 20 * DAY,
    date: NOW - 50 * DAY,
    status: 'unpaid',
    isPaid: false,
    paidAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.customer.findMany.mockResolvedValue([]);
  prismaMock.customer.upsert.mockResolvedValue({});
  prismaMock.customer.update.mockResolvedValue({});
  prismaMock.invoice.findMany.mockResolvedValue([]);
  prismaMock.invoice.upsert.mockResolvedValue({});
  prismaMock.invoice.update.mockResolvedValue({});
  prismaMock.invoice.delete.mockResolvedValue({});
  prismaMock.churnSurvey.create.mockResolvedValue({});
  prismaMock.feedbackToken.create.mockResolvedValue({});
  syncDbMock.acquireSyncLock.mockResolvedValue(true);
  syncDbMock.completeSyncRun.mockResolvedValue(undefined);
  syncDbMock.setSplynxMeta.mockResolvedValue({});
  journalMock.journalBegin.mockResolvedValue('journal-1');
  journalMock.journalComplete.mockResolvedValue(undefined);
  journalMock.journalFail.mockResolvedValue(undefined);
  // SAFETY: hasDeliverableEmail is mocked via vi.mock and returns a vi.fn().
  (hasDeliverableEmail as ReturnType<typeof vi.fn>).mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

describe('rowToCustomerDoc', () => {
  it('converts bigint timestamps to numbers and fills defaults', () => {
    const doc = rowToCustomerDoc(customerRow());
    expect(doc.customerId).toBe(1);
    expect(doc.customerName).toBe('Acme ISP');
    expect(doc.lastSyncAt).toBe(NOW - DAY);
    expect(doc.lastChangeAt).toBe(NOW - DAY);
    expect(doc.lifecycle).toBe('active');
    expect(doc.deleted).toBe(false);
    expect(doc.reminder15SentAt).toBeNull();
    expect(doc.overdueInfo).toBeNull();
  });

  it('maps null timestamps to null', () => {
    const doc = rowToCustomerDoc(customerRow({ lastOnlineAt: null, churnedAt: null }));
    expect(doc.lastOnlineAt).toBeNull();
    expect(doc.churnedAt).toBeNull();
  });
});

describe('rowToInvoiceDoc', () => {
  it('converts bigint timestamps to numbers', () => {
    const doc = rowToInvoiceDoc(invoiceRow());
    expect(doc.invoiceId).toBe(101);
    expect(doc.customerId).toBe(1);
    expect(doc.dueDate).toBe(NOW - 20 * DAY);
    expect(doc.isPaid).toBe(false);
    expect(doc.syncedAt).toBe(NOW - DAY);
  });
});

// ---------------------------------------------------------------------------
// buildCustomerDoc / docChanged
// ---------------------------------------------------------------------------

describe('buildCustomerDoc', () => {
  it('creates a fresh doc for a new customer', () => {
    const doc = buildCustomerDoc(undefined, { customerId: 1, customerName: 'New', lifecycle: 'active' }, NOW);
    expect(doc.firstSyncedAt).toBe(NOW);
    expect(doc.lastChangeAt).toBe(NOW);
    expect(doc.deleted).toBe(false);
    expect(doc.churnedAt).toBeNull();
    expect(doc.inactiveSince).toBeNull();
  });

  it('keeps a churned customer churned when Splynx flaps to inactive', () => {
    const prev = rowToCustomerDoc(customerRow({ lifecycle: 'churned', churnedAt: BigInt(NOW - DAY) }));
    const doc = buildCustomerDoc(prev, { customerId: 1, lifecycle: 'inactive' }, NOW);
    expect(doc.lifecycle).toBe('churned');
    expect(doc.churnedAt).toBe(NOW - DAY);
  });

  it('reclassifies long-inactive customers as churned', () => {
    const prev = rowToCustomerDoc(customerRow({ lifecycle: 'inactive', inactiveSince: BigInt(NOW - 91 * DAY) }));
    const doc = buildCustomerDoc(prev, { customerId: 1, lifecycle: 'inactive' }, NOW);
    expect(doc.lifecycle).toBe('churned');
    expect(doc.churnedAt).toBe(NOW);
  });

  it('sets churnedAt on first transition to churned and clears it when leaving', () => {
    const prev = rowToCustomerDoc(customerRow({ lifecycle: 'active' }));
    const doc = buildCustomerDoc(prev, { customerId: 1, lifecycle: 'churned' }, NOW);
    expect(doc.churnedAt).toBe(NOW);

    const doc2 = buildCustomerDoc(doc, { customerId: 1, lifecycle: 'active' }, NOW + DAY);
    expect(doc2.churnedAt).toBeNull();
  });

  it('preserves lastChangeAt when nothing changed', () => {
    const prev = rowToCustomerDoc(customerRow());
    const fields = {
      customerId: 1,
      customerName: 'Acme ISP',
      email: 'billing@acme.test',
      billingEmail: '',
      phone: '',
      login: 'acme',
      city: 'Ibadan',
      street: '',
      status: 'active',
      lifecycle: 'active',
      online: false,
      lastOnlineAt: null,
      lastUpdateAt: null,
      mrrTotal: 1000,
      accountType: 'regular',
      category: '',
      servicePlan: 'Home 10',
    };
    const doc = buildCustomerDoc(prev, fields, NOW);
    expect(doc.lastChangeAt).toBe(NOW - DAY);
  });
});

describe('docChanged', () => {
  it('returns false when only the sync heartbeat differs', () => {
    const prev = rowToCustomerDoc(customerRow());
    const next = { ...prev, lastSyncAt: NOW };
    expect(docChanged(prev, next)).toBe(false);
  });

  it('returns true when a data field differs', () => {
    const prev = rowToCustomerDoc(customerRow());
    const next = { ...prev, mrrTotal: 2000, lastChangeAt: NOW };
    expect(docChanged(prev, next)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reconcileCustomersDb
// ---------------------------------------------------------------------------

describe('reconcileCustomersDb', () => {
  it('upserts every record when the DB is empty', async () => {
    apiMock.getAllCustomers.mockResolvedValue([customerRecord(), customerRecord({ id: 2, name: 'Beta' })]);
    const result = await reconcileCustomersDb(NOW);
    expect(result.upserted).toBe(2);
    expect(result.deleted).toBe(0);
    expect(result.fetched).toBe(2);
    expect(prismaMock.customer.upsert).toHaveBeenCalledTimes(2);
    const [args] = prismaMock.customer.upsert.mock.calls[0];
    expect(args.where).toEqual({ customerId: '1' });
    expect(args.create.customerName).toBe('Acme ISP');
    expect(args.create.firstSyncedAt).toBe(BigInt(NOW));
  });

  it('skips unchanged customers', async () => {
    apiMock.getAllCustomers.mockResolvedValue([customerRecord()]);
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    const result = await reconcileCustomersDb(NOW);
    expect(result.upserted).toBe(0);
    expect(prismaMock.customer.upsert).not.toHaveBeenCalled();
  });

  it('updates changed customers', async () => {
    apiMock.getAllCustomers.mockResolvedValue([customerRecord({ mrr_total: '2500' })]);
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    const result = await reconcileCustomersDb(NOW);
    expect(result.upserted).toBe(1);
    expect(prismaMock.customer.upsert).toHaveBeenCalledTimes(1);
    const [args] = prismaMock.customer.upsert.mock.calls[0];
    expect(args.update.mrrTotal).toBe(2500);
    expect(args.update.lastChangeAt).toBe(BigInt(NOW));
  });

  it('marks customers missing from the live list as deleted', async () => {
    apiMock.getAllCustomers.mockResolvedValue([customerRecord(), customerRecord({ id: 2 })]);
    prismaMock.customer.findMany.mockResolvedValue([customerRow(), customerRow({ customerId: '2' }), customerRow({ customerId: '3' })]);
    const result = await reconcileCustomersDb(NOW);
    expect(result.deleted).toBe(1);
    expect(prismaMock.customer.update).toHaveBeenCalledWith({
      where: { customerId: '3' },
      data: { deleted: true, lastChangeAt: BigInt(NOW) },
    });
  });
});

// ---------------------------------------------------------------------------
// reconcileInvoicesDb
// ---------------------------------------------------------------------------

describe('reconcileInvoicesDb', () => {
  it('records invoicesApiDenied on a 403 from the unpaid endpoint', async () => {
    apiMock.getUnpaidInvoices.mockRejectedValue(new Error('403 Forbidden'));
    const result = await reconcileInvoicesDb(NOW);
    expect(result.denied).toBe(true);
    expect(syncDbMock.setSplynxMeta).toHaveBeenCalledWith({ invoicesApiDenied: true, deniedAt: NOW });
  });

  it('upserts changed invoices and skips unchanged ones', async () => {
    apiMock.getUnpaidInvoices.mockResolvedValue([invoiceRecord()]);
    apiMock.getDeletedInvoices.mockResolvedValue([]);
    prismaMock.invoice.findMany.mockResolvedValue([invoiceRow()]);
    const result = await reconcileInvoicesDb(NOW);
    expect(result.upserted).toBe(0);
    expect(prismaMock.invoice.upsert).not.toHaveBeenCalled();
    expect(syncDbMock.setSplynxMeta).toHaveBeenCalledWith({ invoicesApiDenied: false, lastInvoiceSyncAt: NOW });

    apiMock.getUnpaidInvoices.mockResolvedValue([invoiceRecord({ total: 500 })]);
    const result2 = await reconcileInvoicesDb(NOW);
    expect(result2.upserted).toBe(1);
    const [args] = prismaMock.invoice.upsert.mock.calls[0];
    expect(args.update.total).toBe(500);
  });

  it('deletes invoices pruned in Splynx', async () => {
    apiMock.getUnpaidInvoices.mockResolvedValue([]);
    apiMock.getDeletedInvoices.mockResolvedValue([invoiceRecord({ id: 101 })]);
    prismaMock.invoice.findMany.mockResolvedValue([invoiceRow()]);
    const result = await reconcileInvoicesDb(NOW);
    expect(prismaMock.invoice.delete).toHaveBeenCalledWith({ where: { invoiceId: '101' } });
    expect(result.upserted).toBe(0);
  });

  it('denormalizes overdueInfo onto customer rows', async () => {
    apiMock.getUnpaidInvoices.mockResolvedValue([invoiceRecord()]);
    apiMock.getDeletedInvoices.mockResolvedValue([]);
    await reconcileInvoicesDb(NOW);
    expect(prismaMock.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: '1' },
        data: expect.objectContaining({ overdueInfo: expect.objectContaining({ hasOverdueInvoice: true }) }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// runReminderJobDb
// ---------------------------------------------------------------------------

describe('runReminderJobDb', () => {
  it('returns zeros when there are no unpaid invoices', async () => {
    const result = await runReminderJobDb(NOW, []);
    expect(result).toEqual({ sent15: 0, sent30: 0, skippedOptOut: 0, skippedInvalid: 0, skippedChurned: 0, skippedStale: 0 });
    expect(emailMock.sendInvoiceReminderEmail).not.toHaveBeenCalled();
  });

  it('sends a 15d reminder for a single invoice and records the flag', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    const result = await runReminderJobDb(NOW, [invoiceRow()]);
    expect(result.sent15).toBe(1);
    expect(emailMock.sendInvoiceReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@acme.test',
        invoices: expect.arrayContaining([expect.objectContaining({ invoiceNumber: 'INV-101', daysOverdue: 20 })]),
        reminderType: '15d',
      }),
    );
    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: { in: ['101'] }, reminder15SentAt: null },
      data: { reminder15SentAt: BigInt(NOW) },
    });
  });

  it('sends a 30d reminder for a single invoice and supersedes the 15d flag', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    const result = await runReminderJobDb(NOW, [invoiceRow({ dueDate: BigInt(NOW - 35 * DAY) })]);
    expect(result.sent30).toBe(1);
    expect(emailMock.sendInvoiceReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@acme.test',
        invoices: expect.arrayContaining([expect.objectContaining({ invoiceNumber: 'INV-101', daysOverdue: 35 })]),
        reminderType: '30d',
      }),
    );
    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: { in: ['101'] }, reminder30SentAt: null },
      data: { reminder30SentAt: BigInt(NOW), reminder15SentAt: BigInt(NOW) },
    });
  });

  it('groups multiple invoices for same customer into ONE email', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    const invoices = [
      invoiceRow({ invoiceId: '101', number: 'INV-101', dueDate: BigInt(NOW - 20 * DAY) }),
      invoiceRow({ invoiceId: '102', number: 'INV-102', dueDate: BigInt(NOW - 25 * DAY) }),
    ];
    const result = await runReminderJobDb(NOW, invoices);
    expect(result.sent15).toBe(1); // ONE email for both invoices
    expect(emailMock.sendInvoiceReminderEmail).toHaveBeenCalledTimes(1);
    expect(emailMock.sendInvoiceReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@acme.test',
        invoices: expect.arrayContaining([
          expect.objectContaining({ invoiceNumber: 'INV-101' }),
          expect.objectContaining({ invoiceNumber: 'INV-102' }),
        ]),
        reminderType: '15d',
      }),
    );
    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: { in: ['101', '102'] }, reminder15SentAt: null },
      data: { reminder15SentAt: BigInt(NOW) },
    });
  });

  it('sends 30d reminder when any invoice is 30+ days overdue (supersedes 15d)', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    const invoices = [
      invoiceRow({ invoiceId: '101', number: 'INV-101', dueDate: BigInt(NOW - 20 * DAY) }), // 15d
      invoiceRow({ invoiceId: '102', number: 'INV-102', dueDate: BigInt(NOW - 35 * DAY) }), // 30d
    ];
    const result = await runReminderJobDb(NOW, invoices);
    expect(result.sent30).toBe(1); // 30d takes priority
    expect(result.sent15).toBe(0);
    expect(emailMock.sendInvoiceReminderEmail).toHaveBeenCalledTimes(1);
    expect(emailMock.sendInvoiceReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderType: '30d',
        invoices: expect.arrayContaining([
          expect.objectContaining({ invoiceNumber: 'INV-101' }),
          expect.objectContaining({ invoiceNumber: 'INV-102' }),
        ]),
      }),
    );
    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: { in: ['101', '102'] }, reminder30SentAt: null },
      data: { reminder30SentAt: BigInt(NOW), reminder15SentAt: BigInt(NOW) },
    });
  });

  it('skips churned customers', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow({ lifecycle: 'churned' })]);
    const result = await runReminderJobDb(NOW, [invoiceRow()]);
    expect(result.skippedChurned).toBe(1);
    expect(emailMock.sendInvoiceReminderEmail).not.toHaveBeenCalled();
  });

  it('skips opted-out customers', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow({ emailOptOut: true })]);
    const result = await runReminderJobDb(NOW, [invoiceRow()]);
    expect(result.skippedOptOut).toBe(1);
  });

  it('flags undeliverable emails and skips', async () => {
    (hasDeliverableEmail as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    const result = await runReminderJobDb(NOW, [invoiceRow()]);
    expect(result.skippedInvalid).toBe(1);
    expect(prismaMock.customer.update).toHaveBeenCalledWith({
      where: { customerId: '1' },
      data: { emailInvalid: true },
    });
  });

  it('skips invoices older than the reminder window', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    const result = await runReminderJobDb(NOW, [invoiceRow({ dueDate: BigInt(NOW - 95 * DAY) })]);
    expect(result.skippedStale).toBe(1);
    expect(emailMock.sendInvoiceReminderEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runChurnSurveyJobDb
// ---------------------------------------------------------------------------

describe('runChurnSurveyJobDb', () => {
  it('sends a survey for recent churn and records the token', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow({ lifecycle: 'churned', churnedAt: BigInt(NOW - 5 * DAY) })]);
    const result = await runChurnSurveyJobDb('https://csat.iwn.ng', NOW);
    expect(result.sent).toBe(1);
    expect(emailMock.sendChurnSurveyEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'billing@acme.test', churnUrl: expect.stringContaining('/churn?token=') }),
    );
    expect(prismaMock.churnSurvey.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { customerId: '1', churnSurveySentAt: null },
      data: expect.objectContaining({ churnSurveySentAt: BigInt(NOW), churnSurveyToken: expect.any(String) }),
    });
  });

  it('skips stale churn (outside the 30-day window)', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow({ lifecycle: 'churned', churnedAt: BigInt(NOW - 60 * DAY) })]);
    const result = await runChurnSurveyJobDb('https://csat.iwn.ng', NOW);
    expect(result.skippedStale).toBe(1);
    expect(emailMock.sendChurnSurveyEmail).not.toHaveBeenCalled();
  });

  it('skips customers already surveyed', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow({ lifecycle: 'churned', churnedAt: BigInt(NOW - 5 * DAY), churnSurveySentAt: BigInt(NOW - 1 * DAY) })]);
    const result = await runChurnSurveyJobDb('https://csat.iwn.ng', NOW);
    expect(result.sent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runWinBackJobDb
// ---------------------------------------------------------------------------

describe('runWinBackJobDb', () => {
  it('mints a feedback token and sends the win-back email', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow({ lifecycle: 'churned', churnedAt: BigInt(NOW - 10 * DAY) })]);
    const result = await runWinBackJobDb('https://csat.iwn.ng', NOW);
    expect(result.sent).toBe(1);
    expect(prismaMock.feedbackToken.create).toHaveBeenCalledTimes(1);
    const [args] = prismaMock.feedbackToken.create.mock.calls[0];
    expect(args.data.eventHash).toBe('winback-1');
    expect(emailMock.sendWinBackEmail).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackUrl: expect.stringContaining('/feedback/popup?token=') }),
    );
    expect(prismaMock.customer.updateMany).toHaveBeenCalledWith({
      where: { customerId: '1', winBackSentAt: null },
      data: expect.objectContaining({ winBackSentAt: BigInt(NOW), winBackToken: expect.any(String) }),
    });
  });

  it('skips churn older than the 90-day window', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow({ lifecycle: 'churned', churnedAt: BigInt(NOW - 120 * DAY) })]);
    const result = await runWinBackJobDb('https://csat.iwn.ng', NOW);
    expect(result.skippedStale).toBe(1);
    expect(emailMock.sendWinBackEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runOverdueFeedbackReminderJobDb
// ---------------------------------------------------------------------------

describe('runOverdueFeedbackReminderJobDb', () => {
  it('creates an overdue feedback token (eventHash "") and sends the email', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    const result = await runOverdueFeedbackReminderJobDb('https://csat.iwn.ng', NOW, [invoiceRow()]);
    expect(result.sent).toBe(1);
    expect(prismaMock.feedbackToken.create).toHaveBeenCalledTimes(1);
    const [args] = prismaMock.feedbackToken.create.mock.calls[0];
    expect(args.data.eventHash).toBe('');
    expect(args.data.sourceEvent).toBe('overdue:1');
    expect(emailMock.sendFeedbackEmail).toHaveBeenCalledWith(
      expect.objectContaining({ feedbackUrl: expect.stringContaining('/feedback?token=') }),
    );
  });

  it('skips churned customers', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow({ lifecycle: 'churned' })]);
    const result = await runOverdueFeedbackReminderJobDb('https://csat.iwn.ng', NOW, [invoiceRow()]);
    expect(result.skippedChurned).toBe(1);
    expect(prismaMock.feedbackToken.create).not.toHaveBeenCalled();
  });

  it('does not re-send when a recent token already exists for the same customer', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customerRow()]);
    prismaMock.feedbackToken.findFirst.mockResolvedValue({ id: 'existing-token', expiresAt: BigInt(NOW + 7 * DAY) });
    const result = await runOverdueFeedbackReminderJobDb('https://csat.iwn.ng', NOW, [invoiceRow()]);
    expect(result.sent).toBe(0);
    expect(prismaMock.feedbackToken.create).not.toHaveBeenCalled();
    expect(emailMock.sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it('returns zeros when nothing is overdue', async () => {
    const result = await runOverdueFeedbackReminderJobDb('https://csat.iwn.ng', NOW, [invoiceRow({ dueDate: BigInt(NOW - 5 * DAY) })]);
    expect(result.sent).toBe(0);
    expect(prismaMock.feedbackToken.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runHourlySyncDb
// ---------------------------------------------------------------------------

describe('runHourlySyncDb', () => {
  it('skips when another run holds the lease', async () => {
    syncDbMock.acquireSyncLock.mockResolvedValue(false);
    const stats = await runHourlySyncDb('https://csat.iwn.ng', NOW);
    expect(stats.customersUpserted).toBe(0);
    expect(apiMock.getAllCustomers).not.toHaveBeenCalled();
    expect(syncDbMock.completeSyncRun).not.toHaveBeenCalled();
  });

  it('runs the full pipeline and records completion', async () => {
    apiMock.getAllCustomers.mockResolvedValue([]);
    apiMock.getUnpaidInvoices.mockResolvedValue([]);
    apiMock.getDeletedInvoices.mockResolvedValue([]);
    const stats = await runHourlySyncDb('https://csat.iwn.ng', NOW);
    expect(apiMock.getAllCustomers).toHaveBeenCalled();
    expect(apiMock.getUnpaidInvoices).toHaveBeenCalled();
    expect(syncDbMock.completeSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({ customersUpserted: 0, invoicesUpserted: 0, invoicesApiDenied: false }),
      null,
      NOW,
    );
    expect(stats.invoicesApiDenied).toBe(false);
  });

  it('records the error and returns partial stats when a step throws', async () => {
    apiMock.getAllCustomers.mockRejectedValue(new Error('Splynx API down'));
    const stats = await runHourlySyncDb('https://csat.iwn.ng', NOW);
    expect(syncDbMock.completeSyncRun).toHaveBeenCalledWith(
      expect.any(Object),
      'Splynx API down',
      NOW,
    );
    expect(stats.customersUpserted).toBe(0);
  });
});