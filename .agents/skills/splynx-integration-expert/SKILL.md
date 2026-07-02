---
name: splynx-integration-expert
description: Expert knowledge of Splynx, the ISP billing/CRM/network-management platform — its REST API, RADIUS/MikroTik network layer, payment gateway and accounting add-ons, the Hooks/Webhooks automation framework, and core modules (Customers, Leads/CRM, Tariff plans, Tickets, Finance/Billing, Customer portal). Use this any time the user mentions Splynx, splynx-php-api, api-doc.splynx.com, wiki.splynx.com, building/debugging a Splynx integration or add-on, Splynx webhooks/hooks, Splynx RADIUS/NAS/MikroTik config, Splynx payment gateways (Stripe/PayPal/Authorize.net/PayFast/Moneris/Payrix/etc.), or Splynx custom additional fields. Trigger even without the word "Splynx API" — e.g. "get my MikroTik routers talking to Splynx" or "sync invoices to Xero from our ISP system" still need this skill.
---

# Splynx Integration Expert

## What Splynx is

Splynx is an ISP/WISP business-management framework: customer billing (prepaid & recurring), CRM/leads, helpdesk ticketing, tariff-plan management, and network management (RADIUS AAA, bandwidth shaping, CPE/NAS device control) in one system. Anthropic doesn't host or run Splynx — every real task here is either (a) talking to a customer's running Splynx server via its API/RADIUS/webhooks, or (b) configuring/building something that plugs into it. Treat this like building against any vendor platform: read the relevant reference below, don't guess at parameter names, and flag when something needs to be verified against the user's specific Splynx version (the platform evolves quickly — v5.x changed several things from v4.x, e.g. mass payments, Tax Groups).

If the user's question goes beyond what's in this skill's references, the canonical sources are:
- `https://wiki.splynx.com/` — the product documentation (admin & config UI, modules, add-ons)
- `https://api-doc.splynx.com/` — the REST API reference (every endpoint, request/response schema)
- `https://forum.splynx.com/` — community/support forum, good for edge cases and gotchas
- `https://bitbucket.org/splynx/splynx-php-api/` — the official PHP API client/example code

Web-search these when you need an endpoint, parameter, or add-on detail this skill doesn't cover — Splynx ships new add-ons and API fields regularly, so don't treat this skill as exhaustive.

## The five extension points — pick the right one first

Almost every "how do I integrate X with Splynx" question is really "which of these five mechanisms should I use?" Get this right before writing any code:

| Mechanism | Direction | Use it when... | Reference |
|---|---|---|---|
| **REST API** | You pull/push Splynx data on demand | You need to read or write customers, services, invoices, tickets, leads, etc. from external code (scripts, BI tools, your own app) | [API Reference](#api-reference) |
| **Hooks (sync scripts / RabbitMQ queues)** | Splynx → local script on the Splynx server | You want to react to an internal Splynx event (customer created, ticket updated) by running a script *on the Splynx box itself* | [Integration Framework](#integration-framework) |
| **Webhooks** | Splynx → your external HTTP endpoint | You want Splynx to notify an external system (Slack, Zapier, your SaaS) the moment something happens, over HTTPS | [Integration Framework](#integration-framework) |
| **Add-ons & Modules list** | Bidirectional, packaged | The integration you need already exists as an official add-on (Stripe, Xero, GenieACS, WhatsApp, ...) — install & configure it rather than building it | [Add-ons Catalog](#add-ons-catalog), [Payment & Billing](#payment-gateways-accounting--billing-engine) |
| **RADIUS / MikroTik API** | Splynx ↔ network hardware | The integration is about authenticating, shaping, or disconnecting a subscriber's connection, not about billing data | [Networking & RADIUS](#networking-radius--mikrotik-integration) |

A useful gut-check: if the user is moving *business data* (customers, money, tickets), think API/hooks/webhooks/add-ons. If they're moving *network state* (who's online, what speed they get, IP/MAC binding), think RADIUS/MikroTik. Many real projects (e.g. "block a customer's internet when their invoice is overdue") need *both* — Splynx already wires its own billing status to RADIUS internally, so usually you only need to touch one side.

## API quick reference

- Base path pattern: `https://{splynx_host}/api/2.0/{admin|customer}/{module}/{controller}/{id?}`. There's also a legacy v1; always prefer v2.0 for new work.
- **Three auth methods**, all configured via `Administration → API keys`:
  1. **Token (login/password)** — exchange admin login+password for a short-lived token, then send it as a header on subsequent calls.
  2. **Basic auth with an API key** — only works if the key has *Unsecure access* enabled; the key:secret pair is Base64-encoded into the `Authorization: Basic ...` header.
  3. **Signature auth (`Splynx-EA`)** — HMAC-SHA256 of `nonce + key` using the secret, sent as `Authorization: Splynx-EA (key=...&nonce=...&signature=...)`.
- **PUT requests for updates are picky.** A naive PUT often fails silently — you generally need to send the `id` and re-send the full attribute set, not a partial patch.
- **Search/filter syntax** uses `main_attributes[field][0]=OPERATOR&main_attributes[field][1]=VALUE`, with operators `=`, `!=`, `>=`, `<=`, `>`, `<`, `<>`, `IS`, `REGEXP`, `BETWEEN`, `LIKE`, `IN`, `FIND_IN_SET`. Custom additional fields use `additional_attributes[field]=...` instead of `main_attributes`. This trips people up constantly — if a search "isn't working," check whether the field is a main attribute or an additional (custom) field first.
- For PHP, start from the official `SplynxApi.php` client rather than hand-rolling HTTP calls — it handles the signature scheme correctly.

## Core data model

Every integration eventually touches some subset of: **Customers** (with Information/Services/Billing/Statistics/Documents/CPE/Communication tabs), **Leads/CRM** (pre-customer pipeline, converts into a Customer), **Tariff plans** (Internet/Voice/Recurring/One-Time/Bundle — assigned to a customer as a "service"), **Tickets** (helpdesk), and **Finance** (Invoices, Proforma invoices, Payments, Credit notes, Transactions — Splynx's billing is transaction-based). Almost any entity can carry **custom additional fields** (admin-defined, per-module, exposed via `additional_attributes` in the API and `{{ customer_attributes.field_name }}`-style Twig variables) — this is the standard way to extend Splynx's schema without code.

## Working method for this skill

1. **Clarify the goal in business terms first** — then map it onto the extension-point table. Don't jump to API code before knowing whether a hook, webhook, or existing add-on is the better fit.
2. **Check the add-ons catalog before building anything.** Splynx already ships official integrations for most popular payment gateways, accounting platforms, SMS/communication tools, and network/CPE management systems. Building a custom integration for something that's a one-click install is wasted effort.
3. **For anything touching RADIUS/NAS/MikroTik/bandwidth/FUP**, read the [Networking & RADIUS](#networking-radius--mikrotik-integration) section — this area has specific terminology where guessing produces plausible-sounding but wrong configuration advice.
4. **For anything about money** (charging, refunds, proration, tax, multi-currency), read the [Payment & Billing](#payment-gateways-accounting--billing-engine) section — Splynx's billing has real nuance.
5. **When writing integration code** (hook scripts, webhook handlers, API clients), follow the working patterns in the [Integration Framework](#integration-framework) section exactly — Splynx's webhook signature validation and hook script I/O are specific enough that deviating is a common source of "it should work but doesn't" bugs.
6. **State your assumptions about the Splynx version/edition** when they matter (e.g. mass payments and Tax Groups are v5.0+ features).
7. **When genuinely uncertain about a current endpoint, field name, or add-on**, say so and web-search `api-doc.splynx.com` or `wiki.splynx.com` rather than fabricating a plausible-looking parameter.

---

# API Reference

Canonical source: `https://api-doc.splynx.com/` (full endpoint catalog, request/response schemas). This section covers the conventions that apply *across* endpoints — auth, search, updates, gotchas — which the endpoint catalog doesn't always make obvious.

## URL structure

```
https://{splynx_host}/api/2.0/{admin|customer}/{module}/{controller}/{id?}
```

- `admin` vs `customer` selects which API surface you're using — the admin API can touch any record (subject to the API key's permissions); the customer API is scoped to a single authenticated customer.
- `{module}/{controller}` mirrors the admin UI's structure, e.g. `admin/customers/customer`, `admin/customers/customer/{id}/internet-services`, `admin/crm/quotes`, `admin/finance/invoices`, `admin/tickets/ticket`.
- There is a legacy v1 API; don't use it for new integrations — everything here is v2.0.
- Always use HTTPS in production.

## Authentication

All three methods are configured starting from `Administration → API keys`. Before debugging an "auth" failure, check the key's **permissions** for the specific module you're calling — a permissions error and an auth error can look identical from the client side.

### 1. Token auth (admin login/password)

Exchange an admin account's login + password for a token, then use the token on subsequent requests.

```
POST /api/2.0/admin/auth/tokens
{
  "auth_type": "admin",
  "login": "your_admin_login",
  "password": "your_admin_password"
}
```

The response contains an access token; send it as a Bearer/Authorization header on subsequent requests. For automation, prefer a dedicated service-account admin rather than a real person's login.

### 2. Basic auth with an API key (Unsecure access)

1. In `Administration → API keys`, create a key with **Unsecure access** enabled.
2. Base64-encode the secret/credential string for that key.
3. Send it as `Authorization: Basic {base64string}`.

This is the simplest scheme to wire up quickly (e.g. in Postman during prototyping) but is explicitly the "unsecure" option — prefer signature auth or token auth for anything production-facing.

### 3. Signature auth (`Splynx-EA`) — the v1-compatible scheme

This is the scheme the official PHP client (`SplynxApi.php`) implements, and the one most third-party integrations historically use.

1. Create an API key + secret in `Administration → API keys` (do **not** enable Unsecure access for this one).
2. For each request, compute:
   - `nonce` = an incrementing integer (must increase between requests — Splynx rejects replayed/non-increasing nonces)
   - `signature` = uppercase `HMAC_SHA256(nonce + key, secret)`
3. Send the header:
   ```
   Authorization: Splynx-EA (key={key}&nonce={nonce}&signature={signature})
   ```

Example pre-request script logic for Postman:

```javascript
var crypto = require('crypto-js');

const KEY = 'your_api_key';
const SECRET = 'your_api_secret';

var nonce = pm.globals.get('nonce') || 0;
var str = ++nonce + KEY;
var hash = crypto.HmacSHA256(str, SECRET).toString().toUpperCase();
var authHeader = 'Splynx-EA (key=' + KEY + '&nonce=' + nonce + '&signature=' + hash + ')';

pm.environment.set("authorizationHeader", authHeader);
pm.globals.set('nonce', nonce);
```

In plain PHP:

```php
$nonce = time(); // must be strictly increasing across requests; persist it between calls
$str = $nonce . $key;
$signature = strtoupper(hash_hmac('sha256', $str, $secret));
$authHeader = "Splynx-EA (key={$key}&nonce={$nonce}&signature={$signature})";
```

**Don't reset the nonce to 0 on every run of a long-lived integration** — if it's not monotonically increasing relative to what Splynx last saw from that key, requests will be rejected. Persist it (file, DB row, in-memory counter) for the life of the integration process.

## Searching and filtering records

GET list endpoints accept a structured query for filtering (PHP example):

```php
$params = [
    'main_attributes' => [
        'login'      => ['LIKE', 'durden'],
        'partner_id' => ['BETWEEN', 1, 10],
        'date_add'   => date('Y-m-d'),
        'added_by'   => 'api',
    ],
    'additional_attributes' => [
        'sex' => ['IN', ['male', 'female']],
    ],
    'order'  => ['id' => 'DESC'],
    'limit'  => 10,
    'offset' => 20,
];

$apiUrl = 'admin/customers/customer?' . http_build_query($params);
```

Key things to get right:

- **`main_attributes` vs. `additional_attributes`.** Built-in fields go under `main_attributes`. Anything created via custom additional fields goes under `additional_attributes`, keyed by the field's *name* (not its display title). This is the single most common cause of "my search returns nothing."
- **Operators**: `=`, `!=`, `>=`, `<=`, `>`, `<`, `<>`, `IS`, `REGEXP`, `BETWEEN`, `LIKE`, `IN`, `FIND_IN_SET`. If you omit an operator and pass a bare value, Splynx assumes `=`.
- **`BETWEEN`** takes two values after the operator (`['BETWEEN', $start, $end]`) and works for numeric ranges, dates, and lexicographic string comparison depending on the underlying column type.
- **`REGEXP`** takes a regex pattern as the second element. Example:
  ```
  https://your_splynx_url/api/2.0/admin/crm/quotes/?main_attributes[id][0]=REGEXP&main_attributes[id][1]=^(?!1|2|3|4|5)
  ```
- **`FIND_IN_SET` vs `IN`**: `IN` checks whether *the column's value* is one of a list you supply. `FIND_IN_SET` checks whether *a value you supply* exists inside a comma-separated string stored in the column. They are not interchangeable.
- **`order`, `limit`, `offset`** work as expected for pagination; use a stable `order by id` if exact consistency matters across pages.

## Updating records with PUT

A naive PUT (sending only the changed field) is a common source of confusion — Splynx's PUT semantics for some endpoints expect the full attribute set plus the `id`.

- Confirm the `id` is included exactly where the endpoint's documented path/body expects it.
- If an update silently no-ops, check the response body/status code rather than assuming success — some endpoints return 200 with an unchanged record rather than erroring if a required field was missing.

## Working with custom additional fields via the API

- **Reading:** additional fields generally come back nested under an `additional_attributes` object in the GET response, keyed by field name.
- **Writing/searching:** use the field's **name** (the DB-facing identifier set when the field was created), not its display **title**.
- If a field you expect isn't appearing in the API response, check whether it's scoped to a specific customer category (Individual/Business/All) — a field scoped away from a given record's category won't show up for that record.

## Logs, debugging, and the PHP client

- `Administration → Logs → API` shows a log of API requests made by installed add-ons — useful for diagnosing why an add-on's calls are failing.
- For PHP integrations, start from the official client:
  - Source: `https://bitbucket.org/splynx/splynx-php-api/src/master/`
  - Also present on every running Splynx server at `/var/www/splynx/addons/splynx-addon-base-2/vendor/splynx/splynx-php-api`
  - Exposes methods like `api_call_get($url)`, `api_call_post($url, $params)`, `api_call_delete($url, $id)`; parsed result on `$api->response` / `$api->response_code`.

## Common mistakes (quick checklist)

1. Custom field referenced under `main_attributes` instead of `additional_attributes` (or vice versa).
2. Custom field referenced by its display **title** instead of its DB **name**.
3. Signature-auth nonce reset to a value Splynx has already seen (rejected as a replay).
4. API key permissions don't cover the module being called — looks like an auth failure, is actually a scope failure.
5. PUT request missing the ID or Authorization header in the actual request — verify with a raw HTTP capture.
6. Using the v1 API path/scheme for new work instead of v2.0.
7. Assuming a field exists on a record when it's actually customer-category-scoped and absent for this particular record.

---

# Integration Framework

Hooks, Webhooks, Queues, and Add-ons — how to make Splynx talk to your system, or your system react to Splynx.

## Hooks (local scripts)

**What it is:** Configured under `Config → Integrations → Hooks`. A hook listens for a specific internal Splynx event; when that event fires, Splynx executes a script you've placed on the Splynx server's filesystem, piping event data to it as JSON on STDIN.

**When to use it:** You want something to happen *on the Splynx server itself* in reaction to an internal event — sending a custom notification, writing to a local log/file, triggering a local process.

**Setup steps:**
1. Place a PHP (or other) script in the home folder on the Splynx server.
2. Make it executable: `chmod 755 script-file.php`
3. In `Config → Integrations → Hooks`, create a hook: pick the event to listen for, and point `path` at your script.
4. The script receives the event payload as JSON on STDIN — decode it and act on it.

Minimal working script (keep the STDIN-reading boilerplate as-is):

```php
#!/usr/bin/php
<?php
defined('STDIN') OR define('STDIN', fopen('php://stdin', 'r'));

$data = fgets(STDIN);
$data = json_decode($data, true);

// --- your logic below ---
$to = "mail_box_to@example.com";
$subject = "Splynx event notification";
$message = "Customer \"{$data['attributes']['name']}\" was created {$data['date']} by {$data['source']}";
mail($to, $subject, $message);
```

The decoded `$data` array looks like:

```json
{
  "type": "", "call": "",
  "data": {
    "source": "admin",
    "model": "models\\admin\\administration\\Locations",
    "action": "get_list",
    "date": "2017-09-20", "time": "14:38:12",
    "administrator_id": "1", "customer_id": null,
    "result": "success",
    "attributes": {"id": null, "name": null},
    "attributes_additional": [],
    "changed_attributes": null, "extra": null, "errors": null,
    "ip": "192.168.77.233"
  }
}
```

**Gotcha:** the server's default mail setup (Sendmail) typically only delivers within the local network. If a hook script needs to send email externally, the mail server needs reconfiguring — don't assume `mail()` "just works" for external recipients.

## Custom named queues (RabbitMQ)

**What it is:** Instead of (or in addition to) running a script synchronously, Splynx pushes the event onto a named RabbitMQ queue that your own long-running consumer process reads from.

**When to use it:** Higher-throughput or asynchronous processing — you don't want every event spawning a new PHP process.

**Setup:** In the hook config, select hook type **Queue** and give it a queue name. Your consumer must declare the queue with the *exact same parameters* Splynx uses. Example consumer using BunnyPHP:

```php
<?php
use Bunny\Channel;
use Bunny\Async\Client;
use Bunny\Message;
use React\EventLoop\Factory;

require '../vendor/autoload.php';

$connectOptions = [
    'host' => '127.0.0.1', 'port' => 5672, 'vhost' => '/',
    'user' => 'guest', 'password' => 'guest',
];

$loop = Factory::create();
(new Client($loop))->connect()->then(function (Client $client) {
    return $client->channel();
})->then(function (Channel $channel) {
    return $channel->queueDeclare('hooks2', false, true, false, false)
        ->then(function () use ($channel) { return $channel; });
})->then(function (Channel $channel) {
    $channel->consume(
        function (Message $message, Channel $channel, Client $client) {
            $payload = json_decode($message->content, true);
            // process $payload
        },
        'hooks2'
    );
});
$loop->run();
```

The message body is the same JSON shape as the synchronous hook payload above.

## Webhooks (Splynx → your external HTTPS endpoint)

**What it is:** Configured under `Config → Integrations → Hooks`. You register a URL and the events you want; Splynx POSTs a JSON payload to that URL whenever a subscribed event fires — the right tool when the receiver is *outside* the Splynx server.

**Signature validation is mandatory in any real implementation.** Splynx signs each payload and sends the signature in the `X-Splynx-Signature` header: `signature = HMAC-SHA1(raw_request_body, secret)`. Always verify this before processing a payload.

**Two request types arrive at your endpoint:**
- `ping` — a test/connectivity check Splynx sends; respond `200 ok` and do nothing else.
- `event` — an actual event payload; verify the signature, then process.

**Delivery retries:** if your endpoint errors, Splynx retries: immediately, after 1 minute, after 10 minutes, after 1 hour. Design your handler to be idempotent — safe to receive the same event twice.

**Reference PHP handler:**

```php
<?php
define('REQUEST_TYPE_PING', 'ping');
define('REQUEST_TYPE_EVENT', 'event');
define('CONTENT_TYPE_JSON', 'application/json');
define('CONTENT_TYPE_FORM_URLENCODED', 'application/x-www-form-urlencoded');

$headers = getHeaders();
$input = file_get_contents('php://input');
$contentType = $headers['Content-Type'] ?? '';

$postData = ($contentType === CONTENT_TYPE_JSON)
    ? json_decode($input, true)
    : (function() use ($input) { parse_str($input, $r); return $r; })();

$requestType = $postData['type'] ?? null;

if ($requestType === REQUEST_TYPE_PING) {
    http_response_code(200);
    exit('ok');
}

if ($requestType !== REQUEST_TYPE_EVENT) {
    http_response_code(400);
    exit('Invalid request type!');
}

$secret = 'your secret'; // from the webhook config in Splynx
$calculatedSignature = hash_hmac('sha1', $input, $secret);
$inputSignature = $headers['X-Splynx-Signature'] ?? '';

if (hash_equals($inputSignature, $calculatedSignature)) {
    http_response_code(200);
    echo 'ok';
    // process the verified event here
} else {
    http_response_code(401);
    exit('Unauthorized!');
}

function getHeaders() {
    if (function_exists('getallheaders')) return getallheaders();
    $headers = [];
    foreach ($_SERVER as $name => $value) {
        if (strncmp($name, 'HTTP_', 5) === 0) {
            $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
            $headers[$name] = $value;
        }
    }
    return $headers;
}
```

Port the same structure to any language: read the raw body *before* parsing it (signature is computed over the raw bytes), compute HMAC-SHA1 with the shared secret, compare with a constant-time comparison (`hash_equals` or equivalent — never `==` on signatures).

## Add-ons → Modules list → Entry points lifecycle

Three-stage lifecycle used by all packaged integrations:

1. **`Config → Integrations → Add-ons`** — install/update/remove. Can be done via the web UI or CLI (`apt-get install splynx-<addon-name>`). Add-on availability can be filtered by the ISO country set in `Config → System → Company information` — if an expected add-on isn't showing up, check that field first.
2. **`Config → Integrations → Modules list`** — configure the add-on's settings (API keys/credentials, behavior toggles) and enable/disable **Entry points** (the customer-portal-facing routes the add-on adds). An add-on can be installed but non-functional simply because its entry points aren't enabled here.
3. **Per-add-on configuration** — commonly includes API domain/key/secret, payment-method mapping, partner scoping (most accounting integrations explicitly do **not** support syncing multiple partners at once), and webhook initialization buttons.

## Building a brand-new custom integration from scratch

1. **Inbound to Splynx** (pushing data in): use the REST API with whichever auth scheme matches the API key you're creating.
2. **Outbound from Splynx, processed on the Splynx box**: use a Hook (sync script) or a custom RabbitMQ queue for higher volume.
3. **Outbound from Splynx, processed elsewhere**: use a Webhook, with proper signature verification (non-negotiable).
4. **If the integration needs a persistent settings UI inside Splynx itself** — that's full add-on territory; the public-facing extension surface documented for third parties is the API + hooks + webhooks. If a user specifically wants a first-class add-on shipped *inside* Splynx's add-on system, suggest contacting Splynx or the forum rather than fabricating add-on-development steps.
5. **Add custom fields as needed** so the data you're syncing has somewhere to live inside Splynx without forking core behavior.

## Decision guide recap

- Need to read/write Splynx data from your own code on a schedule or on-demand? → **REST API**.
- Need a local action on the Splynx server when something happens inside Splynx? → **Hook (script)**, or a **custom queue** if it needs to be async/high-throughput.
- Need an external system to be notified the instant something happens in Splynx? → **Webhook**, with signature verification.
- Need a well-known external service (Stripe, Xero, GenieACS, WhatsApp, ...) connected? → Check **Add-ons** first; it's very likely already built.

---

# Networking, RADIUS & MikroTik Integration

The network-layer half of Splynx: how subscriber connections get authenticated, shaped, and disconnected. This is a different problem domain from the business-data API — read this before answering anything about routers, NAS devices, bandwidth, FUP, or "why won't this customer's connection authenticate."

## Routers / NAS overview

`Networking → Routers` is where Network Access Servers are registered. Each router needs:

- **NAS type** (managed in `Config → Networking → NAS types`) — determines which vendor-specific RADIUS dictionary/behavior applies.
- **IP/Host** — the address Splynx connects to (for API-managed routers) and the address Splynx's RADIUS server expects accounting/auth packets to originate from.
- **NAS IP** — the RADIUS `NAS-IP-Address` attribute value the router's RADIUS client sends; usually matches IP/Host, but on MikroTik can be explicitly set via the RADIUS client's `Src. Address`.
- **Alternative IP addresses** — for failover setups or certain load-balancer topologies.
- **Authorization type** and **Accounting type** — these two choices define how the integration actually works for that router.

Even if Authorization is set to **None**, Splynx's RADIUS server still accepts auth/accounting packets from the router — "None" just means Splynx won't actively push config to the router via API.

## Authorization types

| Type | Mechanism |
|---|---|
| **None** | Non-standard scenarios; no active push from Splynx. |
| **Firewall IP-MAC filter** | MikroTik API manages firewall filter rules — typical for static-IP setups. |
| **DHCP (Leases)** | MikroTik API manages DHCP leases. The service **must** have a MAC address set. |
| **PPP/DHCP (Radius)** | The router's PPP/DHCP server authenticates via RADIUS (Splynx as the RADIUS server). |
| **PPP (Secrets)** | MikroTik API adds/manages PPP secrets directly; the service's login/password becomes the secret. |
| **Hotspot (Users)** | MikroTik API adds/manages Hotspot users directly. |
| **Hotspot (Radius)** | The router's Hotspot server authenticates via RADIUS. |

Rule of thumb: "(Radius)" variants mean the *router* does RADIUS auth against Splynx; the API-managed variants mean *Splynx* logs into the router via the MikroTik API and pushes config directly.

## Accounting types

| Type | Mechanism | Caveat |
|---|---|---|
| **API accounting** | Splynx logs into the router via MikroTik API every 5 minutes and reads the IP Accounting snapshot table. | **MikroTik removed IP Accounting starting in RouterOS 7.x.** Only works on older firmware — for RouterOS 7+, use RADIUS or NetFlow accounting instead. |
| **Radius accounting** | Splynx receives accounting packets from the router via RADIUS. | Most robust option going forward. |
| **NetFlow accounting** | Splynx collects NetFlow data exported by the router. | Useful for traffic visibility independent of the auth mechanism. |

## RADIUS general configuration

Located at `Config → Networking → Radius`.

- **Reject IP ranges (0-4)** — distinct IP ranges returned on different rejection reasons (user not found, blocked/inactive, negative balance/filter applied, wrong MAC, wrong password). Useful for routing rejected users to different captive-portal pages depending on *why* they were rejected.
- **NAS config** — select a NAS type, click Load. Key MikroTik-type settings:
  - **Prevent duplicate session** — disconnects an existing session if the same customer tries to connect again.
  - **Allow with a negative account balance** — lets you permit connections below a configured minimum balance.
  - **MAC address field / Bind MAC on** — which RADIUS attribute carries the MAC (default `Calling-Station-Id`) and how/when Splynx binds a MAC to a service.
  - **Accounting interval** (recommended 300s, minimum 60s) and **Accounting interval factor** (default 2).
  - **Inverse rate limit / Inverse accounting** — swaps upload/download interpretation; needed when a NAS reports them backwards.
  - **Customer/Plan attributes field** — which additional field on the customer/tariff is used for RADIUS customization.

## RADIUS advanced configuration

- **Radd server** — Splynx runs two RADIUS-related processes: FreeRADIUS (external-facing), proxying to an internal process called `splynx_radd`. The Listen IP/Port must match the `PeerAddr`/`PeerPort` in `/etc/freeradius/splynx/splynx.pl` — these two configs must agree or the proxy breaks silently.
- **Debug/Logs** — `Debug` mode writes to `/var/www/splynx/logs/radius/debug.log` and auto-disables after 60 minutes.
- **Radius extended**:
  - **Check online** — prevents a second simultaneous login with the same credentials.
  - **Bind MAC address on first connect** — auto-populates an empty MAC field from the device that connects first.
  - **Maximum unique MAC addresses** — caps how many MACs a single service can accumulate.
  - **Multiple PSK SSID** — lets one SSID use multiple pre-shared keys mapped to different access policies.
- **Proxy accounting** — Splynx can proxy accounting packets on to a *different* RADIUS server.
- **Periodic RADIUS server restart** — schedulable to prevent memory leaks; Splynx's own docs recommend enabling this. A manual restart causes a brief (~15s) window where unauthenticated customers can't log in.

## MikroTik API integration

Configured per-router under the router's **Mikrotik** tab. Requires a dedicated Splynx-only user on the MikroTik (`System → Users`) with an appropriately scoped permission group.

- **Enable shaper / Shaper / Shaping type** — turns on API-pushed bandwidth shaping; if you enable this, the equivalent RADIUS rate-limiting rules need to be disabled on the router side since the two methods conflict.
- **Wireless access list** — auto-adds a service's MAC to the MikroTik wireless access list when the service has a MAC set.
- **Disabled customers to Address-List** — controls whether blocked customers' credentials are removed from router config or placed into an address-list.
- **Blocking rules** — when enabled, Splynx pushes firewall filter rules that enforce suspension at the router level.
- **Status / backups** — on first successful API connection, Splynx takes a config backup via API + FTP. "Delete all rules from router" is destructive — disable "Enable API" immediately after using it.

## Twig-based RADIUS attribute customization

Splynx renders RADIUS reply attributes through the **Twig** templating engine, so you can compute attribute values from tariff/service/customer data rather than sending static values. Configured in the Rate-Limit attributes / CoA attributes / FUP attributes boxes under `Config → Networking → Radius`.

### Tariff variables (FUP-adjusted where noted)

| Variable | Meaning |
|---|---|
| `{{ rx_rate_limit }}` / `{{ tx_rate_limit }}` | Download/upload speed in bit/s (FUP-adjusted) |
| `{{ rx_burst_rate }}` / `{{ tx_burst_rate }}` | `rate_limit * (100 + tariff.burst_limit) / 100` |
| `{{ rx_burst_threshold }}` / `{{ tx_burst_threshold }}` | `rate_limit * tariff.burst_threshold / 100` |
| `{{ rx_rate_min }}` / `{{ tx_rate_min }}` | `rate_limit * tariff.speed_limit_at / 100` (guaranteed min) |
| `{{ burst_time }}` | Burst duration, seconds |
| `{{ mikrotik_priority }}` | 1/5/8 for high/normal/low priority |
| `{{ tariff.title }}`, `{{ tariff.price }}`, `{{ tariff.id }}` | Plan metadata |
| `{{ tariff.speed_download }}` / `{{ tariff.speed_upload }}` | Raw plan speed in kbit/s — **not** FUP-adjusted; prefer `rx_rate_limit`/`tx_rate_limit`. |

### Service variables

`{{ service.id }}`, `{{ service.customer_id }}`, `{{ service.tariff_id }}`, `{{ service.login }}`, `{{ service.mac }}`, `{{ service.port_id }}`, `{{ service.router_id }}`, `{{ service.sector_id }}`, `{{ service.taking_ipv4 }}` (0=None/1=Permanent/2=Dynamic), `{{ service.ipv4 }}`, `{{ service.ipv4_pool_id }}`, `{{ service.ipv4_route }}`, and IPv6 equivalents.

Note: `{{ service.password }}` is **always an empty string** by design (security) — don't expect to template a plaintext password out of it.

### Customer variables

`{{ customer.id }}`, `{{ customer.billing_type }}` ('prepaid'/'prepaid_monthly'/'recurring'), `{{ customer.partner_id }}`, `{{ customer.location_id }}`, `{{ customer.login }}`/`{{ customer.password }}` (portal credentials, not service ones), `{{ customer.category }}`, `{{ customer.name }}`, `{{ customer.phone }}`, address fields, `{{ customer.date_add }}`.

### FUP variables

`{{ fup_compiled.service_id }}`, `{{ fup_compiled.traffic_accounting }}`, `{{ fup_compiled.time_accounting }}`, `{{ fup_compiled.is_hard }}` (1 if the monthly cap is already exceeded), and (when an FUP rule is actively applied) `{{ rule_name }}` / `{{ rule.percent }}` — empty if no rule applies.

### Custom additional-field arrays

```
{{ customer_attributes.field_name }}
{{ service_attributes.field_name }}
{{ tariff_attributes.field_name }}
{{ card_attributes.field_name }}   (prepaid voucher additional fields)
```

Use the field's **name**, not its display title. This is how you push genuinely custom data into a RADIUS reply without Splynx needing to natively model that concept.

### Twig capabilities available

Since it's real Twig, you get arithmetic, filters, and conditionals:

```
Mikrotik-Rate-Limit = {{ tx_rate_limit / 1000 }}
Mikrotik-Rate-Limit = {{ rx_rate_limit }}/{{ tx_rate_limit }} {{ rx_burst_rate }}/{{ tx_burst_rate }} {{ rx_burst_threshold }}/{{ tx_burst_threshold }} {{ burst_time }}/{{ burst_time }} {{ mikrotik_priority }} {{ rx_rate_min }}/{{ tx_rate_min }}
Mikrotik-Address-List = {{ tariff.title | upper }}
```

Plus all standard Twig filters, and one Splynx-specific addition: `dec2hex(...)`.

**Always guard optional/custom attributes with a conditional** so you don't send empty/garbage values when a field is blank:

```
{% if service_attributes.router_pool is not empty %}
Framed-Pool = {{ service_attributes.router_pool }}
{% endif %}
```

## Worked examples

**Assign IP pool per service via a custom field:**
1. Add an additional field on Internet services, e.g. named `router_pool`.
2. Set its value per-service in the customer's service config.
3. In Rate-Limit attributes:
   ```
   {% if service_attributes.router_pool is not empty %}
   Framed-Pool = {{ service_attributes.router_pool }}
   {% endif %}
   ```

**Address-List driven by the tariff plan:**
1. Add an additional field on Internet *plans* (tariffs) named `wan`.
2. In the Rate-Limit attributes box:
   ```
   Mikrotik-Address-List = {{ tariff_attributes.wan }}
   ```
3. Mirror the same value into **FUP CoA Rate-Limit attributes**, **FUP CoA Restore attributes**, and **CoA Restore attributes** too — otherwise a CoA-triggered reconnect can drop the address-list assignment.

**Custom static IP override:**
1. Add an additional field on internet services, e.g. `ip`.
2. Rate-Limit attributes:
   ```
   {% if service_attributes.ip is not empty %}
   Framed-IP-Address = {{ service_attributes.ip }}
   {% endif %}
   ```
3. Restart RADIUS to apply. **Without the conditional guard, an empty custom field sends `Framed-IP-Address = 0.0.0.0`** — always guard this one specifically.

## Other network protocols

- **TR-069 / ACS (GenieACS add-on)** — for remote CPE provisioning/monitoring over TR-069, independent of RADIUS. Relevant when the question is about CPE firmware/parameter management rather than AAA.
- **Huawei GPON** — separate add-on for provisioning/monitoring Huawei GPON OLT equipment; has its own RADIUS configuration notes since Huawei's NAS dictionary differs from MikroTik's.
- **MikroTik Discover and Export add-on** — bulk-discovers MikroTik devices on the network and imports them into Splynx as routers; useful for bootstrapping a large existing fleet.

---

# Add-ons Catalog

The payment/accounting add-ons are covered in [Payment & Billing](#payment-gateways-accounting--billing-engine). This section covers everything else Splynx ships as an installable add-on. Always check this list — and re-search `wiki.splynx.com/addons_modules` for anything newer — before assuming a custom integration is needed.

## Customers & Support add-ons

- **Mailjet** — transactional/marketing email delivery integration.
- **MailXstream** — print-to-mail outsourcing for physical mailed invoices/notices (US-focused, USPS-oriented).
- **Realms** — groups customers across one or multiple partners by logical area; controls whether a "realm" auto-assigns to an internet service on create/update.
- **Referral System** — incentivized customer-referral program (discounts/credits for referrer and referee).
- **Remote Support** — remote access to network devices and CPE directly from the Splynx interface.
- **Social Registration** — customer self-registration/login via Google, Facebook, or Twitter (OAuth). Each provider needs its own app registered on that provider's developer console; Facebook specifically requires the Splynx site to be HTTPS.
- **Speedtest** — embeds a speed test in the customer portal.
- **Splynx AI** — AI-based quality scoring of support-ticket feedback.
- **Ticket feedback** — automated post-resolution satisfaction surveys.

## Communication & Network add-ons

- **Azure SSO** — admin authentication via Microsoft Entra ID (Azure AD), OAuth2, with 2FA support.
- **3CX** — integrates Splynx with a 3CX phone system; listen to/download recorded calls, comment on calls, link/unlink a call to a ticket.
- **GenieACS** — open-source TR-069 ACS integration for remote CPE provisioning/monitoring; auto-discovers the device's parameter tree including vendor-specific parameters.
- **Huawei GPON** — provisioning/monitoring/troubleshooting for Huawei GPON OLT equipment.
- **Mikrotik Discover and Export** — bulk-discovers MikroTik devices on the network and imports them as Splynx routers.
- **PortaOne** — imports customer call records from a PortaOne softswitch into Splynx (for voice billing).
- **Powerlynx** — affordable Wi-Fi hotspot monetization.
- **Whalebone** — secure DNS resolver integration: content filtering, malware/phishing detection, outbound spam/DoS blocking, IP blacklisting.
- **WhatsApp** — two-way WhatsApp messaging between the ISP and customers.

## QoE (Quality of Experience) service integrations

These all push Splynx tariff/speed/burst data *out* to a dedicated traffic-shaping/QoE platform, as an alternative or complement to Splynx's own MikroTik-API/RADIUS shaping:

- **LibreQoS** — open-source dynamic bandwidth management/prioritization, fed directly from Splynx tariffs.
- **Preseem** — commercial QoE platform; syncs customers, services, and network infrastructure.
- **Bequant (BQN)** — retrieves tariff speed limits, burst rate/threshold/duration from Splynx for BQN's own shaping engine.

## Reporting add-ons

- **FatturaPA** — exports Splynx invoices to the XML format required for Italian electronic invoicing.
- **FCC 477 export** — generates the FCC Form 477-style report required of US broadband providers.

## Additional-features add-ons

- **Adminer** — direct database access/management UI; treat with real caution — it's direct DB access, not a sandboxed feature.
- **Agents / Resellers** — sales-commission structuring; Resellers is a fork of Agents scoped to reseller representatives specifically.
- **Manticore** — full-text search engine indexing the Splynx database for the admin portal's search tool.
- **SSH Term** — an in-browser terminal inside the Splynx web interface.

## Generic SMS gateway integration (build-your-own pattern)

Splynx supports **any SMS platform with an HTTP API** via a generic configurable gateway (`Config → Main → SMS`). Configure:

- **Gateway URL** — the provider's send-SMS endpoint.
- **Method** — GET or POST, whichever the provider's API requires.
- **Content type** — JSON or `x-www-form-urlencoded`.
- **Payload** — the actual request body/query, built per the provider's documented syntax.
- **Custom Header Name/Value** — for providers requiring an API key/token as a header.
- **Successful response** — a string Splynx looks for in the gateway's response to decide the SMS sent successfully; get this wrong and Splynx will mark sent messages as failed.
- **Check balance** (optional) — a separate URL + field name + polling interval.
- **Debug** — logs to `/var/www/splynx/logs/cron/sms.log`.

**Practical approach:** get the provider's exact send-SMS API call (URL, method, required params/headers, and what a success response looks like), then map each piece directly onto the fields above. This is a "translate their API into these six fields" task, not something requiring custom code.

Splynx's logs for sent SMS live in `Administration → Logs → SMS` and `Messages → Mass sending → History`.

*Note:* Powerlynx ships first-class **Twilio** and **SMSPortal** integrations by default — if the user is specifically on Powerlynx, check whether one of those covers their need first.

## Generic email server integration

Email is configured via a standard SMTP server (`Config → Main`), and templates are managed in `Config → System → Templates`. If emails aren't sending, the usual checklist is: SMTP credentials/port/encryption correct, the relevant template exists and is selected for that message type, and (for hook-script-sent mail) whether the local Sendmail relay is configured for external delivery.

---

# Core Modules & Data Model

The "what entities exist and how are they connected" reference — useful before designing any integration's data mapping.

## Customers

The customer record is the hub everything else attaches to. Each customer profile has these tabs (each maps to its own API sub-resource):

- **Information** — core identity fields (name, contact info, billing type, category [Individual/Business], partner, location, portal login/password).
- **Services** — tariff plans actually assigned to this customer (internet, voice, recurring, one-time, bundle); this is where login/password/MAC/IP/router-binding for a specific internet service lives (distinct from the customer's portal login).
- **Billing** — billing config and Finance documents (invoices, payments, credit notes, transactions).
- **Statistics** — usage/session statistics.
- **Documents** — uploaded files/attachments associated with the customer.
- **CPE** — customer-premises-equipment records/management.
- **Lead (Quotes)** — links back to the CRM quote(s) this customer originated from, if converted from a lead.
- **Communication** — email/message history.
- **Linked accounts** — sub-account management.

## Leads / CRM

A **Lead** is a pre-customer prospect. Lead profile tabs: **Information**, **Documents**, **Quotes**, **Communication**. **Quotes** specifically bridge Leads and Customers — a quote can be converted into an invoice once a lead becomes a customer. If an integration needs to model a sales funnel, Leads + Quotes is the correct target, not creating Customer records directly for unconverted prospects.

## Tariff plans

Five plan types, all assigned to customers as **services**:

- **Internet** — speed/bandwidth control, CAP (usage limits) and FUP (Fair Usage Policy — speed reduction rather than hard cutoff after a threshold) rules. This is the plan type that drives most RADIUS/Twig variables.
- **Voice** — for CDR-based voice billing.
- **Recurring** — for non-internet recurring charges (IPTV, static-IP fee, etc.).
- **One-Time** — non-recurring charges (installation fee, equipment charge).
- **Bundle** — groups several of the above into one packaged charge.

Other tariff-adjacent concepts: **Capped plans & Top-Ups**, **Change plan** (with proration rules), **Burst speed concept**, and **Huawei Groups**.

## Tickets

The helpdesk module — assignment, context, and automation for customer support requests. Two main wiki sections: **Tickets Overview** (the ticket lifecycle/workflow itself) and **Tickets Recipients** (who tickets get routed to). Creating/updating tickets programmatically is a standard API target (`admin/tickets/ticket` family of endpoints) — check `api-doc.splynx.com` for the exact ticket-creation schema.

## Customer portal

The self-service front-end customers log into. Relevant integration touchpoints:

- **Entry points** — add-ons that add customer-facing functionality register as entry points, toggled in `Config → Integrations → Modules list` per add-on.
- **Portal field permissions** — for every additional field exposed on the portal, admins set View/Edit/none per field, independently of whether that same field is editable on the admin side. A customer not seeing a field is very often a portal-permission setting, not a missing feature.
- **Authentication options** — login via Email or Login (configurable), password reset via SMS or Email.

## Custom additional fields (the cross-cutting extension mechanism)

The single most important "how do I add something Splynx doesn't have by default" tool, threading through the API, RADIUS/Twig, and the portal alike. Configured in `Config → System → Additional fields`, scoped per module (Customers, Services, Tariff plans, Invoices, Payments, Credit notes, Tickets, Leads, and more).

Key configuration knobs:

| Setting | Effect |
|---|---|
| **Customer category** | (Customers module only) restricts the field to Individual, Business, or All — a field scoped away from a record's category won't appear for it, in UI or API. |
| **Field name** | The DB-facing identifier — this is what you reference in API search (`additional_attributes`), in Twig, and anywhere programmatic. |
| **Field title** | The human-facing label shown in the UI. **Never** use this where "name" is expected — this is the single most common integration bug. |
| **Type** | Data type/format for the value. |
| **Default value** | Pre-fill / prefix value. |
| **Min/Max** | Length constraints. |
| **Required / Unique** | Validation rules. |
| **Show in list** | Surfaces it as a column automatically. |
| **Add** | Whether it's presented when creating a new record. |
| **Searchable** | Whether it can be searched/filtered on. |
| **Readonly / Disabled / Hidden** | Presentation/edit restrictions. |
| **Set default value for all items** | Backfills existing records with the default (vs. only applying to new ones). |

Once created, a field surfaces in three places: the relevant module's form/table in the admin UI, the API's `additional_attributes` (read/write/search), and — for Customer/Service/Tariff/prepaid-Card fields — the Twig variable arrays used in RADIUS customization.

## How it all connects (typical flow)

1. A prospect submits a form on the ISP's website → (API integration) creates a **Lead**.
2. Sales works the lead, generates a **Quote**.
3. Lead converts to a **Customer**; the quote becomes the basis for the customer's first **Service** (tariff plan assignment).
4. The service's login/MAC/router binding drives **RADIUS/MikroTik** authentication once the customer's equipment connects.
5. Recurring billing generates **Invoices** on schedule; payment creates a **Payment transaction**, which can trigger a **Webhook** or **Hook** for downstream notification.
6. Any support need becomes a **Ticket**, possibly auto-created via API/hook from an external monitoring or chatbot system.
7. **Custom additional fields** are sprinkled across steps 1–6 wherever the ISP's business process needs a field Splynx doesn't model by default.

---

# Payment Gateways, Accounting & Billing Engine

Splynx's billing is transaction-ledger based: nothing moves money or balances without leaving a Transaction record. Understanding that model first makes every payment-integration question easier to answer correctly.

## Billing engine fundamentals

Each customer is assigned a **billing type**: `recurring`, `prepaid`, or `prepaid_monthly` (set in the customer's Information tab). This choice determines which billing engine processes that customer — don't assume "prepaid" always behaves like a balance-only system; `prepaid_monthly` is its own variant with different timing semantics.

- **Recurring billing**: customer is invoiced on a schedule (a configurable **Billing day**, default 1st of month) and has until a **Payment due** date (days after billing day, default 15) before being blocked for non-payment.
- **Prepaid billing**: the customer pays in advance; when balance hits a configured limit, they're disconnected. Natural fit for voucher-based/hotspot-style ISPs.
- **Minimum balance requirement** can be zero, positive, or **negative** — a negative value explicitly allows the customer to run a balance down to that negative number before blocking. This is a deliberate "grace credit" feature, not a bug.

## Invoices, proforma invoices, transactions, credit notes

- **Invoice** (one-time or recurring) — a tax-relevant billing document; creating one generates a **Debit** transaction.
- **Proforma invoice** — a non-tax request-for-payment. Creating one does **not** change the customer's balance. Must be enabled in `Config → Integrations → Main modules` before usable.
- **Payment** — when money arrives (any method), Splynx creates a **Credit** transaction and pairs it to the oldest unpaid invoice automatically if none is explicitly linked. Overpayment beyond a linked invoice's due amount rolls into the customer's balance.
- **Credit note** — the correction mechanism; also produces a transaction, and can partially or fully offset an invoice.
- **Refunds** are modeled as a **negative payment** for the amount to return; in `Finance → Payments` these show with `Refund = Yes`.
- **Transactions** are the actual ledger — every debit/credit traces back to one. When troubleshooting "why is this customer's balance X," start from the transaction list, not the invoice list.
- **Mass/bulk payments** (Splynx v5.0+) let you record many customers' payments in one action.

## Payment methods & Cashdesk

- **Payment methods** (`Config → Finance → Payment methods`) are the labels payments get tagged with; installing a payment-gateway add-on auto-registers its corresponding method.
- **Cashdesk** is a restricted-access module for processing payments without full Splynx access — designed for accountants or resellers who should only see customer name, invoice numbers, and balance. If a user wants "a way for my front-desk staff to take payments without seeing customer details," Cashdesk is almost always the right answer.
- **Manual payments** can always be entered directly against a customer (`Billing → Finance documents → Add document → Payment`) or via mass-add for multiple customers at once.

## Bank file processing

For ISPs receiving bank-transfer payments in bulk files: Splynx can import a bank's payment-export file, match transactions to invoices, mark them paid, create the payment transaction, and zero the customer's balance. Because every bank's file format differs, **this is virtually always a custom handler** (a PHP script processing that specific bank's format). If a user asks "can Splynx read my bank's payment file automatically," the honest answer is: yes in principle, but it needs a bank-specific parser written for their exact format — there isn't a universal one.

## Payment gateway add-on catalog

Check this list before building a custom payment integration:

- **Stripe** — full customer/invoice/payment sync; supports BECS Direct Debit (AU), Pre-authorized Debit (CA), and ACH Direct Debit (US); uses an "Init webhook" button to auto-register its Stripe webhook and surface the signing secret.
- **PayPal** — standard PayPal payment processing for invoices.
- **Authorize.net** — customer/invoice/payment sync.
- **Braintree** — credit card recharging specifically.
- **Moneris** — invoice & proforma invoice payments; supports direct payment links (shareable URL that pays an invoice without portal login).
- **Worldpay (via the Payrix add-on)** — cards and bank accounts, direct debit support, plus an Australia-specific **BPay** mode (biller code + per-invoice or per-customer CRN generation).
- **Payment Express (PxPay)** — card-on-file via a $1 authorize-then-refund verification flow.
- **PayFast** — South African gateway; only operates on ports 80/8080/8081/443. A separate `-rb` variant (PayFast RB) adds direct-debit-style recurring billing.
- **1Voucher** — South African prepaid-voucher payment method.
- **Remita** — Nigerian payment platform integration.
- **PayEx** — card-on-file payment processing.
- **Paymentus** — billing/payment automation platform integration.
- **SEPA debit orders / SEPA CBI** — European direct-debit; generates SEPA-format files for bank submission; CBI is a specific Italian banking-association SEPA variant.
- **GoCardless** (via SEPA tooling) — IBAN-based direct debit charging.

## Accounting software add-on catalog

These sync customers/invoices/credit-notes/payments **out of** Splynx into accounting platforms (one-directional in most cases):

- **Xero**, **QuickBooks**, **Zoho Books**, **SageOne**, **NetSuite**, **Holded**, **Ofipro** (Spanish-market), **AADE myData** (Greece — government-mandated e-invoicing sync).

**Important shared constraint:** most accounting add-ons explicitly support syncing **only one partner** — if the user runs a multi-partner Splynx setup, that's generally unsupported by design, not a configuration gap to debug.

## The generic "build your own gateway" pattern

When no add-on exists for a gateway:

1. **Use the REST API** to read/write invoices, payments, and customer billing config from your own integration service — an external service that watches for due invoices via the API and calls the gateway, then writes payments back via the API, is a perfectly valid architecture.
2. **Use a Webhook** if you want Splynx to push "invoice created/overdue" events to your integration service rather than having it poll.
3. Record the resulting payment via the API as a `Payment` against the right invoice, tagged with an appropriate **payment method**.
4. If recurring/stored-card charging is the goal, store a tokenized credential reference (never raw card data) against the customer, and trigger charges either on your own schedule or by hooking Splynx's invoice-creation event.

## Common questions

- **"Can Splynx charge a saved card automatically when an invoice is due?"** Yes, but only through a gateway that supports stored/tokenized charging and either has an official add-on or a custom integration built per the pattern above.
- **"Why does the customer's balance differ from what the invoice says they owe?"** Balance is the net of *all* transactions; check the Transactions tab, not just the single invoice.
- **"Can I sync two partners to one Xero org?"** Generally no — see the accounting add-on constraint above.
- **"The bank gives us a CSV/fixed-width file of payments daily — can Splynx just import it?"** Conceptually yes via Bank processing, but expect to write a format-specific PHP handler; there's no universal bank-file importer.
