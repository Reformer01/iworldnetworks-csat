import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendInvoiceReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendChurnSurveyEmail: vi.fn().mockResolvedValue(undefined),
  sendWinBackEmail: vi.fn().mockResolvedValue(undefined),
  sendFeedbackEmail: vi.fn().mockResolvedValue(undefined),
  createFeedbackToken: vi.fn().mockResolvedValue({ token: 'winback-token-1', expiresAt: 9999999999999 }),
  hasDeliverableEmail: vi.fn().mockResolvedValue(true),
  getAllCustomers: vi.fn(),
  getUnpaidInvoices: vi.fn(),
  getDeletedInvoices: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/splynx-api', () => ({
  getAllCustomers: mocks.getAllCustomers,
  getUnpaidInvoices: mocks.getUnpaidInvoices,
  getDeletedInvoices: mocks.getDeletedInvoices,
}));

vi.mock('@/lib/email', () => ({
  sendInvoiceReminderEmail: mocks.sendInvoiceReminderEmail,
  sendChurnSurveyEmail: mocks.sendChurnSurveyEmail,
  sendWinBackEmail: mocks.sendWinBackEmail,
  sendFeedbackEmail: mocks.sendFeedbackEmail,
}));

vi.mock('@/lib/feedback-token', () => ({
  createFeedbackToken: mocks.createFeedbackToken,
  getFeedbackBaseUrl: vi.fn(),
  TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000,
}));

vi.mock('@/lib/email-validity', () => ({
  hasDeliverableEmail: mocks.hasDeliverableEmail,
}));

vi.mock('@/lib/logger', () => ({
  logInfo: mocks.logInfo,
  logWarn: mocks.logWarn,
  logError: mocks.logError,
}));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: () => {
    throw new Error('getAdminFirestore should not be called in unit tests');
  },
}));

import {
  classifyLifecycle,
  isOnline,
  parseSplynxDate,
  daysOverdue,
  formatDueDate,
  buildCustomerFields,
  buildCustomerOverdueInfo,
  upsertCustomer,
  upsertCustomerFromWebhook,
  upsertInvoiceFromWebhook,
  upsertInvoiceFromPaymentWebhook,
  reconcileInvoices,
  runReminderJob,
  runChurnSurveyJob,
  runWinBackJob,
  runOverdueFeedbackReminderJob,
} from '../splynx-mirror';
import { CHURN_COLLECTION } from '../splynx-mirror-types';
import type { SplynxCustomerListRecord } from '../splynx-api';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 5, 12, 0, 0); // 2026-08-05 12:00 UTC

function makeRecord(overrides: Partial<SplynxCustomerListRecord> = {}): SplynxCustomerListRecord {
  return {
    id: 1,
    login: 'ada@example.com',
    name: 'Ada Customer',
    email: 'ada@example.com',
    billing_email: 'ada@example.com',
    phone: '08012345678',
    street_1: 'Street 1',
    zip_code: '',
    city: 'Ibadan',
    status: 'active',
    date_add: '2026-01-01',
    last_online: '2026-08-01 10:00:00',
    last_update: '2026-08-04 10:00:00',
    mrr_total: '50000.0000',
    daily_prepaid_cost: '0.0000',
    account_type: 'regular',
    category: 'person',
    gps: '',
    additional_attributes: {},
    customer_labels: [],
    ...overrides,
  };
}

describe('classifyLifecycle', () => {
  it('maps splynx statuses to lifecycle states', () => {
    expect(classifyLifecycle('active')).toBe('active');
    expect(classifyLifecycle('blocked')).toBe('blocked');
    expect(classifyLifecycle('suspended')).toBe('blocked');
    expect(classifyLifecycle('inactive')).toBe('inactive');
    expect(classifyLifecycle('disabled')).toBe('churned');
    expect(classifyLifecycle('ACTIVE')).toBe('active');
  });

  it('defaults unknown statuses to active', () => {
    expect(classifyLifecycle('')).toBe('active');
    expect(classifyLifecycle('weird-state')).toBe('active');
  });
});

describe('isOnline', () => {
  it('returns true when last seen within 30 days', () => {
    expect(isOnline(NOW - 10 * DAY, NOW)).toBe(true);
  });

  it('returns false when never seen or stale', () => {
    expect(isOnline(null, NOW)).toBe(false);
    expect(isOnline(NOW - 31 * DAY, NOW)).toBe(false);
  });
});

describe('parseSplynxDate', () => {
  it('parses YYYY-MM-DD and YYYY-MM-DD HH:mm:ss', () => {
    expect(parseSplynxDate('2026-08-01')).not.toBeNull();
    expect(parseSplynxDate('2026-08-01 10:00:00')).not.toBeNull();
  });

  it('returns null for empty / zero dates', () => {
    expect(parseSplynxDate('')).toBeNull();
    expect(parseSplynxDate('0000-00-00 00:00:00')).toBeNull();
  });
});

describe('daysOverdue / formatDueDate', () => {
  it('computes full overdue days', () => {
    expect(daysOverdue(NOW - 15 * DAY, NOW)).toBe(15);
    expect(daysOverdue(NOW + 5 * DAY, NOW)).toBe(0);
  });

  it('formats due dates as ISO dates', () => {
    expect(formatDueDate(Date.UTC(2026, 6, 1))).toBe('2026-07-01');
  });
});

describe('buildCustomerFields', () => {
  it('maps list records including lifecycle + online', () => {
    const fields = buildCustomerFields(makeRecord(), NOW);
    expect(fields.customerName).toBe('Ada Customer');
    expect(fields.email).toBe('ada@example.com');
    expect(fields.lifecycle).toBe('active');
    expect(fields.online).toBe(true);
    expect(fields.mrrTotal).toBe(50000);
    expect(fields.status).toBe('active');
  });

  it('classifies disabled customers as churned + offline when stale', () => {
    const fields = buildCustomerFields(makeRecord({ status: 'disabled', last_online: '2025-01-01 00:00:00' }), NOW);
    expect(fields.lifecycle).toBe('churned');
    expect(fields.online).toBe(false);
  });

  it('classifies inactive customers as inactive (not churned)', () => {
    const fields = buildCustomerFields(makeRecord({ status: 'inactive', last_online: '2025-01-01 00:00:00' }), NOW);
    expect(fields.lifecycle).toBe('inactive');
    expect(fields.online).toBe(false);
  });

  it('classifies suspended customers as blocked (recoverable)', () => {
    const fields = buildCustomerFields(makeRecord({ status: 'suspended', last_online: '2025-01-01 00:00:00' }), NOW);
    expect(fields.lifecycle).toBe('blocked');
    expect(fields.online).toBe(false);
  });

  it('falls back to login when name is missing', () => {
    const fields = buildCustomerFields(makeRecord({ name: '' }), NOW);
    expect(fields.customerName).toBe('ada@example.com');
  });
});

describe('buildCustomerOverdueInfo', () => {
  it('finds the most overdue invoice and latest reminder timestamp for a customer', () => {
    const result = buildCustomerOverdueInfo(
      [
        {
          invoiceId: 100,
          customerId: 1,
          number: 'INV-100',
          title: 'August',
          total: 5000,
          dueDate: NOW - 20 * DAY,
          date: null,
          status: 'not_paid',
          isPaid: false,
          paidAt: null,
          reminder15SentAt: NOW - 2 * DAY,
          reminder30SentAt: null,
          syncedAt: NOW,
        },
        {
          invoiceId: 101,
          customerId: 1,
          number: 'INV-101',
          title: 'September',
          total: 7000,
          dueDate: NOW - 40 * DAY,
          date: null,
          status: 'not_paid',
          isPaid: false,
          paidAt: null,
          reminder15SentAt: NOW - DAY,
          reminder30SentAt: NOW - 3 * DAY,
          syncedAt: NOW,
        },
      ],
      NOW,
    );

    expect(result.hasOverdueInvoice).toBe(true);
    expect(result.overdueDays).toBe(40);
    expect(result.overdueInvoiceCount).toBe(2);
    expect(result.invoiceNumber).toBe('INV-101');
    expect(result.invoiceAmount).toBe(7000);
    expect(result.lastReminderSentAt).toBe(NOW - DAY);
    expect(result.lastReminderType).toBe('15d');
  });
});

// ---------------------------------------------------------------------------
// Fake Firestore
// ---------------------------------------------------------------------------

function makeFakeDb(configure: { invoices?: unknown[]; customers?: unknown[] }) {
  const updateSpies: ReturnType<typeof vi.fn>[] = [];
  const setSpies: ReturnType<typeof vi.fn>[] = [];

  const collections: Record<string, unknown> = {
    splynx_invoices: {
      where: () => ({
        get: async () => ({
          docs: (configure.invoices || []).map((data, index) => ({
            data: () => data,
            ref: {
              update: (payload: unknown) => {
                updateSpies.push(vi.fn());
                const spy = updateSpies[updateSpies.length - 1];
                spy(payload);
                return Promise.resolve();
              },
            },
          })),
          size: (configure.invoices || []).length,
          empty: (configure.invoices || []).length === 0,
        }),
      }),
    },
    splynx_customers: {
      where: () => ({
        get: async () => ({
          docs: (configure.customers || []).map((data) => ({
            data: () => data,
            ref: {
              update: (payload: unknown) => {
                updateSpies.push(vi.fn());
                const spy = updateSpies[updateSpies.length - 1];
                spy(payload);
                return Promise.resolve();
              },
            },
          })),
          size: (configure.customers || []).length,
          empty: (configure.customers || []).length === 0,
        }),
      }),
    },
    [CHURN_COLLECTION]: {
      doc: (id: string) => ({
        set: (payload: unknown) => {
          setSpies.push(vi.fn());
          const spy = setSpies[setSpies.length - 1];
          spy({ id, payload });
          return Promise.resolve();
        },
      }),
    },
    feedback_tokens: {
      doc: (id: string) => ({
        set: (payload: unknown) => {
          setSpies.push(vi.fn());
          const spy = setSpies[setSpies.length - 1];
          spy({ id, payload });
          return Promise.resolve();
        },
      }),
    },
  };

  return {
    db: { collection: (name: string) => (collections as Record<string, unknown>)[name] },
    updateSpies,
    setSpies,
  };
}

describe('runReminderJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends exactly one 15-day email per overdue invoice and flags it', async () => {
    const { db, updateSpies } = makeFakeDb({
      invoices: [
        {
          invoiceId: 10,
          customerId: 1,
          number: 'INV-001',
          total: 5000,
          dueDate: NOW - 20 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 1, email: 'ada@example.com', customerName: 'Ada Customer', emailOptOut: false }],
    });

    const result = await runReminderJob(db as never, NOW);

    expect(result.sent15).toBe(1);
    expect(result.sent30).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendInvoiceReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ada@example.com', invoiceNumber: 'INV-001', daysOverdue: 20 }),
    );
    expect(updateSpies).toHaveLength(1);
    expect(updateSpies[0]).toHaveBeenCalledWith(expect.objectContaining({ reminder15SentAt: NOW }));
  });

  it('does not re-send when the 15-day flag is already set (idempotent)', async () => {
    const { db } = makeFakeDb({
      invoices: [
        {
          invoiceId: 11,
          customerId: 1,
          number: 'INV-002',
          total: 5000,
          dueDate: NOW - 20 * DAY,
          reminder15SentAt: NOW - DAY,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 1, email: 'ada@example.com', customerName: 'Ada', emailOptOut: false }],
    });

    const result = await runReminderJob(db as never, NOW);

    expect(result.sent15).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).not.toHaveBeenCalled();
  });

  it('sends only the 30-day email for invoices already 30+ days overdue', async () => {
    const { db, updateSpies } = makeFakeDb({
      invoices: [
        {
          invoiceId: 12,
          customerId: 1,
          number: 'INV-003',
          total: 9000,
          dueDate: NOW - 35 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 1, email: 'ada@example.com', customerName: 'Ada', emailOptOut: false }],
    });

    const result = await runReminderJob(db as never, NOW);

    expect(result.sent15).toBe(0);
    expect(result.sent30).toBe(1);
    expect(mocks.sendInvoiceReminderEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendInvoiceReminderEmail).toHaveBeenCalledWith(expect.objectContaining({ daysOverdue: 35 }));
    expect(updateSpies[0]).toHaveBeenCalledWith(expect.objectContaining({ reminder30SentAt: NOW, reminder15SentAt: NOW }));
  });

  it('skips customers who opted out of email', async () => {
    const { db } = makeFakeDb({
      invoices: [
        {
          invoiceId: 13,
          customerId: 1,
          number: 'INV-004',
          total: 5000,
          dueDate: NOW - 20 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 1, email: 'ada@example.com', customerName: 'Ada', emailOptOut: true }],
    });

    const result = await runReminderJob(db as never, NOW);

    expect(result.skippedOptOut).toBe(1);
    expect(result.sent15).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).not.toHaveBeenCalled();
  });

  it('skips customers with undeliverable email and flags them emailInvalid', async () => {
    mocks.hasDeliverableEmail.mockResolvedValue(false);
    const { db, updateSpies } = makeFakeDb({
      invoices: [
        {
          invoiceId: 15,
          customerId: 1,
          number: 'INV-006',
          total: 5000,
          dueDate: NOW - 20 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 1, email: 'dead@nowhere.invalid', customerName: 'Ada', emailOptOut: false }],
    });

    const result = await runReminderJob(db as never, NOW);

    expect(result.skippedInvalid).toBe(1);
    expect(result.sent15).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).not.toHaveBeenCalled();
    expect(updateSpies[0]).toHaveBeenCalledWith(expect.objectContaining({ emailInvalid: true }));
    mocks.hasDeliverableEmail.mockResolvedValue(true);
  });

  it('skips invoices without a due date', async () => {
    const { db } = makeFakeDb({
      invoices: [
        { invoiceId: 14, customerId: 1, number: 'INV-005', total: 5000, dueDate: null, reminder15SentAt: null, reminder30SentAt: null },
      ],
      customers: [{ customerId: 1, email: 'ada@example.com', customerName: 'Ada', emailOptOut: false }],
    });

    const result = await runReminderJob(db as never, NOW);

    expect(result.sent15).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).not.toHaveBeenCalled();
  });

  it('never reminds customers whose service is already cut off (churned)', async () => {
    const { db } = makeFakeDb({
      invoices: [
        {
          invoiceId: 16,
          customerId: 2,
          number: 'INV-016',
          total: 5000,
          dueDate: NOW - 20 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 2, email: 'gone@example.com', customerName: 'Gone Away', emailOptOut: false, lifecycle: 'churned' }],
    });

    const result = await runReminderJob(db as never, NOW);

    expect(result.skippedChurned).toBe(1);
    expect(result.sent15).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).not.toHaveBeenCalled();
  });

  it('DOES remind inactive customers (they owe money and can return)', async () => {
    const { db, updateSpies } = makeFakeDb({
      invoices: [
        {
          invoiceId: 29,
          customerId: 5,
          number: 'INV-029',
          total: 5000,
          dueDate: NOW - 20 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [
        { customerId: 5, email: 'inactive@example.com', customerName: 'Inactive User', emailOptOut: false, lifecycle: 'inactive' },
      ],
    });

    const result = await runReminderJob(db as never, NOW);

    expect(result.sent15).toBe(1);
    expect(result.skippedChurned).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).toHaveBeenCalledTimes(1);
    expect(updateSpies[0]).toHaveBeenCalledWith(expect.objectContaining({ reminder15SentAt: NOW }));
  });

  it('never auto-reminds invoices older than 90 days overdue', async () => {
    const { db } = makeFakeDb({
      invoices: [
        {
          invoiceId: 17,
          customerId: 1,
          number: 'INV-017',
          total: 61275,
          dueDate: NOW - 675 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 1, email: 'ada@example.com', customerName: 'Ada', emailOptOut: false }],
    });

    const result = await runReminderJob(db as never, NOW);

    expect(result.skippedStale).toBe(1);
    expect(result.sent15).toBe(0);
    expect(result.sent30).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).not.toHaveBeenCalled();
  });

  it('still reminds on the exact 90-day boundary, but not a day later', async () => {
    const { db: db90 } = makeFakeDb({
      invoices: [
        {
          invoiceId: 27,
          customerId: 1,
          number: 'INV-027',
          total: 5000,
          dueDate: NOW - 90 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 1, email: 'ada@example.com', customerName: 'Ada', emailOptOut: false }],
    });

    const atBoundary = await runReminderJob(db90 as never, NOW);
    expect(atBoundary.sent30).toBe(1);
    expect(atBoundary.sent15).toBe(0);
    expect(atBoundary.skippedStale).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendInvoiceReminderEmail).toHaveBeenCalledWith(expect.objectContaining({ daysOverdue: 90 }));
    vi.clearAllMocks();

    const { db: db91 } = makeFakeDb({
      invoices: [
        {
          invoiceId: 28,
          customerId: 1,
          number: 'INV-028',
          total: 5000,
          dueDate: NOW - 91 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 1, email: 'ada@example.com', customerName: 'Ada', emailOptOut: false }],
    });

    const pastBoundary = await runReminderJob(db91 as never, NOW);
    expect(pastBoundary.skippedStale).toBe(1);
    expect(pastBoundary.sent15).toBe(0);
    expect(mocks.sendInvoiceReminderEmail).not.toHaveBeenCalled();
  });
});

describe('runOverdueFeedbackReminderJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a feedback email to an overdue active customer', async () => {
    const { db, setSpies } = makeFakeDb({
      invoices: [
        {
          invoiceId: 18,
          customerId: 3,
          number: 'INV-018',
          total: 5000,
          dueDate: NOW - 20 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 3, email: 'ada@example.com', customerName: 'Ada', emailOptOut: false, lifecycle: 'active' }],
    });

    const result = await runOverdueFeedbackReminderJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(1);
    expect(mocks.sendFeedbackEmail).toHaveBeenCalledTimes(1);
    expect(setSpies).toHaveLength(1);
  });

  it('never asks churned customers for billing feedback', async () => {
    const { db } = makeFakeDb({
      invoices: [
        {
          invoiceId: 19,
          customerId: 4,
          number: 'INV-019',
          total: 5000,
          dueDate: NOW - 20 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 4, email: 'gone@example.com', customerName: 'Gone Away', emailOptOut: false, lifecycle: 'churned' }],
    });

    const result = await runOverdueFeedbackReminderJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.skippedChurned).toBe(1);
    expect(result.sent).toBe(0);
    expect(mocks.sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it('never nudges invoices older than 90 days overdue', async () => {
    const { db } = makeFakeDb({
      invoices: [
        {
          invoiceId: 20,
          customerId: 3,
          number: 'INV-020',
          total: 5000,
          dueDate: NOW - 675 * DAY,
          reminder15SentAt: null,
          reminder30SentAt: null,
        },
      ],
      customers: [{ customerId: 3, email: 'ada@example.com', customerName: 'Ada', emailOptOut: false, lifecycle: 'active' }],
    });

    const result = await runOverdueFeedbackReminderJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(0);
    expect(mocks.sendFeedbackEmail).not.toHaveBeenCalled();
  });
});

describe('runChurnSurveyJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends one churn survey per newly churned customer and records the token', async () => {
    const { db, updateSpies, setSpies } = makeFakeDb({
      customers: [
        {
          customerId: 5,
          customerName: 'Ada Customer',
          email: 'ada@example.com',
          lifecycle: 'churned',
          deleted: false,
          churnSurveySentAt: null,
          emailOptOut: false,
          churnedAt: NOW - DAY,
        },
      ],
    });

    const result = await runChurnSurveyJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(1);
    expect(mocks.sendChurnSurveyEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendChurnSurveyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        churnUrl: expect.stringMatching(/^https:\/\/csat\.iwn\.ng\/churn\?token=[0-9a-f-]{36}$/),
      }),
    );
    expect(setSpies).toHaveLength(1);
    expect(setSpies[0]).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ customerId: 5, customerEmail: 'ada@example.com', expiresAt: NOW + 30 * DAY }),
      }),
    );
    expect(updateSpies[0]).toHaveBeenCalledWith(expect.objectContaining({ churnSurveySentAt: NOW, churnSurveyToken: expect.any(String) }));
  });

  it('does not re-send for customers already surveyed', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 6,
          customerName: 'Bob',
          email: 'bob@example.com',
          lifecycle: 'churned',
          deleted: false,
          churnSurveySentAt: NOW - DAY,
          emailOptOut: false,
          churnedAt: NOW - 2 * DAY,
        },
      ],
    });

    const result = await runChurnSurveyJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(0);
    expect(mocks.sendChurnSurveyEmail).not.toHaveBeenCalled();
  });

  it('skips churned customers without an email', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 7,
          customerName: 'No Mail',
          email: '',
          lifecycle: 'churned',
          deleted: false,
          churnSurveySentAt: null,
          emailOptOut: false,
          churnedAt: NOW - DAY,
        },
      ],
    });

    const result = await runChurnSurveyJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.skippedNoEmail).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('skips churned customers with undeliverable email and flags them emailInvalid', async () => {
    mocks.hasDeliverableEmail.mockResolvedValue(false);
    const { db, updateSpies } = makeFakeDb({
      customers: [
        {
          customerId: 8,
          customerName: 'Dead Email',
          email: 'dead@nowhere.invalid',
          lifecycle: 'churned',
          deleted: false,
          churnSurveySentAt: null,
          emailOptOut: false,
          churnedAt: NOW - DAY,
        },
      ],
    });

    const result = await runChurnSurveyJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.skippedInvalid).toBe(1);
    expect(result.sent).toBe(0);
    expect(mocks.sendChurnSurveyEmail).not.toHaveBeenCalled();
    expect(updateSpies[0]).toHaveBeenCalledWith(expect.objectContaining({ emailInvalid: true }));
    mocks.hasDeliverableEmail.mockResolvedValue(true);
  });

  it('never surveys customers who churned before the 30-day window', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 21,
          customerName: 'Old Churn',
          email: 'old@example.com',
          lifecycle: 'churned',
          deleted: false,
          churnSurveySentAt: null,
          emailOptOut: false,
          churnedAt: NOW - 31 * DAY,
        },
      ],
    });

    const result = await runChurnSurveyJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.skippedStale).toBe(1);
    expect(result.sent).toBe(0);
    expect(mocks.sendChurnSurveyEmail).not.toHaveBeenCalled();
  });

  it('never surveys customers whose churn predates churn tracking (no churnedAt)', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 22,
          customerName: 'Pre-Mirror Churn',
          email: 'old@example.com',
          lifecycle: 'churned',
          deleted: false,
          churnSurveySentAt: null,
          emailOptOut: false,
        },
      ],
    });

    const result = await runChurnSurveyJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.skippedStale).toBe(1);
    expect(result.sent).toBe(0);
    expect(mocks.sendChurnSurveyEmail).not.toHaveBeenCalled();
  });

  it('sends the survey on the exact last day of the 30-day window', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 25,
          customerName: 'Edge Churn',
          email: 'edge@example.com',
          lifecycle: 'churned',
          deleted: false,
          churnSurveySentAt: null,
          emailOptOut: false,
          churnedAt: NOW - 30 * DAY,
        },
      ],
    });

    const result = await runChurnSurveyJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(1);
    expect(result.skippedStale).toBe(0);
    expect(mocks.sendChurnSurveyEmail).toHaveBeenCalledTimes(1);
  });

  it('never surveys inactive customers (they are not churned)', async () => {
    const { db } = makeFakeDb({
      customers: [], // no churned customers = query returns empty
    });

    const result = await runChurnSurveyJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(0);
    expect(result.scanned).toBe(0); // query is lifecycle=='churned', so inactive not scanned
    expect(mocks.sendChurnSurveyEmail).not.toHaveBeenCalled();
  });
});

describe('runWinBackJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFeedbackToken.mockResolvedValue({ token: 'winback-token-1', expiresAt: 9999999999999 });
  });

  it('sends the win-back email with portal/csat/popup links and records winBackSentAt', async () => {
    const { db, updateSpies } = makeFakeDb({
      customers: [
        {
          customerId: 5,
          customerName: 'Ada Customer',
          email: 'ada@example.com',
          lifecycle: 'churned',
          deleted: false,
          winBackSentAt: null,
          emailOptOut: false,
          churnedAt: NOW - DAY,
        },
      ],
    });

    const result = await runWinBackJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(1);
    expect(mocks.sendWinBackEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendWinBackEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        portalUrl: 'https://portal.iwn.ng',
        csatUrl: 'https://csat.iwn.ng',
        feedbackUrl: 'https://csat.iwn.ng/feedback/popup?token=winback-token-1&embed=true',
      }),
    );
    expect(mocks.createFeedbackToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ customerEmail: 'ada@example.com', eventHash: 'winback-5' }),
    );
    expect(updateSpies[0]).toHaveBeenCalledWith(expect.objectContaining({ winBackSentAt: NOW, winBackToken: 'winback-token-1' }));
  });

  it('does not re-send for customers already emailed', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 6,
          customerName: 'Bob',
          email: 'bob@example.com',
          lifecycle: 'churned',
          deleted: false,
          winBackSentAt: NOW - DAY,
          emailOptOut: false,
          churnedAt: NOW - 2 * DAY,
        },
      ],
    });

    const result = await runWinBackJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(0);
    expect(mocks.sendWinBackEmail).not.toHaveBeenCalled();
  });

  it('skips churned customers without an email', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 7,
          customerName: 'No Mail',
          email: '',
          lifecycle: 'churned',
          deleted: false,
          winBackSentAt: null,
          emailOptOut: false,
          churnedAt: NOW - DAY,
        },
      ],
    });

    const result = await runWinBackJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.skippedNoEmail).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('skips churned customers with undeliverable email and flags them emailInvalid', async () => {
    mocks.hasDeliverableEmail.mockResolvedValue(false);
    const { db, updateSpies } = makeFakeDb({
      customers: [
        {
          customerId: 8,
          customerName: 'Dead Email',
          email: 'dead@nowhere.invalid',
          lifecycle: 'churned',
          deleted: false,
          winBackSentAt: null,
          emailOptOut: false,
          churnedAt: NOW - DAY,
        },
      ],
    });

    const result = await runWinBackJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.skippedInvalid).toBe(1);
    expect(result.sent).toBe(0);
    expect(mocks.sendWinBackEmail).not.toHaveBeenCalled();
    expect(updateSpies[0]).toHaveBeenCalledWith(expect.objectContaining({ emailInvalid: true }));
    mocks.hasDeliverableEmail.mockResolvedValue(true);
  });

  it('never sends the win-back offer to customers who churned before the 90-day window', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 23,
          customerName: 'Two Years Gone',
          email: 'gone@example.com',
          lifecycle: 'churned',
          deleted: false,
          winBackSentAt: null,
          emailOptOut: false,
          churnedAt: NOW - 2 * 365 * DAY,
        },
      ],
    });

    const result = await runWinBackJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.skippedStale).toBe(1);
    expect(result.sent).toBe(0);
    expect(mocks.sendWinBackEmail).not.toHaveBeenCalled();
    expect(mocks.createFeedbackToken).not.toHaveBeenCalled();
  });

  it('never sends the win-back offer when churn predates churn tracking (no churnedAt)', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 24,
          customerName: 'Pre-Mirror Churn',
          email: 'old@example.com',
          lifecycle: 'churned',
          deleted: false,
          winBackSentAt: null,
          emailOptOut: false,
        },
      ],
    });

    const result = await runWinBackJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.skippedStale).toBe(1);
    expect(result.sent).toBe(0);
    expect(mocks.sendWinBackEmail).not.toHaveBeenCalled();
  });

  it('sends the win-back offer on the exact last day of the 90-day window', async () => {
    const { db } = makeFakeDb({
      customers: [
        {
          customerId: 26,
          customerName: 'Edge Churn',
          email: 'edge@example.com',
          lifecycle: 'churned',
          deleted: false,
          winBackSentAt: null,
          emailOptOut: false,
          churnedAt: NOW - 90 * DAY,
        },
      ],
    });

    const result = await runWinBackJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(1);
    expect(result.skippedStale).toBe(0);
    expect(mocks.sendWinBackEmail).toHaveBeenCalledTimes(1);
  });

  it('never sends the win-back offer to inactive customers (they are not churned)', async () => {
    const { db } = makeFakeDb({
      customers: [], // no churned customers = query returns empty
    });

    const result = await runWinBackJob(db as never, 'https://csat.iwn.ng', NOW);

    expect(result.sent).toBe(0);
    expect(result.scanned).toBe(0); // query is lifecycle=='churned', so inactive not scanned
    expect(mocks.sendWinBackEmail).not.toHaveBeenCalled();
    expect(mocks.createFeedbackToken).not.toHaveBeenCalled();
  });
});

describe('upsertCustomer churn tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records churnedAt when a brand-new customer is already churned', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set,
          update: vi.fn(),
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 30, status: 'disabled' }), NOW);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'churned', status: 'disabled', churnedAt: NOW }));
  });

  it('sets churnedAt when an active customer flips to churned', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { customerId: 31, customerName: 'Ada', lifecycle: 'active', status: 'active' };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 31, status: 'disabled' }), NOW);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'churned', churnedAt: NOW }));
  });

  it('clears churnedAt when a churned customer is re-activated', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { customerId: 32, customerName: 'Ada', lifecycle: 'churned', status: 'disabled', churnedAt: NOW - 10 * DAY };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 32, status: 'active' }), NOW);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'active', churnedAt: null }));
  });

  it('preserves the original churnedAt when a churned customer changes unrelated fields', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { customerId: 33, customerName: 'Old Name', lifecycle: 'churned', status: 'disabled', churnedAt: NOW - 10 * DAY };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 33, name: 'New Name', status: 'disabled' }), NOW);

    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ churnedAt: expect.anything() }));
  });

  it('sets inactiveSince when a new customer is already inactive', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set,
          update: vi.fn(),
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 34, status: 'inactive' }), NOW);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'inactive', status: 'inactive', inactiveSince: NOW }));
  });

  it('sets inactiveSince when an active customer flips to inactive', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { customerId: 35, customerName: 'Ada', lifecycle: 'active', status: 'active' };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 35, status: 'inactive' }), NOW);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'inactive', inactiveSince: NOW }));
  });

  it('clears inactiveSince when an inactive customer is re-activated', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { customerId: 36, customerName: 'Ada', lifecycle: 'inactive', status: 'inactive', inactiveSince: NOW - 10 * DAY };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 36, status: 'active' }), NOW);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'active', inactiveSince: null }));
  });

  it('preserves the original inactiveSince when an inactive customer changes unrelated fields', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { customerId: 37, customerName: 'Old Name', lifecycle: 'inactive', status: 'inactive', inactiveSince: NOW - 10 * DAY };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 37, name: 'New Name', status: 'inactive' }), NOW);

    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ inactiveSince: expect.anything() }));
  });

  it('reclassifies long-inactive (90d+) customers as churned and sets churnedAt', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { customerId: 38, customerName: 'Ada', lifecycle: 'inactive', status: 'inactive', inactiveSince: NOW - 91 * DAY };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 38, status: 'inactive' }), NOW);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'churned', churnedAt: NOW, inactiveSince: null }));
  });

  it('does NOT reclassify inactive customers younger than 90 days', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { customerId: 39, customerName: 'Ada', lifecycle: 'inactive', status: 'inactive', inactiveSince: NOW - 10 * DAY };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 39, status: 'inactive' }), NOW);

    // Stays inactive — no reclass. (inactiveSince is not part of the payload
    // for a no-transition write; Firestore's partial update preserves it.)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'inactive' }));
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'churned' }));
  });

  it('reclassification is stable on the next sync (no write when already churned)', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    // Doc matches buildCustomerFields output exactly, but the customer is
    // already churned (with a recorded churnedAt) — Splynx now says "inactive",
    // which must NOT resurrect them or trigger a write.
    const existing = {
      ...buildCustomerFields(makeRecord({ id: 40, status: 'inactive' }), NOW),
      lifecycle: 'churned',
      churnedAt: NOW - 5 * DAY,
      inactiveSince: null,
    };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomer(db as never, makeRecord({ id: 40, status: 'inactive' }), NOW);

    // compareKeys sees lifecycle='churned' both sides → no write
    expect(update).not.toHaveBeenCalled();
  });
});

describe('upsertCustomerFromWebhook', () => {
  it('creates a doc when none exists', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set,
        }),
      }),
    };

    const written = await upsertCustomerFromWebhook(db as never, 42, { name: 'Ada', email: 'ada@x.com', status: 'blocked' }, NOW);

    expect(written).toBe(true);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 42,
        customerName: 'Ada',
        email: 'ada@x.com',
        lifecycle: 'blocked',
        status: 'blocked',
        firstSyncedAt: NOW,
      }),
    );
  });

  it('updates only changed fields and reports no write when identical', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = {
      customerName: 'Ada',
      email: 'ada@x.com',
      lastSyncAt: NOW - DAY,
    };
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    const unchanged = await upsertCustomerFromWebhook(db as never, 42, { name: 'Ada', email: 'ada@x.com' }, NOW);
    expect(unchanged).toBe(false);
    expect(update).not.toHaveBeenCalled();

    const changed = await upsertCustomerFromWebhook(db as never, 42, { name: 'Ada New', email: 'ada@x.com' }, NOW);
    expect(changed).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ customerName: 'Ada New', lastChangeAt: NOW }));
  });

  it('records churnedAt when a webhook flips a customer to a churned status', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = { customerId: 43, customerName: 'Ada', email: 'ada@x.com', lifecycle: 'active', status: 'active' };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomerFromWebhook(db as never, 43, { name: 'Ada', email: 'ada@x.com', status: 'disabled' }, NOW);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'churned', status: 'disabled', churnedAt: NOW }));
  });

  it('clears churnedAt when a webhook re-activates a churned customer', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const existing = {
      customerId: 44,
      customerName: 'Ada',
      email: 'ada@x.com',
      lifecycle: 'churned',
      status: 'disabled',
      churnedAt: NOW - 5 * DAY,
    };
    const db = {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => existing }),
          set: vi.fn(),
          update,
        }),
      }),
    };

    await upsertCustomerFromWebhook(db as never, 44, { name: 'Ada', email: 'ada@x.com', status: 'active' }, NOW);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle: 'active', churnedAt: null }));
  });
});

describe('upsertInvoiceFromWebhook', () => {
  it('parses invoice attributes and marks paid statuses', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set,
        }),
      }),
    };

    const written = await upsertInvoiceFromWebhook(
      db as never,
      7,
      { id: 501, number: 'INV-2026-0501', total: '15000', due_date: '2026-07-20', status: 'paid', paid_at: '2026-07-22' },
      NOW,
    );

    expect(written).toBe(true);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 501,
        customerId: 7,
        number: 'INV-2026-0501',
        total: 15000,
        isPaid: true,
        paidAt: expect.any(Number),
      }),
    );
  });

  it('treats unpaid invoices as not paid', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set,
        }),
      }),
    };

    const written = await upsertInvoiceFromWebhook(
      db as never,
      7,
      { id: 502, number: 'INV-2026-0502', total: 15000, due_date: '2026-07-20', status: 'not paid' },
      NOW,
    );

    expect(written).toBe(true);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ isPaid: false, paidAt: null }));
  });

  it('does not parse the due AMOUNT as a date when due_date is absent', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set,
        }),
      }),
    };

    // Splynx payloads carry `due` (amount) alongside `due_date`; parsing the
    // amount as a date produced garbage years (e.g. "43500" → year 43500).
    const written = await upsertInvoiceFromWebhook(
      db as never,
      7,
      { id: 503, number: 'INV-2026-0503', total: '43500', due: '43500', status: 'not paid' },
      NOW,
    );

    expect(written).toBe(true);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ dueDate: null }));
  });
});

describe('upsertInvoiceFromPaymentWebhook', () => {
  it('marks the referenced invoice paid and keeps existing reminder flags', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const existing = {
      invoiceId: 901,
      customerId: 8,
      number: 'INV-0901',
      title: 'August',
      total: 25000,
      dueDate: Date.UTC(2026, 6, 20),
      date: null,
      status: 'not paid',
      isPaid: false,
      paidAt: null,
      reminder15SentAt: null,
      reminder30SentAt: null,
      syncedAt: NOW - DAY,
    };
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: true, data: () => existing }),
          set,
        }),
      }),
    };

    const written = await upsertInvoiceFromPaymentWebhook(db as never, 8, { invoice_id: 901, amount: 25000, date: '2026-08-05' }, NOW);

    expect(written).toBe(true);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 901,
        customerId: 8,
        number: 'INV-0901',
        total: 25000,
        status: 'paid',
        isPaid: true,
        paidAt: expect.any(Number),
        reminder15SentAt: null,
        reminder30SentAt: null,
      }),
    );
  });

  it('returns false without writing when no invoice reference is resolvable', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set,
        }),
      }),
    };

    const written = await upsertInvoiceFromPaymentWebhook(db as never, 9, { amount: 1000, date: '2026-08-05' }, NOW);

    expect(written).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it('falls back to previous invoice fields when the payment payload is minimal', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const existing = {
      invoiceId: 902,
      customerId: 10,
      number: 'INV-0902',
      title: 'Setup fee',
      total: 5000,
      dueDate: Date.UTC(2026, 6, 20),
      date: null,
      status: 'not paid',
      isPaid: false,
      paidAt: null,
      reminder15SentAt: 1000,
      reminder30SentAt: null,
      syncedAt: NOW - DAY,
    };
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({ exists: true, data: () => existing }),
          set,
        }),
      }),
    };

    const written = await upsertInvoiceFromPaymentWebhook(db as never, 10, { invoice_id: 902, amount: '5000' }, NOW);

    expect(written).toBe(true);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 902,
        number: 'INV-0902',
        title: 'Setup fee',
        total: 5000,
        dueDate: Date.UTC(2026, 6, 20),
        status: 'paid',
        isPaid: true,
        reminder15SentAt: 1000, // preserved
      }),
    );
  });
});

describe('reconcileInvoices', () => {
  beforeEach(() => {
    mocks.getUnpaidInvoices.mockReset();
    mocks.getDeletedInvoices.mockReset();
  });

  function makeDb(overrides: Record<string, unknown> = {}) {
    const batches: Array<{ set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> }> = [];
    // The code calls db.batch() when flushing AND re-pushes the flushed batch,
    // so dedupe by reference before inspecting calls.
    const allSets = () => [...new Set(batches)].flatMap((b) => b.set.mock.calls);
    const allDeletes = () => [...new Set(batches)].flatMap((b) => b.delete.mock.calls);
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        }),
        get: async () => {
          const docs = Object.entries(overrides).map(([id, data]) => ({ id, data: () => data }));
          return { docs, size: docs.length };
        },
      }),
      batch: () => {
        const b = {
          set: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
          commit: vi.fn().mockResolvedValue(undefined),
        };
        batches.push(b);
        return b;
      },
    };
    return { db: db as never, allSets, allDeletes };
  }

  it('upserts unpaid invoices and clears the denial flag', async () => {
    mocks.getUnpaidInvoices.mockResolvedValue([
      {
        id: 1001,
        customerId: 5,
        number: 'INV-1001',
        title: 'Aug',
        total: 30000,
        dueDate: Date.UTC(2026, 6, 20),
        date: null,
        status: 'not_paid',
        isPaid: false,
        paidAt: null,
      },
      {
        id: 1002,
        customerId: 6,
        number: 'INV-1002',
        title: 'Aug',
        total: 45000,
        dueDate: Date.UTC(2026, 6, 21),
        date: null,
        status: 'not_paid',
        isPaid: false,
        paidAt: null,
      },
    ]);
    mocks.getDeletedInvoices.mockResolvedValue([]);
    const { db, allSets } = makeDb();

    const result = await reconcileInvoices(db, NOW);

    expect(result).toEqual({ upserted: 2, denied: false, fetched: 2 });
    expect(allSets()).toHaveLength(4);
    // First two sets are the invoice mirrors…
    expect(allSets()[0]).toEqual([expect.any(Object), expect.objectContaining({ invoiceId: 1001, isPaid: false, reminder15SentAt: null })]);
    // …then the denormalized overdue summary on each customer doc.
    expect(allSets()[2]).toEqual([
      expect.any(Object),
      {
        overdueInfo: expect.objectContaining({
          hasOverdueInvoice: true,
          overdueDays: 16,
          overdueInvoiceCount: 1,
          invoiceNumber: 'INV-1001',
        }),
      },
      { merge: true },
    ]);
  });

  it('skips writes for invoices already in sync', async () => {
    mocks.getUnpaidInvoices.mockResolvedValue([
      {
        id: 1001,
        customerId: 5,
        number: 'INV-1001',
        title: 'Aug',
        total: 30000,
        dueDate: Date.UTC(2026, 6, 20),
        date: null,
        status: 'not_paid',
        isPaid: false,
        paidAt: null,
      },
    ]);
    mocks.getDeletedInvoices.mockResolvedValue([]);
    const { db, allSets } = makeDb({
      '1001': {
        invoiceId: 1001,
        number: 'INV-1001',
        title: 'Aug',
        total: 30000,
        dueDate: Date.UTC(2026, 6, 20),
        date: null,
        status: 'not_paid',
        isPaid: false,
        paidAt: null,
        reminder15SentAt: 123,
        syncedAt: NOW - DAY,
      },
    });

    const result = await reconcileInvoices(db, NOW);

    expect(result).toEqual({ upserted: 0, denied: false, fetched: 2 });
    // Invoice unchanged, but the customer's overdue summary is still written.
    expect(allSets()).toHaveLength(1);
    expect(allSets()[0]).toEqual([
      expect.any(Object),
      {
        overdueInfo: expect.objectContaining({
          hasOverdueInvoice: true,
          overdueDays: 16,
          lastReminderSentAt: 123,
          lastReminderType: '15d',
        }),
      },
      { merge: true },
    ]);
  });

  it('preserves existing reminder flags on changed invoices', async () => {
    mocks.getUnpaidInvoices.mockResolvedValue([
      {
        id: 1001,
        customerId: 5,
        number: 'INV-1001',
        title: 'Aug (updated)',
        total: 31000,
        dueDate: Date.UTC(2026, 6, 20),
        date: null,
        status: 'not_paid',
        isPaid: false,
        paidAt: null,
      },
    ]);
    mocks.getDeletedInvoices.mockResolvedValue([]);
    const { db, allSets } = makeDb({
      '1001': {
        invoiceId: 1001,
        number: 'INV-1001',
        title: 'Aug',
        total: 30000,
        dueDate: Date.UTC(2026, 6, 20),
        date: null,
        status: 'not_paid',
        isPaid: false,
        paidAt: null,
        reminder15SentAt: 123,
        syncedAt: NOW - DAY,
      },
    });

    const result = await reconcileInvoices(db, NOW);

    expect(result.upserted).toBe(1);
    expect(allSets()).toHaveLength(2);
    expect(allSets()[0]).toEqual([expect.any(Object), expect.objectContaining({ title: 'Aug (updated)', reminder15SentAt: 123 })]);
    expect(allSets()[1]).toEqual([
      expect.any(Object),
      { overdueInfo: expect.objectContaining({ hasOverdueInvoice: true, overdueDays: 16, invoiceNumber: 'INV-1001' }) },
      { merge: true },
    ]);
  });

  it('deletes mirror docs whose Splynx invoice is deleted', async () => {
    mocks.getUnpaidInvoices.mockResolvedValue([]);
    mocks.getDeletedInvoices.mockResolvedValue([
      {
        id: 2001,
        customerId: 7,
        number: 'INV-2001',
        title: '',
        total: 0,
        dueDate: null,
        date: null,
        status: 'deleted',
        isPaid: false,
        paidAt: null,
      },
    ]);
    const { db, allDeletes } = makeDb({ '2001': { invoiceId: 2001, isPaid: false, syncedAt: NOW - DAY } });

    const result = await reconcileInvoices(db, NOW);

    expect(result.upserted).toBe(0);
    expect(allDeletes()).toHaveLength(1);
    expect(allDeletes()[0]).toEqual([expect.any(Object)]);
  });

  it('returns denied when the API key lacks finance permission', async () => {
    mocks.getUnpaidInvoices.mockRejectedValue(new Error('403: finance module not permitted for this API key'));
    const { db } = makeDb();
    const result = await reconcileInvoices(db, NOW);
    expect(result).toEqual({ upserted: 0, denied: true, fetched: 0 });
  });
});
