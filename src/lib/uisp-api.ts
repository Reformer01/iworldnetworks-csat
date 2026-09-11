export function getUispEnv() {
  return {
    baseUrl: process.env.UISP_BASE_URL || 'https://uisp.iwn.ng',
    token: process.env.UISP_API_TOKEN || '',
  };
}

export interface UispSiteIdentification {
  id: string;
  status: string;
  name: string;
  type: string;
  suspended?: boolean;
  parent?: {
    id: string;
    name: string;
    status: string;
    type: string;
    parentId?: string | null;
  } | null;
  updated?: string;
}

export interface UispSiteDescription {
  address?: string | null;
  note?: string | null;
  contact?: { name?: string | null; phone?: string | null; email?: string | null };
  location?: { longitude?: number | null; latitude?: number | null };
  height?: number | null;
  elevation?: number | null;
  deviceCount?: number;
  deviceOutageCount?: number;
  deviceListStatus?: string;
  ucrmId?: string | null;
  ipAddresses?: unknown;
  sla?: number;
}

export interface UispSite {
  id: string;
  identification: UispSiteIdentification;
  description: UispSiteDescription;
  lastSpeedReport?: unknown;
}

export interface UispDeviceIdentification {
  id: string;
  site?: {
    id: string;
    name: string;
    status: string;
    type: string;
    parent?: { id: string; name: string; type: string } | null;
  } | null;
  mac?: string | null;
  name: string;
  hostname?: string | null;
  serialNumber?: string | null;
  firmwareVersion?: string | null;
  model?: string | null;
  modelName?: string | null;
  systemName?: string | null;
  vendor?: string | null;
  vendorName?: string | null;
  platformId?: string | null;
  platformName?: string | null;
  type?: string | null;
  category?: string | null;
  role?: string | null;
  authorized?: boolean;
  status?: string;
}

export interface UispDeviceOverview {
  status?: string;
  cpu?: number | null;
  downlinkCapacity?: number | null;
  uplinkCapacity?: number | null;
  downlinkUtilization?: number | null;
  uplinkUtilization?: number | null;
  stationsCount?: number | null;
  runningOnBattery?: boolean | null;
}

export interface UispDevice {
  id: string;
  identification: UispDeviceIdentification;
  overview?: UispDeviceOverview;
  ipAddress?: string | null;
  enabled?: boolean;
}

const MAX_RETRIES = 3;

export async function uispFetch<T>(path: string): Promise<T> {
  const env = getUispEnv();
  if (!env.token) {
    throw new Error('UISP_API_TOKEN is not configured');
  }
  const url = `${env.baseUrl.replace(/\/+$/, '')}/nms/api/v2.1${path}`;

  let lastError: Error;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'x-auth-token': env.token,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const isRetryable =
          response.status === 429 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504;
        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`UISP API error ${response.status}: ${text}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error as Error;
      const isRetryable =
        error instanceof Error &&
        (error.message.includes('429') ||
          error.message.includes('502') ||
          error.message.includes('503') ||
          error.message.includes('504'));
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError!;
}

/** All sites (type=site BTS towers + type=endpoint customer CPEs). */
export function getAllUispSites(): Promise<UispSite[]> {
  return uispFetch<UispSite[]>('/sites');
}

/** All devices (stations, APs, routers, switches...). */
export function getAllUispDevices(): Promise<UispDevice[]> {
  return uispFetch<UispDevice[]>('/devices');
}

export function getUispDeviceDetail(id: string): Promise<UispDevice> {
  return uispFetch<UispDevice>(`/devices/${id}/detail`);
}
