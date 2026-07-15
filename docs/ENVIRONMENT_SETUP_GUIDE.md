# Environment Setup Guide

**Version:** 1.0  
**Last Updated:** July 2025  
**Audience:** DevOps, Backend Engineers, Platform Team

---

## 🎯 Overview

This guide covers setting up the CSAT platform across different environments:
- **Local Development** - Developer machine
- **Staging** - Pre-production testing
- **Production** - Live customer-facing environment

---

## 📦 Prerequisites

### System Requirements
- **Node.js:** 20.x LTS (install via [nvm](https://github.com/nvm-sh/nvm))
- **npm:** 10.x (comes with Node.js 20)
- **Git:** 2.40+
- **Firebase CLI:** `npm i -g firebase-tools`
- **PM2:** `npm i -g pm2` (production only)
- **Docker:** 24.x+ (optional, for containerization)

### Access Requirements
- [ ] Firebase Project access (Owner/Editor)
- [ ] Splynx Admin access (Config → Integrations → Hooks)
- [ ] Cloudflare account (DNS, SSL, WAF)
- [ ] Server SSH access (production/staging)
- [ ] GitHub repo access (with Deploy Keys configured)

---

## 🖥️ Local Development Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-org/csat-platform.git
cd csat-platform
```

### 2. Install Dependencies
```bash
npm ci
```

### 3. Configure Environment
```bash
# Copy template
cp .env.example .env.local

# Edit with your values
# Required for local dev:
# - NEXT_PUBLIC_FIREBASE_* (get from Firebase Console)
# - SPLYNX_WEBHOOK_SECRET (generate: openssl rand -hex 32)
# - FEEDBACK_BASE_URL=http://localhost:9002
```

### 4. Start Development Server
```bash
npm run dev
# Server runs at http://localhost:9002
```

### 5. Verify Setup
```bash
# Health check
curl http://localhost:9002/api/health

# Run tests
npm run test:run

# Type check
npm run typecheck
```

### 6. Local Webhook Testing (ngrok)
```bash
# Install ngrok
# https://ngrok.com/download

# Expose local port
ngrok http 9002

# Use ngrok HTTPS URL in Splynx webhook config
# https://abc123.ngrok.io/api/splynx-webhook
```

---

## 🚀 Staging Environment Setup

### Server Requirements
- **OS:** Ubuntu 22.04 LTS or Debian 12
- **CPU:** 2 vCPU minimum
- **RAM:** 4 GB minimum
- **Disk:** 20 GB SSD minimum
- **Network:** Public IP with ports 80, 443, 22

### 1. Server Initial Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v  # v20.x.x
npm -v   # 10.x.x

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Configure firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Application Directory
```bash
# Create app directory
sudo mkdir -p /home/csat.iwn.ng/csat
sudo chown -R $USER:$USER /home/csat.iwn.ng/csat
cd /home/csat.iwn.ng/csat
```

### 3. Deploy Application
```bash
# Clone repo
git clone https://github.com/your-org/csat-platform.git .

# Install dependencies
npm ci --production

# Build application
npm run build

# Create production env
cp .env.production .env
# Edit .env with production values (see below)
```

### 4. Configure Production Environment
```bash
# Edit production environment
nano .env

# REQUIRED VALUES (get from respective consoles):
# - NEXT_PUBLIC_FIREBASE_API_KEY
# - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
# - NEXT_PUBLIC_FIREBASE_PROJECT_ID
# - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
# - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
# - NEXT_PUBLIC_FIREBASE_APP_ID
# - FIREBASE_SERVICE_ACCOUNT_JSON (single-line JSON from Firebase Console)
# - SPLYNX_WEBHOOK_SECRET (openssl rand -hex 32)
# - SPLYNX_API_HOST=https://splynx.iworldnetworks.net
# - SPLYNX_API_KEY (from Splynx Admin)
# - SPLYNX_API_SECRET (from Splynx Admin)
# - SPLYNX_SMTP_PASS (from Splynx email config)
# - FEEDBACK_BASE_URL=https://csat.iwn.ng
# - SENTRY_DSN (optional)
```

### 5. Configure Nginx Reverse Proxy
```bash
# Copy config (see nginx/csat.iwn.ng.conf)
sudo cp nginx/csat.iwn.ng.conf /etc/nginx/sites-available/csat.iwn.ng
sudo ln -sf /etc/nginx/sites-available/csat.iwn.ng /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

### 6. SSL Certificate (Let's Encrypt)
```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d csat.iwn.ng

# Test auto-renewal
sudo certbot renew --dry-run
```

### 7. Start Application with PM2
```bash
# Start app
pm2 start ecosystem.config.js --env production

# Save PM2 config
pm2 save
pm2 startup

# Verify
pm2 status
pm2 logs csat
```

### 8. Verify Staging Deployment
```bash
# Health check
curl -I https://csat.iwn.ng

# Test webhook endpoint
curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"ping"}'

# Test feedback form
open https://csat.iwn.ng/feedback?token=test
```

---

## 🏭 Production Environment Setup

### Differences from Staging
| Aspect | Staging | Production |
|--------|---------|------------|
| **Domain** | staging.csat.iwn.ng | csat.iwn.ng |
| **Resources** | 2 vCPU / 4GB | 4+ vCPU / 8GB+ |
| **Replicas** | 1 PM2 instance | 2+ PM2 instances (cluster mode) |
| **Monitoring** | Basic | Full (Sentry, Prometheus, Grafana) |
| **Backups** | Daily | Hourly + Daily |
| **WAF** | Basic | Full Cloudflare Pro/Business |

### Production-Specific Configuration

#### PM2 Cluster Mode
```javascript
// ecosystem.config.js - production section
module.exports = {
  apps: [{
    name: 'csat',
    script: 'server.js',
    instances: 'max',  // Use all CPU cores
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

#### Cloudflare Configuration
```bash
# DNS Records (Cloudflare Dashboard)
# Type    Name    Content              Proxy
# A       @       <SERVER_IP>          Proxied
# A       www     <SERVER_IP>          Proxied
# TXT     _dmarc  v=DMARC1; p=reject   DNS Only

# SSL/TLS Settings
# SSL/TLS Mode: Full (Strict)
# Edge Certificates: Always Use HTTPS = On
# HSTS: Enabled, max-age=63072000, includeSubDomains, preload
# Minimum TLS Version: 1.2

# WAF Rules (Cloudflare Pro+)
# 1. Rate limit /api/splynx-webhook: 100 req/min per IP
# 2. Block known bad bots
# 3. Challenge suspicious traffic
```

#### Monitoring & Alerting
```bash
# Sentry (already configured in next.config.ts)
# Set SENTRY_DSN in production env

# Prometheus metrics endpoint (if using)
# Add to next.config.ts:
# experimental: { instrumentationHook: true }

# Uptime monitoring
# - UptimeRobot / Better Stack / Pingdom
# - Check: https://csat.iwn.ng/health
# - Alert: Slack + Email + SMS
```

---

## 🔐 Secret Management

### Local Development
```bash
# Use .env.local (gitignored)
cp .env.example .env.local
# Fill in values
```

### Staging/Production
**Option 1: Server Environment File (Simple)**
```bash
# On server
nano /home/csat.iwn.ng/csat/.env
# File permissions: 600
chmod 600 /home/csat.iwn.ng/csat/.env
```

**Option 2: Secret Manager (Recommended for Production)**
```bash
# AWS Secrets Manager
aws secretsmanager create-secret --name csat/production \
  --secret-string file://.env.production

# In app, use AWS SDK to fetch at startup
```

**Option 3: PM2 Environment Variables**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'csat',
    script: 'server.js',
    env_production: {
      NODE_ENV: 'production',
      // Secrets injected via CI/CD at deploy time
    }
  }]
};
```

### Generating Secrets
```bash
# Webhook secret (32 bytes = 64 hex chars)
openssl rand -hex 32

# API keys (if needed)
openssl rand -base64 32

# JWT secrets (if implementing)
openssl rand -hex 64
```

---

## 🔍 Verification Checklist

### Pre-Deployment
- [ ] All tests pass (`npm run test:run`)
- [ ] Type check passes (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Environment variables configured
- [ ] Secrets rotated and stored securely
- [ ] SSL certificate valid
- [ ] DNS records correct
- [ ] Cloudflare proxy enabled
- [ ] WAF rules active

### Post-Deployment
- [ ] Health endpoint returns 200
- [ ] Webhook endpoint accepts valid signatures
- [ ] Feedback form submits successfully
- [ ] Admin dashboard accessible (auth works)
- [ ] Email sending works (test with real address)
- [ ] Sentry capturing errors
- [ ] Logs streaming to monitoring
- [ ] Backup job scheduled
- [ ] Monitoring alerts configured

### Ongoing (Weekly/Monthly)
- [ ] Dependency updates (`npm audit fix`)
- [ ] SSL certificate renewal check
- [ ] Backup restoration test
- [ ] Secret rotation (90 days)
- [ ] Security scan (npm audit, Snyk)
- [ ] Performance review (Core Web Vitals)
- [ ] Log analysis for anomalies

---

## 🛠️ Troubleshooting

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `npm ci` fails | Lockfile mismatch | `rm package-lock.json && npm install` |
| Build fails | TypeScript errors | `npm run typecheck` to see details |
| PM2 won't start | Port in use | `pm2 kill && pm2 start` |
| Nginx 502 | App not running | `pm2 status` → `pm2 logs` |
| SSL errors | Cert expired | `sudo certbot renew` |
| Webhook 401 | Secret mismatch | Verify secret in Splynx & server |
| Firebase auth fails | Domain not authorized | Add domain in Firebase Console |
| Email not sending | SMTP creds wrong | Verify in Splynx Admin |

### Log Locations
```bash
# Application logs
pm2 logs csat

# Nginx logs
/var/log/nginx/access.log
/var/log/nginx/error.log

# System logs
journalctl -u nginx
journalctl -u pm2-root

# Firebase
Firebase Console > Functions > Logs
```

---

## 📚 Additional Resources

- [Next.js Deployment Docs](https://nextjs.org/docs/deployment)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Nginx Reverse Proxy Guide](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Let's Encrypt Docs](https://letsencrypt.org/docs/)
- [Cloudflare WAF Rules](https://developers.cloudflare.com/waf/)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Splynx API Docs](https://api-doc.splynx.com/)

---

*Document maintained by: Platform Team*  
*Review cycle: Per deployment or monthly*