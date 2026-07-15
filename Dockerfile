# CSAT Platform - Multi-stage Dockerfile
# 
# Build: docker build -t csat-platform .
# Run: docker run -p 3000:3000 --env-file .env.production csat-platform
#
# Build with BuildKit: DOCKER_BUILDKIT=1 docker build -t csat-platform .
# Multi-arch: docker buildx build --platform linux/amd64,linux/arm64 -t csat-platform .

# ============================================================
# STAGE 1: Base image with dependencies
# ============================================================
FROM node:20-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    git

WORKDIR /app

# ============================================================
# STAGE 2: Install dependencies
# ============================================================
FROM base AS deps

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (production only for smaller image)
RUN npm ci --omit=dev

# ============================================================
# STAGE 3: Build application
# ============================================================
FROM base AS builder

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build arguments for build-time environment variables
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

# Set build-time environment variables
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID

# Build the application
RUN npm run build

# ============================================================
# STAGE 4: Production runner
# ============================================================
FROM node:20-alpine AS runner

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    tzdata

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy built application from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy package.json for version info
COPY --from=builder /app/package.json ./package.json

# Copy ecosystem config for PM2
COPY --from=builder /app/ecosystem.config.js ./ecosystem.config.js

# Create logs directory
RUN mkdir -p logs && chown -R nextjs:nodejs logs

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start with PM2 in cluster mode
CMD ["node", "node_modules/.bin/pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]

# Alternative: Start directly with Next.js (no PM2)
# CMD ["node", "server.js"]


# ============================================================
# STAGE 5: Development image (optional)
# ============================================================
FROM base AS development

ENV NODE_ENV=development
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install all dependencies including dev
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]