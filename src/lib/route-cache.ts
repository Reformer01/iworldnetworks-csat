// In-process TTL cache for admin API routes.
//
// Design notes (Firestore free-tier reads are the scarce resource):
//  - `withCache` dedupes concurrent loaders via an in-flight promise map so a
//    burst of requests after a cache miss only triggers ONE Firestore query.
//  - `clearRouteCache()` marks entries stale instead of deleting them, so the
//    `minRefreshMs` floor can still serve the previous value while the
//    database is being refreshed (prevents webhook storms from forcing a
//    fresh full-collection scan per event).
//  - Stale-on-error: if a refresh loader throws (Firestore outage, quota
//    exhaustion), the last good value is served anyway and a retry-backoff
//    window is applied so a dead database is not hammered. Admin pages keep
//    working on slightly-old data instead of 500-ing.

import { logWarn } from '@/lib/logger';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  refreshedAt: number;
  loading?: Promise<T>;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** After a failed refresh, wait this long before trying again. */
const FAILURE_BACKOFF_MS = 30_000;

export async function withCache<T>(key: string, ttlMs: number, loader: () => Promise<T>, minRefreshMs = 0): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (entry) {
    if (entry.expiresAt > now) return entry.value;
    // Serve stale while within the minimum-refresh window.
    if (minRefreshMs > 0 && now - entry.refreshedAt < minRefreshMs) return entry.value;
    if (entry.loading) return entry.loading;
    entry.loading = loader().then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs, refreshedAt: Date.now() });
      return value;
    });
    try {
      return await entry.loading;
    } catch (err) {
      // Stale-on-error: the database is unavailable or quota is exhausted.
      // Serve the last known good value and back off retrying for a while so
      // an outage doesn't turn into a read storm against a dead Firestore.
      logWarn('[route-cache] Refresh failed, serving stale value', { key, error: String(err) });
      entry.expiresAt = Date.now() + FAILURE_BACKOFF_MS;
      return entry.value;
    } finally {
      entry.loading = undefined;
    }
  }

  try {
    const value = await loader();
    cache.set(key, { value, expiresAt: now + ttlMs, refreshedAt: now });
    return value;
  } catch (err) {
    // No previous value to fall back on — propagate so callers can respond 5xx.
    throw err;
  }
}

export function clearRouteCache(): void {
  // Mark everything stale (keep values so minRefreshMs can serve them).
  for (const entry of cache.values()) {
    entry.expiresAt = 0;
  }
}
