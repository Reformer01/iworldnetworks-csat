# I-World Networks CSAT Platform

Customer satisfaction feedback system with sales KPI tracking for I-World Networks. Built with Next.js 15, Firebase, and Tailwind CSS.

## Architecture

```
src/
├── app/
│   ├── admin/           # Admin dashboard, feedback CRUD, sales KPIs
│   ├── api/             # API routes (auth session, sales, support revenue)
│   ├── globals.css      # Design tokens (CSS variables)
│   ├── layout.tsx       # Root layout with fonts
│   └── page.tsx         # Landing page
├── components/
│   ├── layout/          # AdminLayout, SalesLayout
│   └── ui/              # UI primitives (button, input, select, dialog, etc.)
├── hooks/               # Data fetching hooks (use-sales-data, use-support-revenue, etc.)
├── lib/
│   ├── validations/     # Zod schemas
│   ├── sales-types.ts   # TypeScript interfaces
│   ├── sales-staff.ts   # Agent roster, plan codes, pricing, locations
│   ├── admin-config.ts  # Super admin emails, allowed domain
│   ├── admin-auth.ts    # Firebase Admin SDK token verification
│   ├── api-response.ts  # Standard API envelope
│   ├── audit-log.ts     # Audit log writer
│   ├── logger.ts        # Structured JSON logging
│   └── __tests__/       # Unit tests
└── ai/                  # Genkit AI flows (sentiment analysis, executive summaries)
```

## Prerequisites

- Node.js 20+
- Firebase project with Authentication, Firestore enabled
- (Optional) Sentry project for error monitoring

## Setup

1. **Clone and install**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```
   Fill in Firebase web app credentials from Project Settings > General > Your apps > Web app.

3. **Firebase Admin SDK**
   Generate a service account key from Project Settings > Service accounts > Generate new private key.
   Set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.local` to the full JSON string (minified, single line).

4. **Run locally**
   ```bash
   npm run dev
   ```
   Opens on port 9002.

5. **Deploy Firestore rules and indexes**
   ```bash
   firebase deploy --only firestore
   ```

## Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (port 9002, Turbopack) |
| `npm run build` | Production build (runs env validation first) |
| `npm run start` | Start production server |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | Next.js lint |
| `npm run test` | Vitest (watch mode) |
| `npm run test:run` | Vitest (single run) |
| `npm run analyze` | Bundle analysis (`ANALYZE=true next build`) |
| `npm run format` | Prettier formatting |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase Web SDK API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Firebase Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase Web App ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | On Vercel | Firebase Admin SDK service account key (minified JSON) |
| `GEMINI_API_KEY` | Optional | Google AI API key for Genkit sentiment analysis |
| `SENTRY_DSN` | Optional | Sentry server-side DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry client-side DSN |
| `DEPLOY_TARGET` | Optional | `vercel`, `firebase`, or `local` (validates required credentials) |

## Authentication

- Admin access restricted to `@iworldnetworks.net` email domain.
- Super admin (edit/delete permissions): `reformer.ejembi@iworldnetworks.net`, `jeffery.udoji@iworldnetworks.net`.
- API routes use Bearer token auth (Firebase ID tokens).
- Page routes use httpOnly `__session` cookie checked by middleware.

## Sales KPI Module

- **Annual target:** ₦30,000,000 / 1,000 customers across 4 regions (Ogun, Oyo, Osun, Ondo).
- **9 agents** with individual targets.
- **Segments:** HOME (H-Lite/Pro/Max), SME (U-Lite/Pro/Max), ENTERPRISE (bandwidth).
- **Plan pricing (MRC):** H-Lite ₦27,500, H-Max ₦36,500, H-Pro ₦43,500, U-Lite ₦32,500, U-Max ₦43,500, U-Pro ₦58,000.
- **Support Revenue** tracked in separate `support_revenue` collection with equipment line items.

## CI/CD

GitHub Actions on push/PR to `main`: typecheck → lint → test → build.
Requires Firebase env secrets configured in GitHub repository.

## Deployment

Supports Vercel and Firebase App Hosting. For Vercel, set `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel env vars.

```bash
npm run build
npm run start
```

## Importing Sales Data

```bash
node scripts/import-sales-data.mjs <path-to-json> [--dry-run]
```

## Security

- CSP headers with Firebase/Google API allowlisting.
- Rate limiting (120 req/min reads, 60 req/min writes, 10 req/min imports).
- Soft deletes on sales and support revenue records.
- Audit logging for all sales CRUD operations.
- SameSite=Strict session cookies.
- Sentry error monitoring (optional).

## Monitoring

- Sentry for error tracking (configure `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`).
- Structured JSON logging via `src/lib/logger.ts`.
- Bundle analysis: `npm run analyze`.
