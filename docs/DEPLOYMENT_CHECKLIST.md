# Production Deployment Checklist

**Version:** 1.0  
**Last Updated:** July 2025  
**Usage:** Complete ALL items before promoting to production

---

## 📋 Pre-Deployment Checklist

### Code Quality Gates (Automated in CI/CD)
- [ ] **All tests pass** (`npm run test:run` → 142/142)
- [ ] **Type check passes** (`npm run typecheck` → 0 errors)
- [ ] **Lint passes** (`npm run lint` → 0 errors)
- [ ] **Build succeeds** (`npm run build` → standalone output)
- [ ] **Security audit** (`npm audit --audit-level high` → 0 critical/high)

### Environment Configuration
- [ ] `.env.production` created with all required variables
- [ ] No `.env` files committed to git (verify `git status`)
- [ ] `SPLYNX_WEBHOOK_SECRET` generated and set in both Splynx and server
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON` set as single-line JSON
- [ ] `FEEDBACK_BASE_URL=https://csat.iwn.ng` (production domain)
- [ ] `SPLYNX_API_HOST/KEY/SECRET` configured for customer enrichment
- [ ] `SPLYNX_SMTP_PASS` set for email delivery
- [ ] `SENTRY_DSN` set for error monitoring (optional)

### Security Verification
- [ ] `SPLYNX_WEBHOOK_SECRET` rotated (not default/test value)
- [ ] Webhook signature verification uses SHA-256 (with SHA-1 fallback)
- [ ] `.env` files in `.gitignore` (verified: `git check-ignore .env`)
- [ ] No hardcoded secrets in codebase (`grep -r "secret\|password\|key" --include="*.ts" --include="*.js` src/`)
- [ ] CSP headers configured in `next.config.ts`
- [ ] HSTS enabled with preload
- [ ] Rate limiting on all public endpoints
- [ ] Admin routes protected by Firebase Auth + domain check

### Infrastructure Prerequisites
- [ ] Server provisioned (Ubuntu 22.04+, 4GB+ RAM, 20GB+ SSD)
- [ ] Nginx installed and configured as reverse proxy
- [ ] PM2 installed globally (`npm i -g pm2`)
- [ ] SSL certificate obtained (Let's Encrypt or Cloudflare)
- [ ] Cloudflare DNS configured (A record → server IP, proxied)
- [ ] Cloudflare SSL mode: Full (Strict)
- [ ] Cloudflare WAF rules active
- [ ] Firewall rules: 22 (SSH), 80, 443 only

---

## 🚀 Deployment Steps

### 1. Code Deployment
```bash
# On production server
cd /home/csat.iwn.ng/csat

# Pull latest code
git pull origin main

# Install production dependencies
npm ci --production

# Build application
npm run build

# Verify build output exists
ls -la .next/standalone/
```

### 2. Environment Configuration
```bash
# Verify environment file exists
ls -la .env

# Check permissions (should be 600)
stat -c "%a %n" .env

# Validate required variables
grep -E "^(NEXT_PUBLIC_FIREBASE|SPLYNX_|FEEDBACK_BASE_URL|FIREBASE_SERVICE_ACCOUNT)" .env | wc -l
# Should output 15+ lines
```

### 3. Application Restart
```bash
# Restart with PM2
pm2 restart csat --update-env

# Or first-time start
pm2 start ecosystem.config.js --env production

# Save PM2 config
pm2 save

# Verify
pm2 status
pm2 logs csat --lines 50
```

### 4. Nginx Reload
```bash
# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx

# Verify
sudo systemctl status nginx
```

---

## ✅ Post-Deployment Verification

### Health Checks (Run Immediately)
```bash
# 1. Application health
curl -s -o /dev/null -w "%{http_code}" https://csat.iwn.ng/api/health
# Expected: 200

# 2. Main page loads
curl -s -o /dev/null -w "%{http_code}" https://csat.iwn.ng/
# Expected: 200

# 3. Admin dashboard (should redirect to login)
curl -s -o /dev/null -w "%{http_code}" https://csat.iwn.ng/admin
# Expected: 302 (redirect to /admin/login)

# 4. SSL certificate
curl -sI https://csat.iwn.ng/ | grep -i "strict-transport-security"
# Should show: Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### Webhook Verification
```bash
# 1. Ping endpoint
curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"ping"}'
# Expected: {"status":"ok"}

# 2. Valid signature (SHA-256)
SECRET="your-production-secret"
PAYLOAD='{"type":"event","call":"customer/update","data":{"customer_id":123,"attributes":{"name":"Test","email":"test@example.com"}}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -H "x-splynx-signature: $SIGNATURE" \
  -d "$PAYLOAD"
# Expected: {"success":true,"token":"...","url":"..."}

# 3. Invalid signature rejected
curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -H "x-splynx-signature: invalid" \
  -d '{"type":"event"}'
# Expected: 401 {"error":"Invalid signature"}
```

### Feedback Form Verification
```bash
# 1. Get token from webhook response above
# 2. Test feedback form loads
curl -s "https://csat.iwn.ng/feedback?token=TOKEN_FROM_ABOVE" | grep -q "How was your experience"
# Expected: exits 0 (found)

# 2. Test popup embed
curl -s "https://csat.iwn.ng/feedback/popup?token=TOKEN_FROM_ABOVE&embed=true" | grep -q "feedback"
# Expected: exits 0
```

### Admin Dashboard Verification
```bash
# 1. Login page accessible
curl -s https://csat.iwn.ng/admin/login | grep -q "login"
# Expected: exits 0

# 2. Protected routes redirect without session
curl -s -o /dev/null -w "%{http_code}" https://csat.iwn.ng/admin
# Expected: 302 (redirect to /admin/login)

# 3. With valid session cookie (after manual login)
# Test in browser: login → verify dashboard loads → verify sales data visible
```

### Email Verification
```bash
# Trigger webhook with email
SECRET="your-production-secret"
PAYLOAD='{"type":"event","call":"customer/update","data":{"customer_id":999,"attributes":{"name":"Test User","email":"your-test@example.com","tariff_name":"Test Plan","city":"Test City"}}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -H "x-splynx-signature: $SIGNATURE" \
  -d "$PAYLOAD"

# Check your-test@example.com inbox for "How was your experience with I-World Networks?"
# Verify link works: click → opens feedback form
```

### Splynx Integration Verification
```bash
# 1. In Splynx Admin: Config → Integrations → Hooks
#    - Verify webhook status: Enabled
#    - Click "Test" or trigger test event
#    - Verify response: 200 OK

# 2. Trigger real event in Splynx:
#    - Create test invoice
#    - Update test ticket
#    - Update test customer
#    - Verify webhook received (check pm2 logs)

# 3. Customer enrichment (if API configured)
#    - Create customer in Splynx
#    - Trigger webhook
#    - Verify enriched data in feedback token (check logs)
```

---

## 🔄 Rollback Plan

### If Critical Issues Found
```bash
# 1. Immediate rollback (previous git commit)
cd /home/csat.iwn.ng/csat
git log --oneline -5
git checkout HEAD~1  # or specific commit hash

# 2. Rebuild and restart
npm ci --production
npm run build
pm2 restart csat --update-env

# 2. Verify rollback
curl -s https://csat.iwn.ng/api/health
```

### Database Rollback (Firestore)
- Firestore: Use Firebase Console > Firestore > Import/Export
- Point-in-time recovery: Firebase Console > Firestore > Backups

### DNS Rollback (if needed)
- Cloudflare: DNS → Records → Edit → Point to previous IP
- TTL: 300 seconds (5 min propagation)

---

## 📊 Post-Deployment Monitoring (First 24 Hours)

### Key Metrics to Watch
| Metric | Tool | Threshold | Action |
|--------|------|-----------|--------|
| Error rate | Sentry | > 1% | Investigate immediately |
| Response time (p95) | Cloudflare/Sentry | > 2s | Check logs, scale if needed |
| Webhook success rate | PM2 logs / Sentry | < 99% | Check webhook secret, Splynx config |
| Email delivery | SMTP logs / Sentry | < 95% | Check SMTP credentials |
| Memory usage | PM2 monit | > 80% | Restart PM2, investigate leaks |
| CPU usage | htop / PM2 | > 80% | Scale up, check for loops |

### Automated Alerts (Configure in Sentry/Cloudflare)
- [ ] Error rate > 1% for 5 min → Slack + SMS
- [ ] Webhook 401 rate > 5/min → Slack
- [ ] Response time p95 > 5s → Slack
- [ ] PM2 process crash → Slack + SMS
- [ ] SSL certificate expiry < 30 days → Email

---

## 📝 Post-Deployment Documentation

### Record in Deployment Log
```markdown
## Deployment: [DATE] - Version [COMMIT_HASH]

**Deployed by:** [NAME]
**Environment:** Production
**Previous version:** [PREVIOUS_COMMIT]
**Changes:** [LINK TO PR/COMMITS]

**Verification Results:**
- [ ] Health checks: PASS/FAIL
- [ ] Webhook tests: PASS/FAIL
- [ ] Feedback forms: PASS/FAIL
- [ ] Admin dashboard: PASS/FAIL
- [ ] Email delivery: PASS/FAIL
- [ ] Splynx integration: PASS/FAIL

**Issues Found:** [NONE / LIST]
**Rollback needed:** NO / YES (reason)

**Signed off by:** [NAME]
```

### Update Documentation
- [ ] Update `DEPLOYMENT.md` with any new steps
- [ ] Update `ENVIRONMENT_SETUP_GUIDE.md` if server config changed
- [ ] Update `SPLYNX_WEBHOOK_INTEGRATION.md` if webhook config changed
- [ ] Update `INCIDENT_RESPONSE_RUNBOOK.md` with new contacts/procedures

---

## 🚨 Emergency Contacts

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| Incident Commander | [NAME] | [PHONE] | @name |
| Backend Lead | [NAME] | [PHONE] | @name |
| DevOps | [NAME] | [PHONE] | @name |
| Splynx Admin | [NAME] | [PHONE] | @name |

---

## ✅ Final Sign-Off

**All verification steps completed:** ☐ YES ☐ NO

**Issues documented:** ☐ NONE ☐ YES (see below)

**Issues:**
1. [Issue description] - Severity: P0/P1/P2 - Owner: [NAME] - Due: [DATE]
2. ...

**Deploy approved by:** _________________ **Date:** ___________

**Deploy executed by:** _________________ **Date:** ___________

---

*Checklist version 1.0 - Review before every production deployment*