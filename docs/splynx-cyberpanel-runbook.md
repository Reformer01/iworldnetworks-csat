# Splynx Integration — CyberPanel Deployment & Test Runbook

This runbook describes exact steps to deploy the platform to CyberPanel, configure Splynx webhook/auth, and test end-to-end. It assumes single Node instance managed by PM2 behind Nginx (CyberPanel default) and Cloudflare controlling the public DNS.

## Required secrets / environment variables
- `SPLYNX_API_HOST` — e.g. `https://splynx.example.com`
- `SPLYNX_API_KEY` — Splynx API key
- `SPLYNX_API_SECRET` — Splynx API secret
- `SPLYNX_API_AUTH` — `basic` or `signature` (we will use `signature` per decision)
- `SPLYNX_WEBHOOK_SECRET` — secret used to verify inbound webhook HMAC (SHA-256)
- `SPLYNX_SMTP_HOST`, `SPLYNX_SMTP_PORT`, `SPLYNX_SMTP_USER`, `SPLYNX_SMTP_PASS` — SMTP creds for sending emails
- `SPLYNX_FROM_EMAIL`, `SPLYNX_FROM_NAME` — email sender
- `FEEDBACK_BASE_URL` — public base URL for feedback pages (e.g. `https://csat.iwn.ng`)
- `FIREBASE_SERVICE_ACCOUNT_JSON` — service account JSON string for Firestore admin
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` — Firebase project id

Also ensure GitHub Secrets for CI/CD: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`.

## CyberPanel server setup (concise)
1. Create site in CyberPanel for the `FEEDBACK_BASE_URL` domain.
2. Upload or generate an origin certificate (Let’s Encrypt or Cloudflare origin cert). Set Cloudflare SSL to `Full (Strict)`.
3. In the site `Manage` page, add environment variables (or use a PM2 ecosystem file). Add all variables listed above.
4. Place the repository on the server (git clone) or use GitHub Actions deploy workflow in `.github/workflows/deploy.yml`.
5. Ensure Node.js 20+ is installed. From the site folder run:

```powershell
npm ci
npm run build
pm2 start npm --name csat -- start
pm2 save
```

6. Configure the Nginx site to include `nginx/csat.iwn.ng.conf` contents if using the provided config. Ensure `real_ip` from Cloudflare is handled if proxied.
7. Configure firewall to allow incoming HTTP/HTTPS and restrict SSH.

## Persistent nonce (what we added)
- A Firestore-backed helper `src/lib/splynx-nonce.ts` stores per-key nonces in collection `splynx_nonces` to ensure monotonic nonces across restarts.
- `src/lib/splynx-api.ts` now uses `buildAuthHeader()` (async) to read and increment nonces when `SPLYNX_API_AUTH=signature`.
- `src/app/api/splynx-webhook/route.ts` also uses the same nonce flow when calling Splynx API.

## Webhook endpoint
- Public endpoint: `POST https://<FEEDBACK_BASE_URL>/api/splynx-webhook`
- The request must include header `x-splynx-signature` which is an HMAC of the raw body using the `SPLYNX_WEBHOOK_SECRET` (SHA-256 preferred; SHA-1 fallback supported).

## Local curl test (generate signature using Node)
Save this as `sign-and-send.js` and run with `node sign-and-send.js` to test the webhook locally.

```js
// sign-and-send.js
const crypto = require('crypto');
const fetch = require('node-fetch');

const secret = process.env.SPLYNX_WEBHOOK_SECRET || 'testsecret';
const url = process.env.TARGET_URL || 'https://csat.iwn.ng/api/splynx-webhook';

const payload = {
  type: 'event',
  call: 'payment.create',
  data: {
    customer_id: 42,
    model: 'payment',
    attributes: { name: 'Jane Doe', email: 'jane@example.com', tariff_name: 'Basic' },
    date: new Date().toISOString(),
  }
};

const body = JSON.stringify(payload);
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

(async () => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-splynx-signature': sig }, body });
  console.log('status', res.status);
  console.log(await res.text());
})();
```

Run the script with:

```powershell
setx SPLYNX_WEBHOOK_SECRET "your_webhook_secret"
node sign-and-send.js
```

Alternatively, sign with `openssl` + `curl` (on Linux/macOS):

```bash
BODY='{"type":"event","call":"payment.create","data":{"customer_id":42}}'
SIG=$(printf "%s" "$BODY" | openssl dgst -sha256 -hmac "your_webhook_secret" | cut -d' ' -f2)
curl -X POST -H "Content-Type: application/json" -H "x-splynx-signature: $SIG" -d "$BODY" https://csat.iwn.ng/api/splynx-webhook
```

## End-to-end with Splynx admin
1. In Splynx admin go to Webhooks and add a new webhook pointing to `https://<FEEDBACK_BASE_URL>/api/splynx-webhook`.
2. Use `SPLYNX_WEBHOOK_SECRET` for the HMAC secret in Splynx webhook settings.
3. Configure events to send (payments, tickets, etc.).
4. Trigger an event in Splynx and verify your server logs and Firestore `feedback_tokens` collection for created tokens.

## Troubleshooting
- If webhook returns 401: check `x-splynx-signature` and `SPLYNX_WEBHOOK_SECRET` match, and ensure the raw body used for HMAC is identical.
- If Splynx API calls fail with nonce errors: confirm Firestore permissions for the service account and that `splynx_nonces/default` doc was created.
- If email fails: verify SMTP connectivity and DNS (SPF/DKIM).

## Next actions (recommended)
1. Add a Cloudflare page rule to bypass cache for `/api/splynx-webhook` and add a firewall rule to allow Splynx IPs (optional).
2. Create a small monitoring check that hits `/api/splynx-webhook` with a `ping` payload to ensure health.
3. Run E2E tests and validate logs for 24–72 hours after cutover.
