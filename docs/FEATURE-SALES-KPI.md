# Feature: Sales KPI Tracking Dashboard

## Overview
Replace manual Google Sheets-based sales tracking with an automated KPI dashboard inside the existing I-World Networks admin portal. The system ingests sales records (imported from sheets or entered manually), computes revenue/performance metrics in real time, and displays them alongside configurable targets.

## What It Should Do

### Data Ingestion
- [x] Import existing Google Sheets sales data via CSV upload (all columns: Name, Location, NRC, MRC, Plan, Date, Package Type, Sales Agent, Means of Sale, Account Status)
- [x] Accept ad-hoc manual entry of individual sales records via a form
- [x] Support editing and deleting existing records
- [x] Parse naira-formatted amounts (`"₦27,500.00"`, `"N227,500"`, `"₦27,500 H-Lite"`) into numeric values
- [x] Auto-derive region from location string (Ogun/Oyo/Osun/Ondo)
- [x] Auto-derive segment from plan code prefix (H- = HOME, U- = SME, else ENTERPRISE)
- [x] Auto-derive quarter from month name
- [x] Track import history with batch ID, source, record count, timestamp, and import status
- [x] Rate-limit imports to 10 per minute per IP

### KPI Computation (Backend)
- [x] MRR (Monthly Recurring Revenue): sum of MRC for all Active accounts
- [x] NRII: same as MRR (for this iteration — distinct NRII tracking to be added later)
- [x] ARPU: MRR / Active subscriber count
- [x] Active/Inactive/Blocked subscriber counts
- [x] Churn rate: Inactive / (Total - Blocked) * 100
- [x] NRC revenue: sum of NRC for all records (installation/one-time fees)
- [x] All KPIs filterable by region
- [x] All KPIs aggregated by sales agent and region

### Dashboard (Read)
- [x] Display 6 KPI cards: MRR, ARPU, Active Subscribers, NRC Revenue, Churn Rate, Total Records
- [x] Bar chart: Agent MRR Performance (agent name vs active MRC)
- [x] Pie chart: Regional MRR distribution (Ogun/Oyo/Osun/Ondo)
- [x] Table: Regional Performance (MRR, Active, ARPU, Target, Attainment %)
- [x] Table: Segment Breakdown (HOME/SME/ENTERPRISE — Total, Active, MRR, ARPU)
- [x] Table: Agent Performance (Active Customers, Total Sales, MRR, NRC, Target, Attainment %)
- [x] Record-level search: by customer name, location, plan code, or agent
- [x] Record filtering: by region and account status
- [ ] Records polling: refresh every 30 seconds (deferred — dashboard fetches on mount/refetch via mutate)

### Targets
- [x] Display static annual targets per region (configurable in code)
- [x] Allow adding custom monthly targets (year-month, region, revenue target, customer target)
- [x] Compare actual attainment vs target percentage (color-coded: green ≥100%, yellow ≥50%, red <50%)
- [x] Show sales agents grouped by region with their individual annual targets

### Navigation
- [x] Collapsible "Sales KPIs" submenu in sidebar
- [x] Sub-items: Dashboard, Records, Import Data, Targets
- [x] Active state tracking: Sales KPIs header highlights when any sub-item is active

## What It Should NOT Do
- [x] NOT modify or read from the existing `feedbacks` Firestore collection
- [x] NOT require authentication beyond existing admin Firebase Auth (`@iworldnetworks.net` + email verified)
- [x] NOT send emails or notifications
- [x] NOT integrate with Splinks API (that's a future phase)
- [x] NOT do AI analysis / forecasting (that's a future phase)
- [x] NOT handle customer billing or payments
- [x] NOT produce PDF reports (sales reporting will differ from feedback PDFs)
- [x] NOT sync in real-time from Google Sheets (one-time import via CSV)

## Data Model

### `sales_records` Collection
```
{
  serialNumber: number,         // from sheet S_N or auto-index
  customerName: string,
  location: string,
  region: "Ogun" | "Oyo" | "Osun" | "Ondo",   // auto-derived
  segment: "HOME" | "SME" | "ENTERPRISE",       // auto-derived from plan code
  nrc: number,                  // one-time fee in naira
  mrc: number,                  // monthly recurring charge in naira
  planCode: string,             // e.g. "H-Lite", "U-Pro", "20Mbps"
  saleDate: string,             // raw date string from sheet
  quarter: "QUARTER 1" | "QUARTER 2" | "QUARTER 3" | "QUARTER 4",
  month: string,                // e.g. "June", "July"
  packageType: "Outright" | "Lease",
  salesAgent: string,           // agent name matching sales-staff.ts
  meansOfSale: string,          // e.g. "Door Knocking", "Referral"
  accountStatus: "Active" | "Inactive" | "Blocked" | "Refunded" | "Retrieved",
  statusNotes: string,          // e.g. "Inactive Oct 2025"
  importBatchId: string,        // ties records to import batches
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### `sales_targets` Collection
```
{
  month: string,                // "2026-06" (YYYY-MM format)
  region: "Ogun" | "Oyo" | "Osun" | "Ondo" | undefined,
  agentName: string | undefined,
  targetRevenue: number,        // revenue target in naira
  targetCustomers: number,      // customer count target
  createdAt: timestamp
}
```

### `sales_imports` Collection
```
{
  batchId: string,
  source: string,               // "csv_upload" | "json_migration_script" | "manual"
  fileName: string,
  recordCount: number,
  importedAt: timestamp,
  importedBy: string,           // admin email or "migration_script"
  status: "completed"
}
```

## Acceptance Criteria (Verified Status)

### Upload & Import
- [x] User can upload a CSV file with sales records
- [x] Columns are mapped from common names (Name, Location, Plan_Code, MRC, NRC, Business_Person, Means_of_Sales, Account_Status, Date, Quarter, Month, Package_Type)
- [x] Parsed records are previewed in a table before committing
- [x] Import writes all records in a single Firestore batch
- [x] Invalid amounts (non-numeric MRC/NRC) default to 0, never crash the import
- [x] Import audit entry is created on success

### Dashboard
- [x] KPI cards show computed values from all imported records
- [x] Charts render without error when data is empty (show empty state)
- [x] Agent/region/segment tables handle zero records gracefully
- [x] All numeric values are formatted as naira (₦x,xxx) with `en-NG` locale
- [ ] Dashboard auto-refreshes every 30 seconds (deferred — data is fetched on mount)

### Records CRUD
- [x] User can search records by customer name, location, plan code, or agent
- [x] User can filter by region and account status
- [x] Add new record via dialog form with validation
- [x] Edit existing record via same dialog pre-filled with current values
- [x] Delete with confirmation prompt
- [x] Table paginated at 500 records by default

### Error Handling
- [x] Unauthorized requests (missing/invalid token) return 401 JSON
- [x] Rate-limited requests return 429 JSON
- [x] Invalid JSON body returns 400 JSON
- [x] Zod validation failures return 400 with field-level errors
- [x] Internal server errors return 500 JSON (never crash the API route)
- [x] Client-side fetch errors show toast notifications, never blank screens

### Security
- [x] All sales API routes require `verifyAdminToken()` (same as feedback routes)
- [x] Firestore rules restrict all sales collections to `@iworldnetworks.net` verified emails
- [x] Rate limiting applied on all write operations (import: 10/min, CRUD: 60/min, reads: 120/min)

## Edge Cases

### Data Quality (All Verified Fixed)
- [x] NRC/MRC formatted as `"₦27,500.00"`, `"N227,500.00"`, or plain `"27500"` — all parsable
- [x] MRC sometimes has plan appended: `"₦27,500.00 H-Lite"` — parser extracts only the number
- [x] Account_Status includes qualified values like `"Inactive Oct 2025"` — status normalized to `"Inactive"`, notes extracted
- [x] Empty/invalid MRC or NRC default to 0
- [x] Unknown locations default to "Ogun" region
- [x] Unknown plan codes default to "ENTERPRISE" segment

### Empty States
- Dashboard with no records: show 0 for all KPIs, empty state text in tables
- Records page with no results: "No Records Found" message
- Import page with no file: upload prompt
- Targets page with no custom targets: show only static regional targets

### Agent Roster
- Agents are defined statically in `src/lib/sales-staff.ts` with their annual targets
- If a sales record references an agent not in the roster, they still appear in the dashboard
- Agent name matching is case-sensitive against the roster

## Navigation Structure

```
Admin Sidebar
├── Overview          /admin/dashboard
├── Stability         /admin/stability
├── Support           /admin/support
├── Field Support     /admin/field-support
├── Installation      /admin/installation
├── Billing           /admin/billing
├── Staff Performance /admin/staff
├── Testimonials      /admin/testimonials
├── Manage Data       /admin/crud
├── Sales KPIs        (collapsible)
│   ├── Dashboard     /admin/sales
│   ├── Records       /admin/sales/records
│   ├── Import Data   /admin/sales/import
│   └── Targets       /admin/sales/targets
```

## Future Phases (Not in Scope)
1. Splinks API integration for automated subscriber sync
2. AI-powered sales forecasting (Genkit flow)
3. Automated PDF report generation for sales reviews
4. Real-time Google Sheets sync via Sheets API
5. Distinct NRII vs MRR tracking
6. Churn reason analytics and trend detection
7. Per-agent target configuration UI (currently code-only)
