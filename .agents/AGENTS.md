# I-World Networks Feedback Platform

## Project Overview
Customer feedback platform with sales KPI integration. Built with Next.js 14 (App Router), Firebase Auth/Firestore, Tailwind CSS, recharts, Zod.

## Tech Stack
- **Framework**: Next.js 14 (App Router, pages in `src/app/`)
- **Auth**: Firebase Authentication (client) + Firebase Admin SDK (server)
- **Database**: Cloud Firestore (admin via `firebase-admin`, client via `firebase`)
- **Styling**: Tailwind CSS with custom `--font-outfit` / `--font-jetbrains-mono` CSS variables via `next/font/google`
- **Validation**: Zod schemas in `src/lib/validations/`
- **Charts**: recharts
- **Testing**: Vitest + @testing-library/react + jsdom
- **State**: React hooks + Firebase real-time listeners

## Key Conventions
- All API routes under `src/app/api/` use `verifyAdminToken()` from `src/lib/admin-auth.ts`
- Admin pages check `email.endsWith('@iworldnetworks.net')` and `emailVerified`
- Sales records in `sales_records` collection, feedbacks in `feedbacks` collection
- API responses use standard envelope: `{ success: true, data?: T }` or `{ success: false, error: string }` via `src/lib/api-response.ts`
- Soft deletes use `deletedAt` timestamp (not actual deletion)
- Rate limiting via `src/lib/rate-limit.ts` (120 req/min reads, 60 req/min writes)
- Session auth via httpOnly `__session` cookie for page routes, `Authorization: Bearer <token>` for API routes
- Audit logging to `sales_audit_log` collection for sales CRUD operations
- All `any` types must be eliminated — use proper TypeScript types throughout (`Record<string, unknown>` for dynamic data)

## Type System
- `src/lib/sales-types.ts` — Core sales types (SalesRecord, SalesMetrics, AgentMetrics, RegionMetrics, etc.)
- `src/lib/sales-staff.ts` — Agent roster and utility functions (getRegionForLocation, getSegmentForPlan, etc.)
- `src/lib/feedback-types.ts` — FeedbackDoc interface for feedback documents
- `src/lib/validations/` — Zod schemas (sales.ts, feedback.ts)

## Testing
- Run: `npm run test` (watch) or `npm run test:run` (single run)
- Test files co-located in `__tests__/` directories next to source
- 82 tests across 4 files: sales-staff, sales validation, api-response, audit-log

## Build & Deploy
- `npm run typecheck` — TypeScript check (noEmit)
- `npm run build` — Next.js production build
- `npm run dev` — Development server on port 9002
- Deploy: `firebase deploy --only hosting` (static), `firebase deploy --only functions` (if serverless)

## Data Model
- `feedbacks/{doc}` — Customer feedback with ratings, category, status
- `sales_records/{doc}` — Sales records with customer info, plan, region, segment, soft-delete
- `sales_targets/{doc}` — Monthly/regional revenue and customer targets
- `sales_audit_log/{doc}` — Audit trail for sales CRUD operations

## Admin Access
- Only `@iworldnetworks.net` emails with verified addresses
- Admin routes protected by middleware (`src/middleware.ts`) checking `__session` cookie
- API routes protected by `verifyAdminToken()` checking `Authorization` header
