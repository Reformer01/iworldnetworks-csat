import { incrementNonce } from './splynx-nonce';

function getSplynxEnv() {
  return {
    host: process.env.SPLYNX_API_HOST,
    key: process.env.SPLYNX_API_KEY,
    secret: process.env.SPLYNX_API_SECRET,
    auth: (process.env.SPLYNX_API_AUTH || 'basic').toLowerCase(),
  };
}

export interface SplynxCustomer {
  id: number;
  login: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street: string;
  number: string;
  zip: string;
  city: string;
  tariff_id: number;
  tariff_name: string;
  status: string;
  status_id: number;
  router_id: number;
  router_name: string;
  sector_id: number;
  sector_name: string;
  billing_type: string;
  partner_id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  internet_status: number;
  internet_status_name: string;
  services: SplynxService[];
  ipv4: string;
  ipv6: string;
  mac: string;
  port_id: number;
  port_name: string;
  bundle_id: number;
  bundle_name: string;
}

export interface SplynxCustomerLabel {
  id: number;
  label: string;
  color: string;
}

export interface SplynxCustomerListRecord {
  id: number;
  login: string;
  name: string;
  email: string;
  billing_email: string;
  phone: string;
  street_1: string;
  city: string;
  status: string;
  last_online: string;
  last_update: string;
  mrr_total: string;
  account_type: string;
  category: string;
  /** Tariff display name, e.g. "H-Pro". Populated by the list endpoint when the tariff is mapped. */
  plan?: string;
  /** Underlying tariff id from Splynx. */
  tariff_id?: number;
  /** Customer labels from Splynx — may contain BTS assignment like "BTS - AKURE OFFICE X". */
  customer_labels?: SplynxCustomerLabel[];
}

export interface SplynxInvoiceItem {
  description?: string;
  price?: number | string;
}

export interface SplynxInvoice {
  id: number;
  customerId: number;
  number: string;
  title: string;
  total: number;
  dueDate: number | null;
  date: number | null;
  status: string;
  isPaid: boolean;
  paidAt: number | null;
  items?: SplynxInvoiceItem[];
}

export interface SplynxService {
  id: number;
  title: string;
  tariff_id: number;
  tariff_name: string;
  status: string;
  start_date?: string;
  description?: string;
  unit_price?: number | string;
  status_id: number;
  router_id: number;
  router_name: string;
  sector_id: number;
  sector_name: string;
  ipv4: string;
  ipv6: string;
  mac: string;
  port_id: number;
  port_name: string;
  bundle_id: number;
  bundle_name: string;
  speed_download: number;
  speed_upload: number;
  burst_download: number;
  burst_upload: number;
  burst_time: number;
  priority: number;
  traffic_limit: number;
  traffic_limit_period: string;
  fair_usage: number;
  fair_usage_period: string;
}

export interface SplynxRouter {
  id: number;
  name: string;
  type: string;
  ip: string;
  port: number;
  secret: string;
  nas_type: string;
  nas_id: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SplynxTariff {
  id: number;
  name?: string;
  title?: string;
  price: number;
  period?: string;
  download_speed?: number;
  upload_speed?: number;
  description?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

interface RawSplynxInvoice {
  id: string | number;
  customer_id: string | number;
  number: string;
  title?: string;
  total: string | number;
  date_till?: string;
  real_create_datetime?: string;
  date_created?: string;
  date_payment?: string;
  status?: string;
  is_paid?: boolean | number;
  items?: Array<{ description?: string; price?: string | number }>;
}

type RawInvoiceList = RawSplynxInvoice[];

function isItemObject(value: { description?: string; price?: string | number } | undefined): value is {
  description?: string;
  price?: string | number;
} {
  return typeof value === 'object' && value !== null;
}

function isStringValue(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNumberValue(value: string | number): value is number {
  return typeof value === 'number';
}

export function parseSplynxApiDate(rawValue: string | undefined | null): number | null {
  if (!isStringValue(rawValue)) return null;
  const clean = rawValue.trim();
  if (/^0{4}-0{2}-0{2}/.test(clean)) return null;
  let iso = clean.replace(' ', 'T');
  if (!iso.includes('T')) iso += 'T00:00:00';
  iso += 'Z';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export function normalizeSplynxInvoice(raw: RawSplynxInvoice): SplynxInvoice {
  const status = String(raw.status ?? '').toLowerCase();
  const paidAt = parseSplynxApiDate(raw.date_payment);
  const isPaid =
    raw.is_paid === true ||
    raw.is_paid === 1 ||
    status === 'paid' ||
    status === 'partially paid' ||
    status === 'closed' ||
    status.startsWith('paid ') ||
    status.startsWith('closed ') ||
    paidAt !== null;
  const items = Array.isArray(raw.items) ? raw.items : [];
  // SAFETY: Splynx API returns items as array of objects with optional description.
  const firstItem = isItemObject(items[0]) ? items[0] : null;
  const total = isNumberValue(raw.total) ? raw.total : Number(raw.total ?? 0) || 0;

  return {
    id: Number(raw.id) || 0,
    customerId: Number(raw.customer_id) || 0,
    number: String(raw.number ?? ''),
    title: String(raw.title ?? firstItem?.description ?? ''),
    total,
    dueDate: parseSplynxApiDate(raw.date_till),
    date: parseSplynxApiDate(raw.real_create_datetime ?? raw.date_created),
    status,
    isPaid,
    paidAt,
    // Raw line items (negative prices = discounts/compensation). Stored on the
    // mirror so the income report derives discounts from items, never from
    // invoice-total-minus-paid (open balances are not discounts).
    items: items.map((it) => ({ description: it?.description, price: it?.price })),
  };
}

function normalizeInvoiceList(raw: RawInvoiceList): SplynxInvoice[] {
  return raw.map(normalizeSplynxInvoice);
}

export async function buildAuthHeader(): Promise<string> {
  const env = getSplynxEnv();
  if (env.auth === 'signature') {
    const crypto = require('crypto');
    const nextNonce = await incrementNonce('default');
    const nonce = String(Math.max(Date.now(), Number(nextNonce)));
    // SAFETY: globalThis is extended at runtime by the nonce module; lastSplynxNonce is a number.
    (globalThis as unknown as { lastSplynxNonce: number }).lastSplynxNonce = Number(nonce);
    const signature = crypto.createHmac('sha256', env.secret).update(`${nonce}${env.key}`).digest('hex').toUpperCase();
    return `Splynx-EA (key=${env.key}&nonce=${nonce}&signature=${signature})`;
  }

  return `Basic ${Buffer.from(`${env.key}:${env.secret}`).toString('base64')}`;
}

async function splynxFetch<T>(endpoint: string, params?: URLSearchParams): Promise<T> {
  const env = getSplynxEnv();
  if (!env.host || !env.key || !env.secret) {
    throw new Error('Splynx API credentials not configured');
  }

  const url = `${env.host.replace(/\/+$/, '')}/api/2.0${endpoint}${params ? `?${params.toString()}` : ''}`;
  const authHeader = await buildAuthHeader();

  // Retry with exponential backoff for rate limiting
  const maxRetries = 3;
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');

        // Check if this is a rate limit error that we should retry on
        const isRateLimit =
          response.status === 429 ||
          (response.status === 8 && text.includes('RESOURCE_EXHAUSTED')) ||
          response.status === 503 ||
          response.status === 502 ||
          response.status === 504;

        if (isRateLimit && attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new Error(`Splynx API error ${response.status}: ${text}`);
      }

      return response.json();
    } catch (error) {
      lastError = error as Error;

      const isRateLimit =
        error instanceof Error &&
        (error.message.includes('RESOURCE_EXHAUSTED') ||
          error.message.includes('429') ||
          error.message.includes('503') ||
          error.message.includes('502') ||
          error.message.includes('504'));

      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError!;
}

export async function getActiveCustomers(page = 1, perPage = 1000): Promise<PaginatedResponse<SplynxCustomer>> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  params.set('filter[status]', 'active');
  params.set('filter[internet_status]', '1');
  return splynxFetch<PaginatedResponse<SplynxCustomer>>('/admin/customers/customer', params);
}

export async function getAllCustomers(): Promise<SplynxCustomerListRecord[]> {
  return splynxFetch<SplynxCustomerListRecord[]>('/admin/customers/customer');
}

export async function getUnpaidInvoices(): Promise<SplynxInvoice[]> {
  const params = new URLSearchParams();
  params.set('main_attributes[status][0]', '=');
  params.set('main_attributes[status][1]', 'not_paid');
  const raw = await splynxFetch<RawInvoiceList>('/admin/finance/invoices', params);
  return normalizeInvoiceList(raw);
}

export const INVOICE_PAGE_SIZE = 500;

/** Full invoice pass (paid + unpaid, limit/offset until a short page). Volume is small (~thousands). */
export async function getAllInvoices(limit = INVOICE_PAGE_SIZE): Promise<SplynxInvoice[]> {
  const all: SplynxInvoice[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const raw = await splynxFetch<RawInvoiceList>('/admin/finance/invoices', params);
    const batch = normalizeInvoiceList(Array.isArray(raw) ? raw : []);
    all.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
  }
  return all;
}

export async function getDeletedInvoices(): Promise<SplynxInvoice[]> {
  const params = new URLSearchParams();
  params.set('main_attributes[status][0]', '=');
  params.set('main_attributes[status][1]', 'deleted');
  const raw = await splynxFetch<RawInvoiceList>('/admin/finance/invoices', params);
  return normalizeInvoiceList(raw);
}

/** Single-invoice fetch (full record incl. items). Null on 404. */
export async function getInvoiceById(id: number | string): Promise<SplynxInvoice | null> {
  try {
    const raw = await splynxFetch<RawSplynxInvoice>(`/admin/finance/invoices/${encodeURIComponent(String(id))}`);
    if (!raw || typeof raw !== 'object') return null;
    return normalizeSplynxInvoice(raw);
  } catch (err) {
    // SAFETY: splynxFetch throws only Error instances.
    if ((err as Error).message.includes('404')) return null;
    throw err;
  }
}

export interface SplynxTicket {
  id: number;
  customer_id: number;
  assign_to: number;
  status_id: number;
  subject: string;
  priority: string;
  closed: string;
  created_at: string;
  updated_at: string;
  trash: string;
  note: string;
  group_id: number;
  type_id: number;
}

export async function getSupportTickets(limit = 1000, offset = 0): Promise<SplynxTicket[]> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const raw = await splynxFetch<unknown>(`/admin/support/tickets`, params);
  return Array.isArray(raw) ? (raw as SplynxTicket[]) : [];
}

export async function getAllActiveCustomers(): Promise<SplynxCustomer[]> {
  const allCustomers: SplynxCustomer[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await getActiveCustomers(page, 500);
    allCustomers.push(...response.data);
    hasMore = response.data.length === 500 && page < response.total_pages;
    page++;
  }

  return allCustomers;
}

export async function getCustomerById(id: number): Promise<SplynxCustomer | null> {
  try {
    return await splynxFetch<SplynxCustomer>(`/admin/customers/customer/${id}`);
  } catch (err) {
    // SAFETY: splynxFetch throws only Error instances.
    if ((err as Error).message.includes('404')) return null;
    throw err;
  }
}

export async function getRouters(): Promise<SplynxRouter[]> {
  const response = await splynxFetch<PaginatedResponse<SplynxRouter>>('/admin/networking/routers');
  return response.data;
}

export async function getTariffs(): Promise<SplynxTariff[]> {
  const response = await splynxFetch<SplynxTariff[] | PaginatedResponse<SplynxTariff>>('/admin/tariffs/internet');
  return Array.isArray(response) ? response : (response.data ?? []);
}

export async function getCustomerServices(customerId: number | string): Promise<SplynxService[]> {
  const response = await splynxFetch<PaginatedResponse<SplynxService> | SplynxService[]>(
    `/admin/customers/customer/${customerId}/internet-services`,
  );
  return Array.isArray(response) ? response : (response.data ?? []);
}

export function extractBtsFromLabels(labels: SplynxCustomerLabel[] | undefined): string | null {
  if (!labels || labels.length === 0) return null;
  for (const lbl of labels) {
    const label = lbl.label?.trim();
    if (!label) continue;
    // Match "BTS - <name>" pattern (case-insensitive)
    const match = label.match(/^BTS\s*-\s*(.+)$/i);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

export function isSplynxConfigured(): boolean {
  const env = getSplynxEnv();
  return !!(env.host && env.key && env.secret);
}

export function getSplynxConfig() {
  const env = getSplynxEnv();
  return {
    host: env.host,
    hasKey: !!env.key,
    hasSecret: !!env.secret,
    authMode: env.auth,
  };
}
