# Security Incident Response Runbook

**Version:** 1.0  
**Last Updated:** July 2025  
**Classification:** INTERNAL - CONFIDENTIAL

---

## 📋 Quick Reference Card

| Incident Type | Severity | Response Time | Escalation |
|---------------|----------|---------------|------------|
| Data Breach / Credential Leak | P0 - Critical | < 15 min | CTO + Security Team |
| Webhook Secret Compromise | P0 - Critical | < 30 min | CTO + Backend Lead |
| Unauthorized Access | P1 - High | < 1 hour | Security Team |
| DDoS / Service Degradation | P1 - High | < 30 min | DevOps + Backend |
| Suspicious Webhook Activity | P2 - Medium | < 4 hours | Backend Team |

---

## 🚨 Incident Response Process

### Phase 1: Detection & Triage (0-15 min)

```
┌─────────────────────────────────────────────────────────────┐
│                    INCIDENT DETECTED                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. ACKNOWLEDGE: Slack #security-alerts or PagerDuty       │
│  2. ASSIGN: Incident Commander (IC) + Scribe                │
│  3. CLASSIFY: P0/P1/P2 using severity matrix               │
│  4. ISOLATE: Immediate containment actions                 │
└─────────────────────────────────────────────────────────────┘
```

**Immediate Actions by Type:**

| Type | Immediate Actions |
|------|-------------------|
| **Credential Leak** | Rotate secret immediately, check git history, revoke access |
| **Webhook Compromise** | Rotate `SPLYNX_WEBHOOK_SECRET`, invalidate all tokens |
| **Unauthorized Access** | Revoke session, check audit logs, identify scope |
| **DDoS** | Enable Cloudflare "Under Attack" mode, check rate limits |

---

### Phase 2: Investigation (15 min - 2 hours)

```bash
# 1. Collect evidence (run as root/sudo)
mkdir -p /tmp/incident-$(date +%Y%m%d-%H%M%S)
cd /tmp/incident-*

# 2. Preserve logs
cp /var/log/nginx/access.log* .
cp /var/log/nginx/error.log* .
pm2 logs --lines 10000 > pm2-logs.txt 2>&1

# 3. Check for unauthorized access
grep -i "unauthorized\|forbidden\|401\|403" /var/log/nginx/access.log

# 4. Check webhook signatures
grep -i "splynx" /var/log/nginx/access.log | head -100

# 5. Check PM2 process health
pm2 list
pm2 monit

# 6. Database audit (if Firestore)
# Check Firebase Console > Firestore > Audit Logs
```

**Key Questions to Answer:**
- [ ] What was accessed/modified?
- [ ] When did it start?
- [ ] What is the blast radius?
- [ ] Are credentials compromised?
- [ ] Is the attack ongoing?

---

### Phase 3: Containment & Eradication

#### Credential Leak Response
```bash
# 1. Rotate ALL affected secrets immediately
# Firebase Service Account
# SPLYNX_WEBHOOK_SECRET
# SMTP credentials
# API keys

# 2. Check git history for exposed secrets
git log --all --full-history -- .env
git log --all --full-history -- '*secret*'

# 3. If secrets in git history, use BFG Repo-Cleaner
# https://rtyley.github.io/bfg-repo-cleaner/
```

#### Webhook Secret Compromise
```bash
# 1. Generate new secret
openssl rand -hex 32

# 2. Update in Splynx Admin: Config → Integrations → Hooks
# 3. Update in production environment
# 4. Invalidate all existing feedback tokens
# 5. Monitor for replay attacks (48 hours)
```

#### Session/Token Invalidations
```bash
# 1. Clear all PM2 processes (forces re-auth)
pm2 restart all

# 2. If using Firebase Auth, revoke refresh tokens
# Firebase Console > Authentication > Users > Revoke tokens

# 3. Clear any cached sessions
redis-cli FLUSHALL  # if using Redis
```

---

### Phase 4: Recovery (2-24 hours)

```bash
# 1. Verify system health
curl -I https://csat.iwn.ng/health

# 2. Verify webhook endpoint
curl -X POST https://csat.iwn.ng/api/splynx-webhook \
  -H "Content-Type: application/json" \
  -H "x-splynx-signature: $(echo -n '{}' | openssl dgst -sha256 -hmac "$NEW_SECRET")" \
  -d '{"type":"ping"}'

# 3. Test critical user flows
# - Feedback submission
# - Admin dashboard access
# - Sales data import

# 4. Gradual traffic restoration (if DDoS)
# Cloudflare: Security > Settings > Security Level: Medium
```

---

### Phase 5: Post-Incident (24-72 hours)

**Required Deliverables:**
- [ ] Incident timeline (detection → resolution)
- [ ] Root cause analysis (5 Whys)
- [ ] Impact assessment (users, data, revenue)
- [ ] Action items with owners and deadlines
- [ ] Updated runbooks/playbooks

**Template:**
```
## Incident Report: [INC-YYYYMMDD-XXX]

**Severity:** P0/P1/P2
**Duration:** X hours Y minutes
**Impact:** [users affected, data exposed, revenue lost]

**Timeline:**
- HH:MM - Detection
- HH:MM - Triage complete
- HH:MM - Containment
- HH:MM - Recovery
- HH:MM - Resolution

**Root Cause:**
[5 Whys analysis]

**Action Items:**
1. [ ] Task - Owner - Due Date
2. [ ] Task - Owner - Due Date

**Lessons Learned:**
- What worked well?
- What didn't?
- Process improvements?
```

---

## 🔐 Critical Secrets Inventory

| Secret | Location | Rotation Frequency | Last Rotated |
|--------|----------|-------------------|--------------|
| `SPLYNX_WEBHOOK_SECRET` | Server env + Splynx Admin | 90 days | [DATE] |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Server env / Secret Manager | 90 days | [DATE] |
| `SPLYNX_API_KEY/SECRET` | Server env | 90 days | [DATE] |
| `SPLYNX_SMTP_PASS` | Server env | 90 days | [DATE] |
| `SENTRY_DSN` | Server env | As needed | [DATE] |
| `GEMINI_API_KEY` | Server env | As needed | [DATE] |

---

## 📞 Contact Tree

| Role | Primary | Backup | Escalation |
|------|---------|--------|------------|
| Incident Commander | [Name] | [Name] | CTO |
| Security Lead | [Name] | [Name] | CISO/VP Eng |
| Backend Lead | [Name] | [Name] | VP Eng |
| DevOps/Infra | [Name] | [Name] | VP Eng |
| Communications | [Name] | [Name] | CEO |

**External Contacts:**
- Splynx Support: support@splynx.com
- Cloudflare Support: support.cloudflare.com
- Firebase Support: console.firebase.google.com/support

---

## 🛡️ Preventive Measures Checklist

- [ ] All secrets in environment variables (never in code)
- [ ] `.env` in `.gitignore` verified
- [ ] `SPLYNX_WEBHOOK_SECRET` rotated every 90 days
- [ ] Webhook signature verification uses SHA-256
- [ ] Rate limiting on all public endpoints
- [ ] Audit logging on all admin actions
- [ ] Automated dependency scanning (npm audit, Snyk)
- [ ] Firebase Auth session monitoring enabled
- [ ] Cloudflare WAF rules configured
- [ ] Backup verification monthly
- [ ] Incident response drill quarterly

---

*Document maintained by: Security Team*  
*Review cycle: Quarterly or after any P0/P1 incident*