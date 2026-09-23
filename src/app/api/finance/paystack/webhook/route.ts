import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError, logInfo, logWarn } from '@/lib/logger';
import {
  extractRefundEvent,
  extractWebhookTransaction,
  isSupportedPaystackWebhookEvent,
  verifyPaystackSignature,
} from '@/lib/finance/paystack-webhook';

export const dynamic = 'force-dynamic';

// Higher wins. Protects against out-of-order webhook deliveries
// (e.g. a late charge.failed arriving after the charge.success upsert).
const STATUS_PRECEDENCE: Record<string, number> = { success: 3, failed: 2, abandoned: 1 };

function precedence(status: string): number {
  return STATUS_PRECEDENCE[status.trim().toLowerCase()] ?? 0;
}

export async function POST(request: NextRequest) {
  const secret = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_API_KEY || '';
  if (!secret) {
    logError('[paystack-webhook] rejected: PAYSTACK_SECRET_KEY not configured');
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');
  if (!verifyPaystackSignature(rawBody, signature, secret)) {
    logWarn('[paystack-webhook] rejected: invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const payload = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  const event = payload && typeof payload.event === 'string' ? payload.event : null;
  if (!event || !isSupportedPaystackWebhookEvent(event)) {
    return NextResponse.json({ status: 'ignored' });
  }

  // Refund events carry a refund object (transaction_reference + amount), not a
  // transaction — accumulate the refunded amount on the referenced transaction.
  if (event === 'refund.processed') {
    const refund = extractRefundEvent(payload?.data);
    if (!refund) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    try {
      await prisma.paystackTransaction.update({
        where: { reference: refund.reference },
        data: { refundedNaira: { increment: refund.amountNaira } },
      });
      logInfo('[paystack-webhook] refund applied', { reference: refund.reference, amountNaira: refund.amountNaira });
      return NextResponse.json({ status: 'processed' });
    } catch {
      // Transaction not synced yet — acknowledge so Paystack stops retrying;
      // the next transaction sync backfills refundedNaira from the API.
      logWarn('[paystack-webhook] refund for unknown transaction', { reference: refund.reference });
      return NextResponse.json({ status: 'unknown-transaction' });
    }
  }

  const tx = extractWebhookTransaction(payload?.data);
  if (!tx) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    const existing = await prisma.paystackTransaction.findUnique({
      where: { reference: tx.reference },
      select: { status: true },
    });
    // Idempotent upsert: duplicate deliveries simply rewrite the same fields.
    // Never downgrade an existing success (out-of-order charge.failed/abandoned).
    const existingPrecedence = existing ? precedence(existing.status) : 0;
    const effectiveStatus = existing && existingPrecedence > precedence(tx.status) ? existing.status : tx.status;
    await prisma.paystackTransaction.upsert({
      where: { reference: tx.reference },
      update: {
        paystackId: tx.paystackId,
        amount: tx.amountKobo,
        currency: tx.currency,
        status: effectiveStatus,
        channel: tx.channel,
        customerEmail: tx.customerEmail,
        customerName: tx.customerName,
        gatewayResponse: tx.gatewayResponse,
        feesNaira: tx.feesNaira,
        netNaira: tx.netNaira,
        refundedNaira: tx.refundedNaira,
        disputeStatus: tx.disputeStatus,
        splynxCustomerId: tx.splynxCustomerId,
        paidAt: tx.paidAt,
        raw: tx.raw as never,
      },
      create: {
        paystackId: tx.paystackId,
        reference: tx.reference,
        amount: tx.amountKobo,
        currency: tx.currency,
        status: effectiveStatus,
        channel: tx.channel,
        customerEmail: tx.customerEmail,
        customerName: tx.customerName,
        gatewayResponse: tx.gatewayResponse,
        feesNaira: tx.feesNaira,
        netNaira: tx.netNaira,
        refundedNaira: tx.refundedNaira,
        disputeStatus: tx.disputeStatus,
        splynxCustomerId: tx.splynxCustomerId,
        paidAt: tx.paidAt,
        raw: tx.raw as never,
      },
    });
    logInfo('[paystack-webhook] processed', { event, reference: tx.reference, status: effectiveStatus });
    return NextResponse.json({ status: 'processed' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-webhook] upsert failed', { error: message, event });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
