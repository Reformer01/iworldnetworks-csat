import { buildAuthHeader, getSplynxConfig } from './splynx-api';

export type SubdivisionMap = Map<number, string>;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cached: SubdivisionMap | null = null;
let cachedAt = 0;
let inflight: Promise<SubdivisionMap> | null = null;

type RawSubdivision = {
  id?: string | number;
  code?: string;
  name?: string;
  title?: string;
};

function toMap(raw: unknown): SubdivisionMap {
  const map: SubdivisionMap = new Map();
  const arr = Array.isArray(raw) ? raw : (raw as { data?: unknown })?.data;
  if (!Array.isArray(arr)) return map;
  for (const r of arr as RawSubdivision[]) {
    const id = Number(r?.id);
    const name = String(r?.name ?? r?.title ?? '').trim();
    if (Number.isFinite(id) && id > 0 && name) map.set(id, name.slice(0, 191));
  }
  return map;
}

async function fetchMap(): Promise<SubdivisionMap> {
  const env = getSplynxConfig();
  const base = String(env.host || 'https://portal.iwn.ng').replace(/\/+$/, '') + '/api/2.0';
  const auth = await buildAuthHeader();
  const params = new URLSearchParams({ limit: '100' });
  const res = await fetch(`${base}/admin/config/states-provinces?${params}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Splynx ${res.status}: ${t.slice(0, 200)}`);
  }
  return toMap(await res.json());
}

/** Nigerian states/provinces id → name, cached in memory for 24h. */
export async function getSubdivisionNameMap(): Promise<SubdivisionMap> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;
  if (inflight) return inflight;
  inflight = fetchMap()
    .then((m) => {
      cached = m;
      cachedAt = Date.now();
      return m;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test-only cache reset. */
export function _resetSubdivisionCache(): void {
  cached = null;
  cachedAt = 0;
  inflight = null;
}

/** Numeric subdivision id from payload (`subdivision_id` numeric or numeric-string). Null when absent. */
export function parseSubdivisionId(payload: Record<string, unknown>): number | null {
  for (const key of ['subdivision_id', 'subdivisionId', 'subdivision']) {
    const v = payload[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.trunc(v);
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.trim());
      if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    }
  }
  return null;
}

/** Resolve state name via subdivision map. Null when unknown (caller falls back / keeps prior row). */
export function resolveSubdivisionName(payload: Record<string, unknown>, subMap?: SubdivisionMap | null): string | null {
  if (!subMap) return null;
  const id = parseSubdivisionId(payload);
  if (id == null) return null;
  return subMap.get(id) ?? null;
}
