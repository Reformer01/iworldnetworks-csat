export function koboToNaira(amount: number | null | undefined): number {
  return (amount || 0) / 100;
}

export function normalizeChannel(channel?: string | null): string | null {
  const value = (channel || '').trim().toLowerCase();
  return value ? value : null;
}

export function normalizePaystackStatus(status?: string | null): string {
  return (status || 'unknown').trim().toLowerCase();
}

export function normalizeReference(reference?: string | null): string {
  return (reference || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function isDuplicateReference(seen: Set<string>, reference?: string | null): boolean {
  const key = normalizeReference(reference);
  if (!key) return false;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

/**
 * Extract the Splynx customer id a Paystack transaction belongs to.
 * The portal.iwn.ng splynx_paystack_addon flow stamps every portal payment
 * with `metadata.customer_id` (Splynx customer id) and a referrer URL carrying
 * the same id. Golden join key — preferred over email matching.
 */
export function extractSplynxCustomerId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const meta = (raw as Record<string, unknown>).metadata;
  if (typeof meta === 'object' && meta !== null) {
    const cid = (meta as Record<string, unknown>).customer_id;
    if (typeof cid === 'number' && Number.isFinite(cid)) return String(cid);
    if (typeof cid === 'string' && cid.trim()) {
      const s = cid.trim();
      if (/^\d+$/.test(s)) return s;
    }
  }
  // Fallback: referrer query param customer_id=NNN
  const referrer =
    typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>).referrer : null;
  if (typeof referrer === 'string') {
    const m = referrer.match(/customer_id=(\d+)/);
    if (m) return m[1];
  }
  return null;
}
