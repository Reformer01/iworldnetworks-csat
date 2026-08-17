import { promises as dns } from 'node:dns';

// Lightweight deliverability check used before sending survey/reminder email.
// Verifies the address format and that the recipient domain has a mail server
// (MX record). Domains that don't exist or don't accept mail are the source of
// most hard bounces (Postfix 5.4.4 / nullMX) seen on the live portal.
// Results are cached per-domain for a few minutes so hourly runs don't hammer
// DNS with thousands of lookups.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { ok: boolean; at: number }>();

/**
 * Returns true when the email has a plausible format AND its domain resolves to
 * at least one MX record (or, per RFC 5321, an A record as last-resort target).
 */
export async function hasDeliverableEmail(email: string): Promise<boolean> {
  if (!email || !EMAIL_RE.test(email)) return false;
  const domain = email.split('@').pop()!.toLowerCase();
  if (!domain || domain.length < 4) return false;

  const now = Date.now();
  const cached = cache.get(domain);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.ok;

  let ok = false;
  try {
    const mx = await dns.resolveMx(domain);
    ok = mx.length > 0 && mx.some((r) => r.exchange && r.exchange !== '.');
  } catch {
    // No MX record — per RFC 5321 fall back to an A record for the domain.
    try {
      const a = await dns.resolve4(domain);
      ok = a.length > 0;
    } catch {
      ok = false;
    }
  }

  cache.set(domain, { ok, at: now });
  return ok;
}

/** Clears the per-domain cache (mainly for tests). */
export function clearEmailDomainCache(): void {
  cache.clear();
}
