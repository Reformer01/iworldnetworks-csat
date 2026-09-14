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
