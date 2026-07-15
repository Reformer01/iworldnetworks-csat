# Production Deployment Guide — I-World CSAT Platform

**Stack:** CyberPanel + Nginx + Cloudflare + GitHub Actions + Splynx
**Last updated:** July 2026

---

## Architecture

```
GitHub (push) → GitHub Actions (build + deploy) → CyberPanel Server
                                                          ↓ SSH + SCP
                                              Nginx (reverse proxy :443)
                                                          ↓
                                                  Node.js (Next.js :3000)
                                                          ↓
                                  Firebase (Firestore + Auth) ←→ Splynx
```

**Domains:**
| Domain | Purpose |
|---|---|
| `csat.iwn.ng` | Admin dashboard + public feedback form |

---

## Prerequisites

| Item | Requirement |
|---|---|
| Server | CyberPanel installed, Nginx, Node.js 20+ |
| DNS | Cloudflare account with domain added |
| GitHub | Repo with the codebase |
| Splynx | Admin access for webhooks + SMTP |
| Firebase | Project with Firestore + Auth enabled |
| SSH key | For GitHub Actions to deploy to server |

---

## Part 1 — First-Time Server Setup (run once)

### 1.1 Install Nginx + Node.js

```bash
# SSH into the server
ssh root@<server-ip>

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify
node -v   # v20.x.x
npm -v    # 10.x.x

# Install PM2 (process manager)
npm install -g pm2

# Install Nginx
apt-get install -y nginx

# Start Nginx
systemctl enable nginx
systemctl start nginx
```

### 1.2 Create the App Directory

```bash
mkdir -p /home/csat.iwn.ng/csat
cd /home/csat.iwn.ng/csat

# Create .env.production (fill in your values)
nano .env.production
```

Paste and fill in:

```env
# Firebase — Client SDK (public)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAouGhDaCJOSqoIX8iea1c7q9o0zpr_pv0
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=i-world-networks-csat.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=i-world-networks-csat
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=i-world-networks-csat.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=476440591594
NEXT_PUBLIC_FIREBASE_APP_ID=1:476440591594:web:6a22e26b6eb2cefb2b2b93

# Firebase — Admin SDK (server-only)
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"i-world-networks-csat",...}'

# Splynx
SPLYNX_WEBHOOK_SECRET=<generate-a-strong-random-secret>
SPLYNX_API_HOST=https://splynx.iworldnetworks.net
SPLYNX_API_KEY=<your-splynx-api-key>
SPLYNX_API_SECRET=<your-splynx-api-secret>
SPLYNX_API_AUTH=basic

# Splynx SMTP
SPLYNX_SMTP_HOST=mail.iworldnetworks.net
SPLYNX_SMTP_PORT=465
SPLYNX_SMTP_USER=no_reply@mail.iworldnetworks.net
SPLYNX_SMTP_PASS=<your-smtp-password>
SPLYNX_FROM_EMAIL=no_reply@mail.iworldnetworks.net
SPLYNX_FROM_NAME=I-World Networks Limited

# Public URL (CRITICAL)
FEEDBACK_BASE_URL=https://csat.iwn.ng
```

### 1.3 Create the Deployment Script

```bash
cat > /home/deploy-csat.sh << 'SCRIPT'
#!/bin/bash
set -e

APP_DIR="/home/csat.iwn.ng/csat"
echo "=== Deploying CSAT Platform ==="

cd $APP_DIR

# Install dependencies
npm ci --production

# Build
npm run build

# Restart the app
pm2 restart csat || pm2 start server.js --name csat -- --port 3000

# Save PM2 config
pm2 save

echo "=== Deployment complete ==="
SCRIPT

chmod +x /home/deploy-csat.sh
```

### 1.4 Configure Nginx Reverse Proxy

```bash
cat > /etc/nginx/sites-available/csat.iwn.ng << 'NGINX'
server {
    listen 80;
    server_name csat.iwn.ng;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name csat.iwn.ng;

    # SSL will be handled by Cloudflare (Full Strict mode)
    # But we still need a self-signed cert for the origin
    ssl_certificate /etc/nginx/ssl/csat.iwn.ng.crt;
    ssl_certificate_key /etc/nginx/ssl/csat.iwn.ng.key;

    # Proxy to Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Security headers (Cloudflare adds more)
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
NGINX

# Create self-signed SSL cert (Cloudflare handles real SSL)
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/csat.iwn.ng.key \
  -out /etc/nginx/ssl/csat.iwn.ng.crt \
  -subj "/CN=csat.iwn.ng"

# Enable the site
ln -sf /etc/nginx/sites-available/csat.iwn.ng /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload
nginx -t
systemctl reload nginx
```

### 1.5 Set Up SSH Key for GitHub Actions

```bash
# Generate a deploy key (on the server)
ssh-keygen -t ed25519 -C "github-deploy" -f /root/.ssh/github_deploy -N ""

# Show the public key — you'll add this to GitHub
cat /root/.ssh/github_deploy.pub
```

**Then on GitHub:**
1. Go to your repo → **Settings** → **Deploy keys**
2. Click **Add deploy key**
3. Title: `CyberPanel Server`
4. Paste the public key
5. Check **Allow write access** (needed for deploy)
6. Click **Add key**

**On the server**, add the key to SSH config:

```bash
cat >> /root/.ssh/config << 'EOF'
Host github.com
    IdentityFile /root/.ssh/github_deploy
    StrictHostKeyChecking no
EOF

chmod 600 /root/.ssh/config
```

### 1.6 Set Up PM2 Auto-Start

```bash
# Start the app for the first time
cd /home/csat.iwn.ng/csat
pm2 start server.js --name csat -- --port 3000
pm2 save
pm2 startup
# Run the command PM2 outputs
```

### 1.7 Initial Deploy

```bash
# Clone the repo for the first time
cd /home/csat.iwn.ng/csat
git clone <your-github-repo-url> .
/home/deploy-csat.sh
```

---

## Part 2 — GitHub Actions (Auto-Deploy on Push)

### 2.1 Add Repository Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**:

| Secret Name | Value |
|---|---|
| `DEPLOY_HOST` | `<server-ip>` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_KEY` | Private key from `/root/.ssh/github_deploy` |

### 2.2 Create the Workflow

The workflow file is already in the repo at `.github/workflows/deploy.yml`.

### 2.3 How It Works

```
git push to main
    ↓
GitHub Actions triggers
    ↓
1. Build the Next.js app
2. SSH into server
3. Pull latest code
4. Install dependencies
5. Build on server
6. Restart PM2
    ↓
App is live
```

---

## Part 3 — Cloudflare Configuration

### 3.1 Add Your Domain

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **Add a Site**
3. Enter `iworldnetworks.net`
4. Select your plan

### 3.2 Update Nameservers

Cloudflare will give you two nameservers. Update them at your domain registrar.

### 3.3 Create DNS Records

Go to **DNS** → **Records**:

| Type | Name | Content | Proxy | Notes |
|---|---|---|---|---|
| A | `portal` | `<server-ip>` | Proxied (orange cloud) | Main app |
| A | `splynx` | `<server-ip>` | DNS only | Splynx (if self-hosted) |

### 3.4 SSL/TLS Configuration

1. Go to **SSL/TLS** → **Overview**
2. Set to **Full (Strict)**
3. Go to **SSL/TLS** → **Edge Certificates**
   - Enable **Always Use HTTPS**
   - Enable **Automatic HTTPS Rewrites**
   - Enable **HSTS**

### 3.5 Firewall Rules (Optional)

Go to **Security** → **WAF** — block non-Splynx webhook calls:

| Rule | Expression | Action |
|---|---|---|
| Protect webhook | `(http.request.uri.path eq "/api/splynx-webhook" and ip.src ne <splynx-ip>)` | Block |

### 3.6 Cache Rules

Go to **Caching** → **Configuration**:

For static assets, add a rule:
```
(http.request.uri.path matches "^/_next/static/.*")
→ Cache Everything, Edge TTL: 1 month, Browser TTL: 1 year
```

---

## Part 4 — Splynx Configuration

### 4.1 Configure Webhook

1. Splynx admin → **Config** → **Integrations** → **Hooks**
2. Add Hook:
   - **URL:** `https://csat.iwn.ng/api/splynx-webhook`
   - **Secret:** Same as `SPLYNX_WEBHOOK_SECRET` in `.env.production`
   - **Events:** `invoice/create`, `tickets/ticket/update`, `customer/update`, `customer/create`
   - **Status:** Enabled

### 4.2 Configure SMTP

1. Splynx admin → **Config** → **Main** → **Email**
2. Note SMTP settings, set same in `.env.production`

### 4.3 Configure API Access (optional)

1. Splynx admin → **Config** → **Integrations** → **API**
2. Enable REST API, create API key
3. Set `SPLYNX_API_KEY` and `SPLYNX_API_SECRET` in `.env.production`

### 4.4 Test the Webhook

```bash
# On the server
SECRET="your-webhook-secret"
PAYLOAD='{"type":"event","data":{"customer_id":"12345","attributes":{"name":"Test Customer","email":"test@example.com","tariff_name":"H-Lite","location":"Ibadan"}}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha1 -hmac "$SECRET" | awk '{print $2}')

curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -H "x-splynx-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

Expected: `{"success":true,"token":"...","url":"https://csat.iwn.ng/feedback?token=..."}`

---

## Part 5 — Firebase Configuration

### 5.1 Deploy Firestore Rules

```bash
# On your local machine
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 5.2 Authorized Domains

1. Firebase Console → **Authentication** → **Settings** → **Authorized Domains**
2. Add `csat.iwn.ng`

---

## Part 6 — Monitoring & Maintenance

### 6.1 PM2 Commands

```bash
pm2 status          # Check app status
pm2 logs csat       # View logs
pm2 restart csat    # Restart app
pm2 monit           # Real-time monitoring
```

### 6.2 Log Rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 6.3 Automated Backups

```bash
cat > /home/backup-csat.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/csat"
mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/csat-$DATE.tar.gz /home/csat.iwn.ng/csat/
cp /home/csat.iwn.ng/csat/.env.production $BACKUP_DIR/env-$DATE
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "env-*" -mtime +7 -delete
EOF

chmod +x /home/backup-csat.sh
crontab -e
# Add: 0 2 * * * /home/backup-csat.sh
```

### 6.4 SSL Certificate

- **Cloudflare** handles SSL for visitors (edge certificate)
- **Origin** uses self-signed cert (created in Part 1.3)
- Cloudflare connects to origin via HTTPS, validates with Full (Strict) mode

---

## Pre-Deployment Checklist

```
[ ] Server: Nginx installed, reverse proxy configured → localhost:3000
[ ] Server: PM2 running the app, auto-restart enabled
[ ] Server: .env.production has all required variables
[ ] Server: FEEDBACK_BASE_URL = https://csat.iwn.ng
[ ] Server: SPLYNX_WEBHOOK_SECRET is a strong random string
[ ] GitHub: Repository secrets set (DEPLOY_HOST, DEPLOY_USER, DEPLOY_KEY)
[ ] GitHub: Deploy workflow exists at .github/workflows/deploy.yml
[ ] Cloudflare: DNS A record for portal → server IP (proxied)
[ ] Cloudflare: SSL mode is Full (Strict)
[ ] Cloudflare: Always Use HTTPS enabled
[ ] Splynx: Webhook URL = https://csat.iwn.ng/api/splynx-webhook
[ ] Splynx: SMTP credentials match .env.production
[ ] Firebase: Authorized domains include csat.iwn.ng
[ ] Firebase: Service account key is secure (not in git)
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `502 Bad Gateway` | Node.js not running | `pm2 status` → `pm2 restart csat` |
| `502 Bad Gateway` | Nginx not proxying | `nginx -t` → fix config → `systemctl reload nginx` |
| `ECONNREFUSED :3000` | App crashed | `pm2 logs csat` → fix error → `pm2 restart csat` |
| Webhook 401 | Wrong secret | Verify `SPLYNX_WEBHOOK_SECRET` matches Splynx + server |
| Emails not sending | SMTP password empty | Set `SPLYNX_SMTP_PASS` in `.env.production` |
| Feedback link broken | FEEDBACK_BASE_URL wrong | Set to `https://csat.iwn.ng` |
| Auth fails | Domain not authorized | Firebase Console → Authentication → Authorized Domains |
| Cloudflare SSL error | Mixed content | Enable Always HTTPS + Automatic HTTPS Rewrites |
| Deploy fails | SSH key not configured | Check GitHub secrets, verify SSH key on server |
| PM2 stops after reboot | No startup config | `pm2 save` + `pm2 startup` |

---

## Quick Commands

```bash
# SSH into server
ssh root@<server-ip>

# Check everything
pm2 status
systemctl status nginx
curl -I http://localhost:3000

# Manual deploy (if GitHub Actions fails)
/home/deploy-csat.sh

# Edit environment
nano /home/csat.iwn.ng/csat/.env.production
/home/deploy-csat.sh

# View logs
pm2 logs csat --lines 100
journalctl -u nginx --lines 50

# Restart everything
pm2 restart csat
systemctl reload nginx
```
