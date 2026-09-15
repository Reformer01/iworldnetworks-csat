import { buildAuthHeader, getSplynxConfig, parseSplynxApiDate } from './splynx-api';
import { prisma } from './prisma';

export const CREDIT_NOTES_PAGE_SIZE = 500;

export type RawSplynxCreditNote = {
  id: number | string;
  customer_id?: number | string;
  number?: string;
  date_created?: string;
  date_payment?: string;
  total?: string | number;
  status?: string;
  payment_id?: number | string;
  invoicesId?: number | string;
  invoices_id?: number | string;
  invoice_id?: number | string;
  items?: Array<{ description?: string; price?: string | number }>;
};

export interface MappedSplynxCreditNote {
  creditId: string;
  customerId: string | null;
  number: string | null;
  total: number;
  status: string | null;
  paymentId: string | null;
  invoiceLink: string | null;
  dateCreated: bigint | null;
  paidAt: Date | null;
  items: Array<{ description?: string; price?: string | number }> | null;
  raw: Record<string, unknown>;
}

function trunc191(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > 191 ? s.slice(0, 191) : s;
}

/** Map a raw Splynx credit note to the mirror shape. */
export function mapSplynxCreditNote(raw: RawSplynxCreditNote): MappedSplynxCreditNote | null {
  const id = String(raw.id ?? '').trim();
  if (!id) return null;
  const createdMs = raw.date_created ? parseSplynxApiDate(raw.date_created) : null;
  const paidMs = raw.date_payment ? parseSplynxApiDate(raw.date_payment) : null;
  const customerRaw = raw.customer_id != null ? String(raw.customer_id).trim() : '';
  const paymentRaw = raw.payment_id != null ? String(raw.payment_id).trim() : '';
  const linkRaw = raw.invoicesId ?? raw.invoices_id ?? raw.invoice_id;
  const invoiceRaw = linkRaw != null ? String(linkRaw).trim() : '';
  return {
    creditId: id,
    customerId: customerRaw || null,
    number: trunc191(raw.number),
    total: Number(raw.total ?? 0) || 0,
    status: trunc191(raw.status),
    paymentId: paymentRaw || null,
    invoiceLink: invoiceRaw || null,
    dateCreated: createdMs != null ? BigInt(createdMs) : null,
    paidAt: paidMs != null ? new Date(paidMs) : null,
    items: Array.isArray(raw.items) ? raw.items : null,
    raw: raw as unknown as Record<string, unknown>,
  };
}

async function defaultFetchPage(offset: number, limit: number): Promise<RawSplynxCreditNote[]> {
  const env = getSplynxConfig();
  const base = String(env.host || 'https://portal.iwn.ng').replace(/\/+$/, '') + '/api/2.0';
  const auth = await buildAuthHeader();
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${base}/admin/finance/credit-notes?${params}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Splynx ${res.status}: ${t.slice(0, 300)}`);
  }
  const chunk = (await res.json()) as RawSplynxCreditNote[] | { data?: RawSplynxCreditNote[] };
  return Array.isArray(chunk) ? chunk : (chunk.data ?? []);
}

export interface CreditNotesSyncResult {
  fetched: number;
  upserted: number;
}

type Deps = {
  prismaClient?: {
    creditNote?: { upsert: (args: unknown) => Promise<unknown> };
  } & Record<string, unknown>;
  fetchPage?: (offset: number, limit: number) => Promise<RawSplynxCreditNote[]>;
};

/** Mirror Splynx credit notes (limit/offset until a short page), upsert by creditId. */
export async function syncCreditNotes(deps?: Deps): Promise<CreditNotesSyncResult> {
  const fetchPage = deps?.fetchPage ?? defaultFetchPage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (deps?.prismaClient as any) ?? (prisma as any);

  let fetched = 0;
  let upserted = 0;
  let offset = 0;

  for (;;) {
    const chunk = await fetchPage(offset, CREDIT_NOTES_PAGE_SIZE);
    if (!chunk.length) break;
    for (const raw of chunk) {
      const mapped = mapSplynxCreditNote(raw);
      if (!mapped) continue;
      fetched++;
      await db.creditNote.upsert({
        where: { creditId: mapped.creditId },
        update: {
          customerId: mapped.customerId,
          number: mapped.number,
          total: mapped.total,
          status: mapped.status,
          paymentId: mapped.paymentId,
          invoiceLink: mapped.invoiceLink,
          dateCreated: mapped.dateCreated,
          paidAt: mapped.paidAt,
          items: mapped.items as never,
          raw: mapped.raw as never,
        },
        create: {
          creditId: mapped.creditId,
          customerId: mapped.customerId,
          number: mapped.number,
          total: mapped.total,
          status: mapped.status,
          paymentId: mapped.paymentId,
          invoiceLink: mapped.invoiceLink,
          dateCreated: mapped.dateCreated,
          paidAt: mapped.paidAt,
          items: mapped.items as never,
          raw: mapped.raw as never,
        },
      });
      upserted++;
    }
    offset += chunk.length;
    if (chunk.length < CREDIT_NOTES_PAGE_SIZE) break;
  }

  return { fetched, upserted };
}
