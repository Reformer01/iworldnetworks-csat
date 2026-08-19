import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { incrementNonce } from '@/lib/splynx-nonce';
import { logError, logWarn, logInfo } from '@/lib/logger';
import { sendFeedbackEmail } from '@/lib/email';
import { createFeedbackToken, findFeedbackTokenByEventHash, findRecentFeedbackToken, getFeedbackBaseUrl } from '@/lib/feedback-token';

let lastSplynxNonce = 0;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringValue(value: JsonValue): value is string {
  return typeof value === 'string';
}

function isNumberValue(value: JsonValue): value is number {
  return typeof value === 'number';
}

function getString(value: JsonValue): string {
  if (isStringValue(value)) return value;
  if (isNumberValue(value)) return String(value);
  return '';
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    // Support both SHA-256 (new) and SHA-1 (legacy) for backward compatibility
    const expectedSha256 = createHmac('sha256', secret).update(payload).digest('hex');
    const expectedSha1 = createHmac('sha1', secret).update(payload).digest('hex');

    const sigBuf = Buffer.from(signature, 'utf-8');

    // Try SHA-256 first
    const expectedSha256Buf = Buffer.from(expectedSha256, 'utf-8');
    if (expectedSha256Buf.length === sigBuf.length && timingSafeEqual(expectedSha256Buf, sigBuf)) {
      return true;
    }

    // Fall back to SHA-1 for legacy webhooks
    const expectedSha1Buf = Buffer.from(expectedSha1, 'utf-8');
    if (expectedSha1Buf.length === sigBuf.length && timingSafeEqual(expectedSha1Buf, sigBuf)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function setFormValue(target: Record<string, JsonValue>, key: string, value: string) {
  const parts = key.split(/\[|\]/).filter(Boolean);
  if (!parts.length || parts.some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) {
    return;
  }

  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(cursor[part])) {
      cursor[part] = {};
    }
    // SAFETY: the previous iteration just wrote a fresh empty object (or the
    // guard above established it is a record), so the branch value is a record.
    cursor = cursor[part] as Record<string, JsonValue>;
  }

  cursor[parts[parts.length - 1]] = value;
}

function parseFormWebhookPayload(rawBody: string) {
  const payload = {};
  const params = new URLSearchParams(rawBody);

  params.forEach((value, key) => {
    setFormValue(payload, key, value);
  });

  return payload;
}

function parseWebhookPayload(rawBody: string, contentType: string) {
  const normalizedContentType = contentType.toLowerCase();

  if (normalizedContentType.includes('application/x-www-form-urlencoded')) {
    return parseFormWebhookPayload(rawBody);
  }

  if (normalizedContentType.includes('application/json') || rawBody.trim().startsWith('{')) {
    const payload = JSON.parse(rawBody);
    if (!isRecord(payload)) throw new Error('Webhook payload must be an object');
    return payload;
  }

  return parseFormWebhookPayload(rawBody);
}

async function nextSplynxNonce(): Promise<string> {
  try {
    const next = await incrementNonce('default');
    lastSplynxNonce = Math.max(Date.now(), Number(next), lastSplynxNonce + 1);
    return String(lastSplynxNonce);
  } catch {
    lastSplynxNonce = Math.max(Date.now(), lastSplynxNonce + 1);
    return String(lastSplynxNonce);
  }
}

async function buildSplynxAuthHeader(key: string, secret: string): Promise<string> {
  const authMode = (process.env.SPLYNX_API_AUTH || 'basic').toLowerCase();

  if (authMode === 'signature') {
    const nonce = await nextSplynxNonce();
    const signature = createHmac('sha256', secret).update(`${nonce}${key}`).digest('hex').toUpperCase();
    return `Splynx-EA (key=${key}&nonce=${nonce}&signature=${signature})`;
  }

  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
}

function buildSplynxCustomerUrl(host: string, customerId: string): string {
  return `${host.replace(/\/+$/, '')}/api/2.0/admin/customers/customer/${encodeURIComponent(customerId)}`;
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.SPLYNX_WEBHOOK_SECRET;
    if (!secret) {
      logError('[splynx-webhook] SPLYNX_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Not configured' }, { status: 500 });
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-splynx-signature');

    if (!signature || !verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: Record<string, JsonValue>;
    try {
      payload = parseWebhookPayload(rawBody, request.headers.get('content-type') || '');
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (payload.type === 'ping') {
      return NextResponse.json({ status: 'ok' });
    }

    if (payload.type !== 'event') {
      return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
    }

    const eventData = isRecord(payload.data) ? payload.data : {};
    const customerId = getString(eventData.customer_id);
    const model = getString(eventData.model);
    const call = getString(payload.call);
    const attributes = isRecord(eventData.attributes) ? eventData.attributes : {};

    const db = getAdminFirestore();

    // Note: real-time Firestore mirror updates were removed — the hourly
    // MariaDB sync (splynx-sync-db.ts) reconciles customers/invoices from the
    // Splynx API and mirrors to Firestore best-effort, so per-event mirrors
    // were redundant and burned Firestore quota.

    const eventHash = createHash('sha256').update(rawBody).digest('hex');
    const existingToken = await findFeedbackTokenByEventHash(eventHash);
    if (existingToken) {
      const baseUrl = getFeedbackBaseUrl(request);
      const feedbackUrl = `${baseUrl}/feedback?token=${existingToken.token}`;
      const popupUrl = `${baseUrl}/feedback/popup?token=${existingToken.token}&embed=true`;
      logInfo('[splynx-webhook] Duplicate delivery, reusing token', { customerId, eventHash });
      return NextResponse.json({
        success: true,
        deduped: true,
        token: existingToken.token,
        url: feedbackUrl,
        popupUrl,
        embedHtml: `<iframe src="${popupUrl}" width="100%" height="500" frameborder="0" style="border-radius: 12px; border: 1px solid #e5e7eb;"></iframe>`,
      });
    }

    const customerData = {
      customerName: getString(attributes.name) || getString(attributes.customer_name) || `Customer #${customerId || 'unknown'}`,
      customerEmail: getString(attributes.email),
      servicePlan: getString(attributes.tariff_name) || getString(attributes.plan_name) || getString(attributes.service_name),
      location: getString(attributes.location) || getString(attributes.city),
      serviceDate: getString(eventData.date),
      sourceEvent: call || model,
    };

    // Deduplicate by customer + event type (24h window)
    if (customerData.customerEmail && customerData.sourceEvent) {
      const recentToken = await findRecentFeedbackToken(customerData.customerEmail, customerData.sourceEvent);
      if (recentToken) {
        const baseUrl = getFeedbackBaseUrl(request);
        const feedbackUrl = `${baseUrl}/feedback?token=${recentToken.token}`;
        const popupUrl = `${baseUrl}/feedback/popup?token=${recentToken.token}&embed=true`;
        logInfo('[splynx-webhook] Duplicate customer+event, reusing recent token', {
          customerId,
          customerEmail: customerData.customerEmail,
          sourceEvent: customerData.sourceEvent,
        });
        return NextResponse.json({
          success: true,
          deduped: true,
          token: recentToken.token,
          url: feedbackUrl,
          popupUrl,
          embedHtml: `<iframe src="${popupUrl}" width="100%" height="500" frameborder="0" style="border-radius: 12px; border: 1px solid #e5e7eb;"></iframe>`,
          customer: { name: customerData.customerName, email: customerData.customerEmail },
        });
      }
    }

    const splynxHost = process.env.SPLYNX_API_HOST;
    const splynxKey = process.env.SPLYNX_API_KEY;
    const splynxSecret = process.env.SPLYNX_API_SECRET;

    if (splynxHost && splynxKey && splynxSecret && customerId) {
      try {
        const apiUrl = buildSplynxCustomerUrl(splynxHost, customerId);
        const authHeader = await buildSplynxAuthHeader(splynxKey, splynxSecret);
        const response = await fetch(apiUrl, {
          headers: {
            Authorization: authHeader,
          },
        });
        if (response.ok) {
          const apiData = await response.json();
          const info = isRecord(apiData.main_attributes) ? apiData.main_attributes : isRecord(apiData) ? apiData : {};
          const fullName = [getString(info.first_name), getString(info.last_name)].filter(Boolean).join(' ');
          customerData.customerName = getString(info.name) || fullName || customerData.customerName;
          customerData.customerEmail = getString(info.email) || customerData.customerEmail;
          customerData.servicePlan = getString(info.tariff_name) || customerData.servicePlan;
          customerData.location = getString(info.city) || getString(info.address_1) || customerData.location;
        }
      } catch (apiErr) {
        logWarn('[splynx-webhook] Splynx API fetch failed', { customerId, error: String(apiErr) });
      }
    }

    // No email = no feedback token, no send. Avoids useless tokens for events
    // without customer context (e.g. system events).
    if (!customerData.customerEmail) {
      logInfo('[splynx-webhook] No customer email, skipping token creation', { customerId, sourceEvent: customerData.sourceEvent });
      return NextResponse.json({ success: true, skipped: true, reason: 'no_customer_email' });
    }

    const { token } = await createFeedbackToken(db, {
      customerName: customerData.customerName,
      customerEmail: customerData.customerEmail,
      servicePlan: customerData.servicePlan,
      location: customerData.location,
      serviceDate: customerData.serviceDate,
      sourceEvent: customerData.sourceEvent,
      eventHash,
    });

    const baseUrl = getFeedbackBaseUrl(request);
    const feedbackUrl = `${baseUrl}/feedback?token=${token}`;
    const popupUrl = `${baseUrl}/feedback/popup?token=${token}&embed=true`;

    if (customerData.customerEmail) {
      sendFeedbackEmail({
        to: customerData.customerEmail,
        customerName: customerData.customerName,
        feedbackUrl,
      }).catch((emailErr) => {
        logWarn('[splynx-webhook] Email send failed', { email: customerData.customerEmail, error: String(emailErr) });
      });
    }

    logInfo('[splynx-webhook] Token generated', { customerId, customerEmail: customerData.customerEmail });

    return NextResponse.json({
      success: true,
      token,
      url: feedbackUrl,
      popupUrl,
      embedHtml: `<iframe src="${popupUrl}" width="100%" height="500" frameborder="0" style="border-radius: 12px; border: 1px solid #e5e7eb;"></iframe>`,
      customer: { name: customerData.customerName, email: customerData.customerEmail },
    });
  } catch (err) {
    logError('[splynx-webhook] Error', { error: String(err) });
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
