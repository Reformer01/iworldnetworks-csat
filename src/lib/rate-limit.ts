import { NextRequest } from 'next/server';

interface RateLimitRecord {
  timestamps: number[];
}

const cache = new Map<string, RateLimitRecord>();
const MAX_CACHE_KEYS = 5000;
const SWEEP_INTERVAL_MS = 60 * 1000;
let lastSweep = 0;

function pruneCache(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS && cache.size <= MAX_CACHE_KEYS) {
    return;
  }

  for (const [key, record] of cache.entries()) {
    record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);
    if (record.timestamps.length === 0 || cache.size > MAX_CACHE_KEYS) {
      cache.delete(key);
    }
  }

  lastSweep = now;
}

/**
 * Simple in-memory sliding window rate limiter.
 * Returns true if the request limit has been exceeded, false otherwise.
 */
export function isRateLimited(
  req: NextRequest,
  limit: number,
  windowMs: number
): boolean {
  // Try to extract the client IP address from standard headers
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 
             req.headers.get('x-real-ip') || 
             '127.0.0.1';

  const key = `${ip}:${req.nextUrl.pathname}`;
  const now = Date.now();
  pruneCache(now, windowMs);
  
  if (!cache.has(key)) {
    cache.set(key, { timestamps: [now] });
    return false;
  }

  const record = cache.get(key)!;
  
  // Keep only timestamps that fall within the sliding window
  record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    return true;
  }

  record.timestamps.push(now);
  cache.set(key, record);
  return false;
}
