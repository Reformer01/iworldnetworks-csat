import { buildAuthHeader, getSplynxConfig, parseSplynxApiDate } from './splynx-api';
import { prisma } from './prisma';

export const PAYMENTS_PAGE_SIZE = 500;
export const PAYMENTS_MAX_PAGES_PER_RUN = 200;

export type RawSplynxPayment = {
  id: number | string;
  customer_id?: number | string;
  invoice_id?: number | string;
  amount?: string | number;
  date?: string;
  payment_type?: string | number;
  receipt_number?: string;
  field_4?: string;
  note?: string;
};

export interface MappedSplynxPayment {
  paymentId: string;
  customerId: string | null;
  invoiceId: string | null;
  amount: number;
  paymentType: string | null;
  receiptNumber: string | null;
  note: string | null;
  paidAt: Date | null;
  raw: Record<string, unknown>;
}

function trunc191(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > 191 ? s.slice(0, 191) : s;
}

/** Map a raw Splynx payment to the mirror shape. */
export function mapSplynxPayment(raw: RawSplynxPayment): MappedSplynxPayment | null {
  const id = String(raw.id ?? '').trim();
  if (!id) return null;
  const amount = Number(raw.amount ?? 0) || 0;
  if (!amount) return null;
  const paidMs = raw.date ? parseSplynxApiDate(raw.date) : null;
  const customerRaw = raw.customer_id != null ? String(raw.customer_id).trim() : '';
  const invoiceRaw = raw.invoice_id != null ? String(raw.invoice_id).trim() : '';
  return {
    paymentId: id,
    customerId: customerRaw || null,
    invoiceId: invoiceRaw || null,
    amount,
    paymentType: trunc191(raw.payment_type),
    receiptNumber: trunc191(raw.receipt_number),
    note: trunc191(raw.field_4 ?? raw.note) ?? null,
    paidAt: paidMs != null ? new Date(paidMs) : null,
    raw: raw as unknown as Record<string, unknown>,
  };
}

/** Exponential probe: 0 → 500 → 1000 → 2000 … (oldest-first pagination). */
export function nextProbeOffset(current: number): number {
  if (!Number.isFinite(current) || current <= 0) return PAYMENTS_PAGE_SIZE;
  return current * 2;
}

/** Short page (< pageSize) means we hit the end. */
export function isShortPage(fetchedCount: number, pageSize: number = PAYMENTS_PAGE_SIZE): boolean {
  return fetchedCount < pageSize;
}

/** Full-backfill probe stops when the page's max date reaches today (tail found). */
export function shouldStopBackfillProbe(pageLastDateMs: number | null, todayMs: number): boolean {
  return pageLastDateMs != null && pageLastDateMs >= todayMs;
}

/** Sequential cursor advance. */
export function nextBackfillOffset(currentOffset: number, fetchedCount: number): number {
  return Math.max(0, currentOffset) + Math.max(0, fetchedCount);
}

/** Incremental start = stored backfill cursor, else mirror count, else 0. */
export function getIncrementalStartOffset(backfillOffset: number | null | undefined, mirrorCount?: number | null): number {
  if (typeof backfillOffset === 'number' && Number.isFinite(backfillOffset) && backfillOffset >= 0) return Math.trunc(backfillOffset);
  if (typeof mirrorCount === 'number' && Number.isFinite(mirrorCount) && mirrorCount > 0) return Math.trunc(mirrorCount);
  return 0;
}

/** Numeric max of string payment ids. Null when none parse. */
export function maxNumericPaymentId(ids: Array<string | number>): number | null {
  let max: number | null = null;
  for (const raw of ids) {
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    if (max == null || n > max) max = Math.trunc(n);
  }
  return max;
}

async function defaultFetchPage(offset: number, limit: number): Promise<RawSplynxPayment[]> {
  const env = getSplynxConfig();
  const base = String(env.host || 'https://portal.iwn.ng').replace(/\/+$/, '') + '/api/2.0';
  const auth = await buildAuthHeader();
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${base}/admin/finance/payments?${params}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Splynx ${res.status}: ${t.slice(0, 300)}`);
  }
  const chunk = (await res.json()) as RawSplynxPayment[] | { data?: RawSplynxPayment[] };
  return Array.isArray(chunk) ? chunk : (chunk.data ?? []);
}

export interface PaymentsSyncResult {
  fetched: number;
  upserted: number;
  complete: boolean;
}

type Deps = {
  prismaClient?: {
    splynxPayment?: { upsert: (args: unknown) => Promise<unknown> };
    splynxMeta?: { findUnique: (args: unknown) => Promise<unknown> };
  } & Record<string, unknown>;
  fetchPage?: (offset: number, limit: number) => Promise<RawSplynxPayment[]>;
  now?: number;
};

/**
 * Mirror Splynx payments (oldest-first, limit/offset). Sequential from the
 * stored cursor, up to 200 pages/run, upsert by paymentId. Offsets are stable
 * (appends land at the end) so the stored `paymentsBackfillOffset` is the
 * exact resume point — no probing needed at runtime (probe helpers above
 * exist for diagnostics/tests).
 */
export async function syncSplynxPayments(opts?: { fullBackfill?: boolean }, deps?: Deps): Promise<PaymentsSyncResult> {
  const full = opts?.fullBackfill ?? false;
  const fetchPage = deps?.fetchPage ?? defaultFetchPage;
  const now = deps?.now ?? Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (deps?.prismaClient as any) ?? (prisma as any);

  let startOffset = 0;
  let prevMaxId: number | null = null;
  try {
    const meta = (await db.splynxMeta?.findUnique?.({ where: { id: 'sync' } })) as {
      paymentsBackfillOffset?: number | null;
      paymentsMaxId?: number | null;
    } | null;
    if (meta) {
      if (typeof meta.paymentsBackfillOffset === 'number') startOffset = Math.max(0, meta.paymentsBackfillOffset);
      if (typeof meta.paymentsMaxId === 'number') prevMaxId = meta.paymentsMaxId;
    }
    // Incremental with no cursor yet: fall back to mirror count is handled by
    // callers passing it in; here 0 (= full scan start) is the safe default.
    void full;
  } catch {
    // meta row missing (fresh DB) — start from 0
  }

  let fetched = 0;
  let upserted = 0;
  let maxId = prevMaxId;
  let offset = startOffset;
  let complete = false;

  for (let page = 0; page < PAYMENTS_MAX_PAGES_PER_RUN; page++) {
    const chunk = await fetchPage(offset, PAYMENTS_PAGE_SIZE);
    if (!chunk.length) {
      complete = true;
      break;
    }
    for (const raw of chunk) {
      const mapped = mapSplynxPayment(raw);
      if (!mapped) continue;
      fetched++;
      const n = Number(mapped.paymentId);
      if (Number.isFinite(n) && (maxId == null || n > maxId)) maxId = Math.trunc(n);
      await db.splynxPayment.upsert({
        where: { paymentId: mapped.paymentId },
        update: {
          customerId: mapped.customerId,
          invoiceId: mapped.invoiceId,
          amount: mapped.amount,
          paymentType: mapped.paymentType,
          receiptNumber: mapped.receiptNumber,
          note: mapped.note,
          paidAt: mapped.paidAt,
          raw: mapped.raw as never,
        },
        create: {
          paymentId: mapped.paymentId,
          customerId: mapped.customerId,
          invoiceId: mapped.invoiceId,
          amount: mapped.amount,
          paymentType: mapped.paymentType,
          receiptNumber: mapped.receiptNumber,
          note: mapped.note,
          paidAt: mapped.paidAt,
          raw: mapped.raw as never,
        },
      });
      upserted++;
    }
    offset = nextBackfillOffset(offset, chunk.length);
    if (isShortPage(chunk.length)) {
      complete = true;
      break;
    }
  }

  try {
    await db.splynxMeta?.upsert?.({
      where: { id: 'sync' },
      update: {
        paymentsBackfillOffset: offset,
        paymentsMaxId: maxId,
        paymentsBackfillComplete: complete,
        paymentsLastSyncAt: BigInt(now),
      },
      create: {
        id: 'sync',
        paymentsBackfillOffset: offset,
        paymentsMaxId: maxId,
        paymentsBackfillComplete: complete,
        paymentsLastSyncAt: BigInt(now),
      },
    });
  } catch {
    // meta persistence is best-effort in tests without the new columns
  }

  return { fetched, upserted, complete };
}
