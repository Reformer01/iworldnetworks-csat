import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date as yyyy-MM-dd in the local timezone (never UTC). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format an ISO date string (yyyy-mm-dd) or timestamp (ms) into a localized,
 * human-readable string (e.g. "Aug 5, 2026"). Returns '—' for empty/missing
 * values so the UI never renders a raw generic fallback.
 */
export function formatLocalDate(value: string | number | null | undefined, locale = 'en-US'): string {
  let ms: number | null = null;
  if (typeof value === 'number' && value > 0) {
    ms = value;
  } else if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) ms = parsed;
  }
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
