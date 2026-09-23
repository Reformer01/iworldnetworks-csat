// Types for the Splynx customer mirror — safe for client imports (no server deps).
export type Lifecycle = 'active' | 'blocked' | 'inactive' | 'churned';

/** Timestamp fields written on lifecycle transitions (churnedAt / inactiveSince / blockedSince). */
export interface LifecycleTransitionUpdates {
  churnedAt?: number | null;
  inactiveSince?: number | null;
  blockedSince?: number | null;
}

export interface CustomerOverdueInfo {
  hasOverdueInvoice: boolean;
  overdueDays: number;
  overdueInvoiceCount: number;
  invoiceNumber: string | null;
  invoiceAmount: number;
  lastReminderSentAt: number | null;
  lastReminderType: '15d' | '30d' | null;
}

export interface MirrorCustomerDoc {
  customerId: number;
  customerName: string;
  email: string;
  billingEmail: string;
  phone: string;
  login: string;
  city: string;
  street: string;
  /** Splynx customer State/Province ONLY (never city) — drives the income report Region column. */
  state?: string | null;
  /** Per-customer predefined discount % (survives plan upgrades) — drives the income report Discounts column. */
  discountPercent?: number | null;
  /** Epoch ms of the Splynx customer registration — drives the income report New flag. */
  splynxDateAdded?: number | null;
  status: string;
  lifecycle: Lifecycle;
  online: boolean;
  lastOnlineAt: number | null;
  lastUpdateAt: number | null;
  mrrTotal: number;
  accountType: string;
  category: string;
  /** Tariff/plan name mirrored from Splynx (empty when unknown). */
  servicePlan: string;
  /** BTS name from Splynx customer labels (e.g. "AKURE OFFICE X" from "BTS - AKURE OFFICE X"). */
  btsName?: string | null;
  /**
   * UISP tower attribution + match bookkeeping — owned exclusively by the matching
   * job (runMatching/deviceResolve/manual). The Splynx sync carries these through
   * untouched so hourly reconciles never wipe them (bts wipe bug: sync upserts
   * used to null btsName on every customer change). Never in compare keys.
   */
  btsId?: string | null;
  uispEndpointId?: string | null;
  uispEndpointName?: string | null;
  uispDeviceStatus?: string | null;
  uispOutageCount?: number | null;
  matchState?: string | null;
  matchMethod?: string | null;
  matchScore?: number | null;
  matchedAt?: number | null;
  matchUpdatedAt?: number | null;
  firstSyncedAt: number;
  lastSyncAt: number;
  lastChangeAt: number;
  deleted: boolean;
  reminder15SentAt: number | null;
  reminder30SentAt: number | null;
  churnSurveySentAt: number | null;
  churnSurveyToken: string | null;
  /** When the "We've Missed You" win-back email was sent (one per churned customer). */
  winBackSentAt?: number | null;
  /** Feedback token minted for the win-back email's feedback popup link. */
  winBackToken?: string | null;
  /** When the customer was first observed as churned (set on lifecycle transition).
   *  Missing for customers who churned before the mirror started tracking it —
   *  those are never emailed by the churn/win-back campaigns. */
  churnedAt?: number | null;
  /** When the customer was first observed as inactive (set on lifecycle transition).
   *  Used to auto-reclassify long-inactive (90d+) customers as churned. */
  inactiveSince?: number | null;
  /** When the customer was first observed as blocked (set on lifecycle transition).
   *  Gates the win-back job: only blocked 90d+ (and offline) customers qualify. */
  blockedSince?: number | null;
  emailOptOut: boolean;
  emailInvalid?: boolean;
  /** Denormalized overdue summary (written by sync/webhooks) so admin list
   *  pages never have to scan the invoice collection. */
  overdueInfo?: CustomerOverdueInfo | null;
}

export interface MirrorInvoiceDoc {
  invoiceId: number;
  customerId: number;
  number: string;
  title: string;
  total: number;
  dueDate: number | null;
  date: number | null;
  status: string;
  isPaid: boolean;
  paidAt: number | null;
  /** Raw Splynx line items (negative price = discount/compensation). */
  items?: Array<{ description?: string; price?: number | string }> | null;
  reminder15SentAt: number | null;
  reminder30SentAt: number | null;
  syncedAt: number;
}

export interface ChurnSurveyDoc {
  customerId: number;
  customerName: string;
  customerEmail: string;
  sentAt: number;
  expiresAt: number;
  used: boolean;
  submittedAt: number | null;
  rating: number | null;
  reason: string | null;
  comment: string | null;
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

export interface SyncStats {
  customersUpserted: number;
  customersMarkedDeleted: number;
  invoicesUpserted: number;
  /** Per-invoice failures this run (-1 = whole pass threw and was contained). */
  invoicesFailed: number;
  reminders15: number;
  reminders30: number;
  churnSent: number;
  winBackSent: number;
  feedbackReminders: number;
  invoicesApiDenied: boolean;
  ticketsSynced: number;
  ticketsApiDenied: boolean;
}

export interface TicketSyncResult {
  upserted: number;
  trashed: number;
  fetched: number;
  denied: boolean;
}

export interface ReminderJobResult {
  sent15: number;
  sent30: number;
  skippedOptOut: number;
  skippedInvalid: number;
  /** Customers already churned — never remind people we've cut off. */
  skippedChurned: number;
  /** Invoices older than the reminder window (90 days) — stop nagging. */
  skippedStale: number;
  /** Overdue but still connected (active lifecycle or recent access) — excluded by disconnected-only policy. */
  skippedConnected?: number;
}

export interface ChurnJobResult {
  sent: number;
  skippedOptOut: number;
  skippedNoEmail: number;
  skippedInvalid: number;
  /** Churned before the recency window (or before churn tracking existed). */
  skippedStale: number;
  /** Number of mirror customers scanned by the job (read-cost estimate). */
  scanned: number;
}

export interface WinBackJobResult {
  sent: number;
  skippedOptOut: number;
  skippedNoEmail: number;
  skippedInvalid: number;
  /** Churned before the recency window (or before churn tracking existed). */
  skippedStale: number;
  /** Number of mirror customers scanned by the job (read-cost estimate). */
  scanned: number;
}

export interface FeedbackReminderJobResult {
  sent: number;
  skippedOptOut: number;
  skippedNoEmail: number;
  skippedInvalid: number;
  skippedNoOverdue: number;
  /** Customers already churned — never ask churned customers for billing feedback. */
  skippedChurned: number;
}

export const CUSTOMERS_COLLECTION = 'splynx_customers';
export const INVOICES_COLLECTION = 'splynx_invoices';
export const CHURN_COLLECTION = 'churn_surveys';
export const LOCK_DOC = 'splynx-sync';

/** Only survey customers who churned within the last 30 days (survey TTL window). */
export const CHURN_SURVEY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Only send the win-back email to customers who churned within the last 90 days. */
export const WINBACK_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
/** Never auto-remind invoices older than 90 days overdue — that's collections territory. */
export const REMINDER_MAX_OVERDUE_DAYS = 90;
/** After 90 days of inactivity, a customer is reclassified as churned (de-facto gone). */
export const INACTIVE_CHURN_MS = 90 * 24 * 60 * 60 * 1000;
