# CSAT Platform - Docker Deployment Guide

**Version:** 1.0  
**Last Updated:** July 2025

---

## 📋 Quick Start

### Prerequisites
- Docker 24+
- Docker Compose 2+
- Git

### Local Development
```bash
# Start development environment
docker-compose --profile dev up -d

# View logs
docker-compose --profile dev logs -f app-dev

# Stop
docker-compose --profile dev down
```

### Production Deployment
```bash
# Set required environment variables
export IMAGE_TAG=v1.0.0

# Deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
```

### Staging Deployment
```bash
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Cloudflare                              │
│  DNS → SSL → WAF → DDoS Protection → Rate Limiting           │
└──────────────────────────┬────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (Port 80/443)                    │
│  • SSL Termination (Let's Encrypt)                           │
│  • Rate Limiting (per endpoint)                               │
│  • Static Asset Caching                                       │
│  • Security Headers                                           │
│  • Load Balancing                                             │
└──────────────────────────┬────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js App (Port 3000)                        │
│  • PM2 Cluster Mode (multi-core)                             │
│  • Health Checks                                              │
│  • Graceful Shutdown                                          │
│  • Graceful Reload (zero-downtime)                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Services

### Application (`app`)
| Aspect | Development | Staging | Production |
|--------|-------------|---------|------------|
| Replicas | 1 | 1 | 3 |
| CPU | 1 | 1 | 2 |
| Memory | 1GB | 1GB | 2GB |
| Mode | Dev server | Next.js standalone | PM2 Cluster |

### Nginx (`nginx`)
| Aspect | Development | Staging | Production |
|--------|-------------|---------|------------|
| Replicas | 1 | 1 | 2 |
| SSL | Self-signed | Let's Encrypt | Let's Encrypt |
| Rate Limiting | Basic | Standard | Aggressive |

---

## ⚙️ Configuration

### Environment Files
| File | Purpose |
|------|---------|
| `.env.local` | Local development |
| `.env.production` | Production template |
| `.env` | Runtime (server only, not in git) |

### Required Environment Variables
```env
# Firebase (Client)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase (Server)
FIREBASE_SERVICE_ACCOUNT_JSON=

# Splynx
SPLYNX_WEBHOOK_SECRET=
SPLYNX_API_HOST=https://splynx.iworldnetworks.net
SPLYNX_API_KEY=
SPLYNX_API_SECRET=
SPLYNX_API_AUTH=basic
SPLYNX_SMTP_HOST=mail.iworldnetworks.net
SPLYNX_SMTP_PORT=465
SPLYNX_SMTP_USER=no_reply@mail.iworldnetworks.net
SPLYNX_SMTP_PASS=
SPLYNX_FROM_EMAIL=no_reply@mail.iworldnetworks.net
SPLYNX_FROM_NAME=I-World Networks Limited

# App
FEEDBACK_BASE_URL=https://csat.iwn.ng
NODE_ENV=production
PORT=3000

# Optional
SENTRY_DSN=
GEMINI_API_KEY=
```

---

## 🔒 Security

### Network Security
- Nginx terminates SSL (TLS 1.2/1.3 only)
- Rate limiting per endpoint
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Block access to sensitive files (.env, .git, etc.)

### Container Security
- Non-root user (nodejs)
- Read-only root filesystem (where possible)
- Dropped capabilities
- No new privileges

### Image Security
- Multi-stage build (small final image)
- Distroless/Alpine base
- Dependency scanning (Trivy)
- Secret scanning (TruffleHog)

---

## 📊 Monitoring & Health

### Health Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Application health (used by PM2, Nginx, Docker) |
| `GET /api/health/ready` | Readiness probe |
| `GET /api/health/live` | Liveness probe |

### Logs
```bash
# Application logs
docker-compose logs -f app

# Nginx logs
docker-compose logs -f nginx

# All logs with timestamps
docker-compose logs -f -t --tail=100
```

### Metrics
- PM2 monitoring: `pm2 monit`
- Docker stats: `docker stats`
- Health check: `curl https://csat.iwn.ng/api/health`

---

## 🚀 Deployment Procedures

### Blue-Green Deployment (Zero Downtime)
```bash
# 1. Pull new image
docker pull csat-platform:v1.0.1

# 2. Update IMAGE_TAG
export IMAGE_TAG=v1.0.1

# 3. Rolling update (handled by docker-compose deploy)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps app

# 4. Verify
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -f https://csat.iwn.ng/api/health

# 5. Rollback if needed
export IMAGE_TAG=v1.0.0
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps app
```

### Database Migrations (if applicable)
```bash
# Run migrations in container
docker-compose exec app npx prisma migrate deploy
# or
docker-compose exec app npm run migrate
```

### Backup & Restore
```bash
# Backup Firestore (via Firebase CLI)
firebase firestore:export gs://your-bucket/backups/$(date +%Y%m%d)

# Restore
firebase firestore:import gs://your-bucket/backups/20250714
```

---

## 🔧 Troubleshooting

### Common Issues

| Symptom | Check | Fix |
|---------|-------|-----|
| App won't start | `docker-compose logs app` | Check env vars, port conflicts |
| 502 Bad Gateway | `docker-compose logs nginx` | App not healthy, check app logs |
| SSL errors | `docker-compose logs nginx` | Check cert paths, Let's Encrypt |
| High memory | `docker stats` | Increase limits, check memory leaks |
| Slow responses | `pm2 monit` | Check for blocking operations |

### Debug Commands
```bash
# Enter container
docker-compose exec app sh

# View PM2 processes
docker-compose exec app pm2 list

# Restart app only
docker-compose restart app

# Rebuild and restart
docker-compose up -d --build app

# Prune unused
docker system prune -af --volumes
```

---

## 📚 Additional Resources

- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Docker Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)

---

*Document maintained by: Platform Team*  
*Review cycle: Per deployment or quarterly*