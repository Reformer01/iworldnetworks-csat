import { getAdminApp } from './firebase-admin';
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

export interface SplynxService {
  id: number;
  title: string;
  tariff_id: number;
  tariff_name: string;
  status: string;
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
  name: string;
  price: number;
  period: string;
  download_speed: number;
  upload_speed: number;
  description: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export async function buildAuthHeader(): Promise<string> {
  const env = getSplynxEnv();
  if (env.auth === 'signature') {
    const crypto = require('crypto');
    const nextNonce = await incrementNonce('default');
    const nonce = String(Math.max(Date.now(), Number(nextNonce)));
    (globalThis as any).lastSplynxNonce = Number(nonce);
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

      // Check if this is a rate limit error that we should retry on
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
    if ((err as Error).message.includes('404')) return null;
    throw err;
  }
}

export async function getRouters(): Promise<SplynxRouter[]> {
  const response = await splynxFetch<PaginatedResponse<SplynxRouter>>('/admin/networking/routers');
  return response.data;
}

export async function getTariffs(): Promise<SplynxTariff[]> {
  const response = await splynxFetch<PaginatedResponse<SplynxTariff>>('/admin/tariffs/tariff');
  return response.data;
}

export async function getCustomerServices(customerId: number): Promise<SplynxService[]> {
  const response = await splynxFetch<PaginatedResponse<SplynxService>>(`/admin/customers/customer/${customerId}/services`);
  return response.data;
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
