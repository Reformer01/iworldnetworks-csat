import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { extractWebhookTransaction, isSupportedPaystackWebhookEvent, verifyPaystackSignature } from '@/lib/finance/paystack-webhook';

export const dynamic = 'force-dynamic';

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

  const tx = extractWebhookTransaction(payload?.data);
  if (!tx) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    const existing = await prisma.paystackTransaction.findUnique({ where: { reference: tx.reference } });
    if (existing) {
      logInfo('[paystack-webhook] duplicate delivery', { reference: tx.reference });
      return NextResponse.json({ status: 'duplicate' });
    }
    await prisma.paystackTransaction.upsert({
      where: { reference: tx.reference },
      update: {
        paystackId: tx.paystackId,
        amount: tx.amountKobo,
        currency: tx.currency,
        status: tx.status,
        channel: tx.channel,
        customerEmail: tx.customerEmail,
        customerName: tx.customerName,
        gatewayResponse: tx.gatewayResponse,
        feesNaira: tx.feesNaira,
        netNaira: tx.netNaira,
        refundedNaira: tx.refundedNaira,
        disputeStatus: tx.disputeStatus,
        paidAt: tx.paidAt,
        raw: tx.raw as never,
      },
      create: {
        paystackId: tx.paystackId,
        reference: tx.reference,
        amount: tx.amountKobo,
        currency: tx.currency,
        status: tx.status,
        channel: tx.channel,
        customerEmail: tx.customerEmail,
        customerName: tx.customerName,
        gatewayResponse: tx.gatewayResponse,
        feesNaira: tx.feesNaira,
        netNaira: tx.netNaira,
        refundedNaira: tx.refundedNaira,
        disputeStatus: tx.disputeStatus,
        paidAt: tx.paidAt,
        raw: tx.raw as never,
      },
    });
    logInfo('[paystack-webhook] processed', { event, reference: tx.reference });
    return NextResponse.json({ status: 'processed' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-webhook] upsert failed', { error: message, event });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
