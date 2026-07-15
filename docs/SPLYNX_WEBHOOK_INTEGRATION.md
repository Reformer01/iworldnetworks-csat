# Splynx Webhook Integration Guide

**Version:** 1.0  
**Last Updated:** July 2025  
**Audience:** Splynx Admins, Backend Engineers, Platform Team

---

## 🎯 Overview

This guide covers the complete setup of the Splynx webhook integration for the CSAT platform. The integration receives real-time events from Splynx (invoices, tickets, customer updates) and automatically generates feedback collection tokens sent to customers via email.

---

## 🏗️ Architecture

```
┌─────────────────┐     Webhook POST      ┌──────────────────────────────────────────┐
│     SPLYNX      │ ────────────────────► │           CSAT PLATFORM                  │
│  (Billing/CRM)  │   x-splynx-signature  │  /api/splynx-webhook                     │
└─────────────────┘                       │  1. Verify HMAC-SHA256/SHA1 signature   │
                                          │  2. Parse payload (JSON or form-encoded) │
                                          │  3. Optional: Enrich via Splynx REST API │
                                          │  4. Create feedback token (7-day TTL)    │
                                          │  5. Send feedback email via SMTP         │
                                          │  6. Return { token, url, popupUrl }      │
                                          └──────────────────────────────────────────┘
```

---

## 📋 Supported Events

| Splynx Event | Webhook Type | Internal Category | Use Case |
|--------------|--------------|-------------------|----------|
| `invoice/create` | event | Billing | Post-payment feedback |
| `invoice/update` | event | Billing | Invoice status change |
| `tickets/ticket/create` | event | Support | New ticket opened |
| `tickets/ticket/update` | event | Support | Ticket resolved/closed |
| `customer/create` | event | Installation | New customer onboarding |
| `customer/update` | event | Installation | Plan change, details update |
| `field_service/create` | event | FieldSupport | Technician dispatch |
| `cpe/create` | event | FieldSupport | CPE installation |

**Ping Event:** `{"type": "ping"}` — Used for webhook health checks, returns `{"status": "ok"}`

---

## 🔧 Splynx Configuration

### 1. Generate Webhook Secret

```bash
# On your server or local machine
openssl rand -hex 32

# Example output: a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef
```

### 2. Configure Webhook in Splynx Admin

1. Log in to Splynx Admin: `https://splynx.iworldnetworks.net/admin`
2. Navigate: **Config → Integrations → Hooks**
3. Click **Add Hook** or **Add New**
4. Fill in:

| Field | Value |
|-------|-------|
| **Name** | CSAT Platform Feedback |
| **URL** | `https://csat.iwn.ng/api/splynx-webhook` |
| **Secret** | `[PASTE GENERATED SECRET]` |
| **Events** | Select all (or specific):<br/>✅ invoice/create<br/>✅ invoice/update<br/>✅ tickets/ticket/create<br/>✅ tickets/ticket/update<br/>✅ customer/create<br/>✅ customer/update<br/>✅ field_service/create<br/>✅ cpe/create |
| **Status** | Enabled |

5. Click **Save**

### 3. Update Production Environment

On your production server:

```bash
# Edit environment
nano /home/csat.iwn.ng/csat/.env

# Update this value with the EXACT same secret from Splynx
SPLYNX_WEBHOOK_SECRET=a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef

# Restart app to pick up new secret
pm2 restart csat
```

---

## 📡 Webhook Payload Formats

### JSON Payload (Primary)
```json
{
  "type": "event",
  "call": "customer/update",
  "data": {
    "customer_id": 12345,
    "date": "2026-07-14",
    "attributes": {
      "name": "John Doe",
      "email": "john@example.com",
      "tariff_name": "Fiber 100",
      "city": "Lagos",
      "plan_name": "Business 100",
      "service_name": "Internet",
      "location": "Ikeja",
      "tariff_name": "Home 50"
    }
  }
}
```

### Form-Encoded Payload (Legacy)
```
type=event&call=tickets/ticket/update&data[customer_id]=99&data[date]=2026-07-14&data[attributes][customer_name]=Jane+Smith&data[attributes][email]=jane@example.com&data[attributes][service_name]=Support+Case
```

### Ping (Health Check)
```json
{
  "type": "ping"
}
```

---

## 🔐 Signature Verification

### Algorithm
- **Primary:** HMAC-SHA256 (recommended)
- **Legacy Fallback:** HMAC-SHA1 (backward compatibility)

### How It Works

```javascript
// CSAT Platform verification (pseudo-code)
function verifySignature(payload, signature, secret) {
  // Try SHA-256 first (new webhooks)
  const expectedSha256 = hmac_sha256(secret, payload);
  if (timingSafeEqual(signature, expectedSha256)) return true;

  // Fall back to SHA-1 (legacy webhooks)
  const expectedSha1 = hmac_sha1(secret, payload);
  if (timingSafeEqual(signature, expectedSha1)) return true;

  return false;
}
```

### Generating Signatures (for Testing)

```bash
# SHA-256 (new)
SECRET="your-webhook-secret"
PAYLOAD='{"type":"event","call":"customer/update",...}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

# SHA-1 (legacy)
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha1 -hmac "$SECRET" | awk '{print $2}')
```

---

## 📧 Customer Enrichment (Optional)

When Splynx REST API credentials are configured, the webhook enriches customer data:

### Required Environment Variables
```env
SPLYNX_API_HOST=https://splynx.iworldnetworks.net
SPLYNX_API_KEY=your-api-key
SPLYNX_API_SECRET=your-api-secret
SPLYNX_API_AUTH=basic  # or 'signature' for Splynx-EA HMAC auth
```

### Enrichment Flow
1. Webhook receives `customer_id` from event
2. Calls Splynx API: `GET /api/2.0/admin/customers/customer/{id}`
3. Extracts enriched data: `first_name`, `last_name`, `email`, `city`, `tariff_name`
4. Overrides webhook attributes with enriched data

### Authentication Modes

| Mode | Header Format | Use Case |
|------|---------------|----------|
| `basic` | `Authorization: Basic base64(key:secret)` | Standard API keys |
| `signature` | `Authorization: Splynx-EA (key=...&nonce=...&signature=...)` | Splynx-EA HMAC (more secure) |

---

## 📤 Response Format

### Success Response
```json
{
  "success": true,
  "token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "url": "https://csat.iwn.ng/feedback?token=a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "popupUrl": "https://csat.iwn.ng/feedback/popup?token=a1b2c3d4-e5f6-7890-abcd-ef1234567890&embed=true",
  "embedHtml": "<iframe src=\"https://csat.iwn.ng/feedback/popup?token=...&embed=true\" width=\"100%\" height=\"500\" frameborder=\"0\" style=\"border-radius: 12px; border: 1px solid #e5e7eb;\"></iframe>",
  "customer": {
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### Error Responses

| Status | Error | Cause |
|--------|-------|-------|
| 400 | `Invalid payload` | Malformed JSON or form data |
| 400 | `Unknown type` | Payload type not `event` or `ping` |
| 401 | `Invalid signature` | HMAC verification failed |
| 500 | `Not configured` | `SPLYNX_WEBHOOK_SECRET` not set |
| 500 | `Internal server error` | Unexpected error |

---

## 📧 Email Flow

When customer has email in webhook/enriched data:

1. **Token created** → 7-day TTL, stored in Firestore `feedback_tokens`
2. **Email queued** → Async, fire-and-forget via Nodemailer
3. **SMTP Config** from Splynx:
   ```env
   SPLYNX_SMTP_HOST=mail.iworldnetworks.net
   SPLYNX_SMTP_PORT=465
   SPLYNX_SMTP_USER=no_reply@mail.iworldnetworks.net
   SPLYNX_SMTP_PASS=<from Splynx Admin>
   SPLYNX_FROM_EMAIL=no_reply@mail.iworldnetworks.net
   SPLYNX_FROM_NAME=I-World Networks Limited
   ```
4. **Email Content:**
   - Subject: "How was your experience with I-World Networks?"
   - Links: Full feedback page + Popup embed URL
   - Customer name personalized

---

## 🧪 Testing the Integration

### 1. Health Check (Ping)
```bash
curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"ping"}'

# Expected: {"status":"ok"}
```

### 2. Valid Webhook (SHA-256)
```bash
SECRET="your-production-secret"
PAYLOAD='{"type":"event","call":"customer/update","data":{"customer_id":123,"attributes":{"name":"Test User","email":"test@example.com","tariff_name":"Fiber 100","city":"Lagos"}}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -H "x-splynx-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### 3. Valid Webhook (SHA-1 Legacy)
```bash
SECRET="your-production-secret"
PAYLOAD='{"type":"event","call":"tickets/ticket/update","data":{"customer_id":99,"attributes":{"customer_name":"Test","email":"test@example.com"}}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha1 -hmac "$SECRET" | awk '{print $2}')

curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -H "x-splynx-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### 3. Invalid Signature Test
```bash
curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -H "x-splynx-signature: invalid-signature" \
  -d '{"type":"event"}'

# Expected: 401 {"error":"Invalid signature"}
```

### 4. Verify Email Sent
- Check recipient inbox for "How was your experience with I-World Networks?"
- Verify links work: `/feedback?token=...` and `/feedback/popup?token=...&embed=true`

---

## 🔗 Feedback Form URLs

| URL | Use Case |
|-----|----------|
| `/feedback?token={token}` | Full-page feedback form |
| `/feedback/popup?token={token}&embed=true` | Embeddable popup (iframe) |
| `/feedback/popup?token={token}` | Popup without embed mode |

### Embedding in Customer Portal
```html
<!-- Use the embedHtml from webhook response -->
<iframe 
  src="https://csat.iwn.ng/feedback/popup?token=TOKEN_HERE&embed=true" 
  width="100%" 
  height="500" 
  frameborder="0" 
  style="border-radius: 12px; border: 1px solid #e5e7eb;">
</iframe>
```

---

## 📊 Feedback Categories Mapping

| Splynx Event Contains | Category | Display Label |
|----------------------|----------|---------------|
| `invoice` | Billing | Payments & Billing |
| `ticket` | Support | Customer Support |
| `customer` | Installation | Customer Onboarding |
| `field_service` | FieldSupport | Field Support |
| `cpe` | FieldSupport | Field Support |
| `repair` | FieldSupport | Field Support |
| (default) | Reliability | Internet Quality |

---

## 🔍 Monitoring & Debugging

### Log Locations
```bash
# Application logs (PM2)
pm2 logs csat --lines 100 | grep splynx

# Nginx access logs
grep splynx /var/log/nginx/access.log

# Filter by signature errors
grep "Invalid signature" /var/log/nginx/access.log
```

### Key Metrics to Monitor
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Webhook success rate | > 99% | < 95% |
| Signature verification failures | 0 | > 5/min |
| Email send failures | < 1% | > 5% |
| Token creation latency | < 500ms | > 2s |
| Splynx API enrichment latency | < 1s | > 5s |

### Debug Endpoints
```bash
# Token validation (used by feedback form)
curl "https://csat.iwn.ng/api/feedback-token/validate?token=TOKEN_HERE"

# Health check
curl https://csat.iwn.ng/api/health
```

---

## 🔧 Common Issues & Fixes

| Issue | Symptoms | Fix |
|-------|----------|-----|
| **401 Invalid signature** | All webhooks rejected | Verify `SPLYNX_WEBHOOK_SECRET` matches exactly in Splynx and server `.env` |
| **No email sent** | Token created but no email | Check `SPLYNX_SMTP_PASS` in env; check Splynx email config |
| **Customer data missing** | Name/email/plan empty | Verify Splynx API credentials; check API response in logs |
| **Form-encoded fails** | JSON works, form fails | Ensure `Content-Type: application/x-www-form-urlencoded` |
| **Enrichment fails** | Webhook works but no enriched data | Check `SPLYNX_API_HOST/KEY/SECRET`; verify API access in Splynx |
| **SSL errors** | Webhook timeout/SSL error | Verify SSL cert valid; Cloudflare Full (Strict) mode |

---

## 🔄 Migration: SHA-1 → SHA-256

The platform now supports **both** algorithms:

1. **New webhooks** should use SHA-256 (more secure)
2. **Existing webhooks** continue working with SHA-1
3. **Migration path:**
   - Update Splynx webhook to send SHA-256 (if Splynx supports it)
   - Or keep SHA-1 (backward compatible)
   - Both verified by platform

### Checking Which Algorithm
```bash
# In logs, look for:
# "Verified with SHA-256" or "Verified with SHA-1 (legacy)"
```

---

## 📞 Support Contacts

| Issue | Contact |
|-------|---------|
| Splynx webhook config | Splynx Support: support@splynx.com |
| Webhook signature issues | Backend Team: backend@iworldnetworks.net |
| Email delivery issues | Platform Team: platform@iworldnetworks.net |
| SSL/DNS issues | DevOps: devops@iworldnetworks.net |

---

## 📚 Additional Resources

- [Splynx Webhooks Documentation](https://wiki.splynx.com/hooks)
- [Splynx REST API Docs](https://api-doc.splynx.com/)
- [HMAC Signature Verification Best Practices](https://tools.ietf.org/html/rfc2104)
- [CSAT Platform API Reference](./API_REFERENCE.md)

---

*Document maintained by: Backend Team*  
*Review cycle: Per Splynx version update or quarterly*