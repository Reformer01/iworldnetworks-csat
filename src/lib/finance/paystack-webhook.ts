import { createHmac, timingSafeEqual } from 'crypto';

export const PAYSTACK_SUPPORTED_WEBHOOK_EVENTS = ['charge.success', 'charge.failed', 'refund.processed', 'charge.disputed'] as const;

export type PaystackWebhookEvent = (typeof PAYSTACK_SUPPORTED_WEBHOOK_EVENTS)[number];

export function isSupportedPaystackWebhookEvent(event: unknown): event is PaystackWebhookEvent {
  return typeof event === 'string' && (PAYSTACK_SUPPORTED_WEBHOOK_EVENTS as readonly string[]).includes(event);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPaystackSignature(rawBody: string, signature: string | null | undefined, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  const hex = createHmac('sha512', secret).update(rawBody).digest('hex');
  const normalized = signature.trim();
  if (!normalized) return false;
  return safeEqual(normalized, hex) || safeEqual(normalized, `sha512=${hex}`);
}

export interface PaystackWebhookTransaction {
  paystackId: number;
  reference: string;
  amountKobo: number;
  currency: string;
  status: string;
  channel: string | null;
  customerEmail: string | null;
  customerName: string | null;
  gatewayResponse: string | null;
  paidAt: Date | null;
  feesNaira: number | null;
  netNaira: number | null;
  refundedNaira: number;
  disputeStatus: string | null;
  raw: unknown;
}

function truncate191(value: string | null): string | null {
  if (!value) return value;
  return value.length > 191 ? value.slice(0, 191) : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function extractWebhookTransaction(data: unknown): PaystackWebhookTransaction | null {
  const tx = asRecord(data);
  if (!tx) return null;
  if (typeof tx.id !== 'number' || !Number.isFinite(tx.id)) return null;
  const reference = typeof tx.reference === 'string' ? tx.reference.trim() : '';
  if (!reference) return null;

  const amountKobo = typeof tx.amount === 'number' ? tx.amount : 0;
  const customer = asRecord(tx.customer);
  const email = typeof customer?.email === 'string' && customer.email.trim() ? customer.email.trim() : null;
  const name = [customer?.first_name, customer?.last_name]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ');
  const paidRaw = typeof tx.paid_at === 'string' ? tx.paid_at : typeof tx.created_at === 'string' ? tx.created_at : null;
  const paidAt = paidRaw ? new Date(paidRaw) : null;

  const feesKobo = typeof tx.fees === 'number' ? tx.fees : typeof tx.fee === 'number' ? tx.fee : null;
  const refundedKobo = typeof tx.refunded_amount === 'number' ? tx.refunded_amount : null;
  const dispute = tx.dispute_status ?? tx.dispute;
  const disputeStatus =
    typeof dispute === 'string' ? dispute : typeof asRecord(dispute)?.status === 'string' ? String(asRecord(dispute)?.status) : null;

  return {
    paystackId: tx.id,
    reference,
    amountKobo,
    currency: typeof tx.currency === 'string' && tx.currency ? tx.currency : 'NGN',
    status: typeof tx.status === 'string' && tx.status ? tx.status : 'success',
    channel: truncate191(typeof tx.channel === 'string' ? tx.channel : null),
    customerEmail: truncate191(email),
    customerName: truncate191(name ? name : null),
    gatewayResponse: truncate191(typeof tx.gateway_response === 'string' ? tx.gateway_response : null),
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
    feesNaira: typeof feesKobo === 'number' ? feesKobo / 100 : null,
    netNaira: typeof feesKobo === 'number' ? (amountKobo - feesKobo) / 100 : null,
    refundedNaira: typeof refundedKobo === 'number' ? refundedKobo / 100 : 0,
    disputeStatus,
    raw: data,
  };
}
