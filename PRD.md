# Product Requirements Document — I-World CSAT & Operations Platform v2

**Status:** Draft
**Date:** July 10, 2026
**Authors:** Product Team
**Version:** 2.0

---

## Goal

### Mission
Replace guesswork with data, spreadsheets with dashboards, and fragmented departmental processes with a single integrated system that every I-World department uses daily.

### Key Results

| KR | Metric | Current | Target | Owner |
|---|---|---|---|---|
| **KR1** | All customer touchpoints generate trackable feedback | 2 channels (web + Splynx email) | 4 channels (+ ticket resolution + installation follow-up) | Reformer |
| **KR2** | Support ticket SLA compliance (≤1 min assignment) | Not tracked | ≥90% of tickets assigned within 1 minute | Adeolu / Reformer |
| **KR3** | Sales segment data available per agent | Total MRR per agent only | MRR per agent × segment (HOME, SME, ENT, MSP, NEIGHBOURHOOD) | Reformer |
| **KR4** | Managed Services revenue tracked in platform | Not tracked | MSP deals recordable with own segment and plans | Reformer / Jeffery |
| **KR5** | Anonymous feedback option live | Not available | Checkbox on public form, no PII stored | Reformer |

### Scope

**In scope (Phase 1):**
- CSAT: response time selector, anonymous feedback, popup link, staff name standardisation
- Sales: segment-by-agent breakdown, auto-quarter, business year shift to July–June
- Managed Services: new segment, plan codes, pricing, dashboard row
- Back-end staff directory added to system

**In scope (Phase 2):**
- Ticket workflow engine (front-end → back-end → technical)
- SLA breach detection and dashboard
- Complaint type dropdown

**Not in scope (deferred):**
- WhatsApp API integration
- Access point / network monitoring dashboard
- Direct CRM integration with Splynx hardware module

### Success Criteria (Launch Gate)

The platform is ready for company-wide adoption when:
1. A customer can submit feedback anonymously
2. Support category shows response time options instead of star ratings
3. Quarter auto-fills when a sales agent selects a month
4. Managed Services plan codes appear in the dropdown and dashboard
5. All staff names display consistently as Firstname Lastname
6. Phase 2 ticket engine is designed and scoped for the next sprint

### Timeline

| Milestone | Target Date |
|---|---|
| Phase 1 implementation complete | Current sprint |
| Management demo / sign-off | Next management review |
| Staff training (department heads) | After sign-off |
| Company-wide launch | TBD

---

## 1. Purpose

This document defines the requirements for the next iteration of the I-World CSAT & Operations Platform. The scope covers changes to the customer feedback system, introduction of a ticket workflow engine, enhanced sales dashboards, managed services module, and operational integrations.

The platform serves two missions:
1. **Customer Experience** — Measure and improve satisfaction across every department
2. **Operational Visibility** — Give management real-time data on sales, support, and field operations

---

## 2. Summary of Changes

| Area | Change | Priority |
|---|---|---|
| **CSAT Feedback** | Replace star ratings with expected response time selection | High |
| **CSAT Feedback** | Add anonymous submission option | Medium |
| **CSAT Feedback** | Add feedback link to main site in popup forms | Medium |
| **Ticket Workflow** | Build front-end → back-end → technical staff ticketing system | High |
| **KPI Tracking** | Track resolution time, first-time fix rate, escalation speed | High |
| **WhatsApp Integration** | Log follow-ups via WhatsApp API | Low |
| **Sales Dashboard** | Add segment breakdown by agent | High |
| **Managed Services** | Add MSP segment, plans, and dashboard section | High |
| **Quarter Field** | Auto-populate quarter from month selection | High |
| **Business Year** | Shift from June–May to July–June | Medium |
| **Staff Names** | Standardise all staff names to Firstname Lastname format | Medium |
| **Support Revenue** | Keep separate from sales records | Already done |
| **Access Point Monitoring** | Add proactive + scheduled monitoring dashboard | Low |

---

## 3. Detailed Requirements

### 3.1 CSAT Feedback Changes

#### 3.1.1 Replace Ratings with Response Time (Support Category)

**Current:** Support category has star ratings (1-5) for professionalism, clarity, responsiveness, knowledge, friendliness, plus a Yes/No for first-contact resolution.

**Change:** Replace the five per-dimension star ratings with a single question:
> "How quickly did we respond to your issue?"

| Option | Visual |
|---|---|
| Within 5 minutes | Green badge |
| Within 10 minutes | Amber badge |
| Within 15 minutes | Red badge |

**Where:** `src/app/page.tsx` — Support category section

**Backend impact:**
- Store selected response time as `responseTime: '5min' | '10min' | '15min'` on the feedback doc
- Keep the `fcr` (first contact resolution) Yes/No radio
- Keep the open-ended comment field
- Remove the 5 rating fields (`professionalism`, `clarity`, `responsiveness`, `knowledge`, `friendliness`)

**Validation:** At least one option must be selected. Comment remains optional.

#### 3.1.2 Anonymous Submission

**Current:** `customerName` and `customerEmail` are required fields on the public form.

**Change:** Add a checkbox below the email field:
> "Submit anonymously — I'd prefer not to share my name"

- When checked, `customerName` and `customerEmail` become optional
- Store submission with `isAnonymous: true` and omit name/email from the feedback doc
- The checkbox text should read: "Submit anonymously"

**Where:** `src/app/page.tsx` — below email input, above comment field

**Backend impact:**
- Update `feedbackSchema` in `src/lib/validations/feedback.ts` — make `customerName` and `customerEmail` conditionally required
- Submit endpoint (`src/app/api/submit-feedback/route.ts`) should accept anonymous submissions

#### 3.1.3 Feedback Link in Popup Forms

**Current:** The Splynx-triggered popup form (`/feedback/popup`) only allows the short survey.

**Change:** Add a link at the bottom of the popup:
> "Want to share more details? Visit our full feedback page"

- Links to the main feedback portal (`/`)
- Opens in a new tab (`target="_blank"`)
- Visible in both embed and standalone modes

**Where:** `src/app/feedback/popup/page.tsx` — below the comment field, above the submit button

#### 3.1.4 Complaint Type Dropdown (Phase 2)

**Future:** Add a "Complaint Type" dropdown to allow categorisation during ticket creation. Not in current scope — noted for roadmap.

---

### 3.2 Ticket Workflow Engine (NEW)

This is the most significant new feature. A structured ticket system that mirrors the actual support workflow.

#### 3.2.1 User Roles

| Role | Description | Staff Members |
|---|---|---|
| **Front-end Support** | First point of contact. Creates tickets, assigns to back-end. | Victoria Fokorede, Aishat Hamzat, Adekomoya Joseph, Olusegun Oluwanishola, Babatunde Christianah |
| **Back-end Support** | Manages tickets. Resolves directly or escalates to technical staff. | Yusuf Femi, Ibrahim Gbadamosi, Omotunde Olamide, Tunji Adebayo |
| **Technical / Field Staff** | Goes on-site, fixes issues, reports back. | Lukmon Obasa, Christian Adejo, Habeeb Hussein, Joseph Dung N, Alowo Temitope, Timilehin Alabi, Adekunle Ademiju, Adebisi Ogusola, Kehinde Itehinola, Olopade Olusegun, Mubarak Raji |
| **Billing Team** | Handles billing-related tickets. | Akinola Stella, Olayoole Dorcas |

#### 3.2.2 Ticket States & Flow

```
Front-end creates ticket ──→ Assigned to Back-end
                                  │
                          ┌───────┴───────┐
                          │               │
                    Back-end resolves  Escalates to Technical
                          │               │
                          │         Technical goes on-site
                          │               │
                          │         Fixes & reports back
                          │               │
                          └───────┬───────┘
                                  │
                          Ticket Closed
```

**Ticket states:** `open` → `assigned` → `in_progress` → `resolved` → `closed`

**SLA:** A ticket must be created by front-end AND assigned to back-end within **1 minute** of the customer's initial contact.

#### 3.2.3 Ticket Data Model

```typescript
interface Ticket {
  id: string;
  ticketNumber: number;           // Auto-incrementing
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  location: string;
  region: SalesRegion;
  bts?: string;
  
  // Complaint
  complaintType: string;          // e.g. 'No Connectivity', 'Slow Speed', 'Hardware Issue', etc.
  description: string;
  
  // Assignment
  createdBy: string;              // Front-end staff name
  assignedTo: string;             // Back-end staff name
  escalatedTo?: string;           // Technical staff name (if escalated)
  
  // Status
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  
  // Timestamps
  createdAt: number;              // When ticket was created
  assignedAt?: number;            // When assigned to back-end
  escalatedAt?: number;           // When escalated to technical
  resolvedAt?: number;            // When resolved
  closedAt?: number;              // When closed
  
  // SLA
  slaBreached: boolean;           // True if creation→assignment > 1 minute
  
  // Resolution
  resolutionNotes?: string;
  firstTimeFix: boolean;          // Was it resolved on first visit?
  delayReasons?: string[];        // e.g. 'Equipment unavailable', 'Transport issue'
  delayNotes?: string;            // Free-text from support teammates
  
  // Follow-ups
  followUps: FollowUp[];
  
  // Metadata
  createdByAgent: string;
  updatedAt: number;
  deletedAt?: number;
}

interface FollowUp {
  id: string;
  from: string;                   // Staff name
  to: string;                     // Staff name
  message: string;
  channel: 'whatsapp' | 'system'; // Where the message was sent
  timestamp: number;
}
```

#### 3.2.4 KPI Calculations

| KPI | Formula | Role Measured |
|---|---|---|
| **Ticket Creation Speed** | Time from `createdAt` to `assignedAt` (target: ≤60s) | Front-end |
| **Resolution Time** | Time from `assignedAt` to `resolvedAt` | Back-end |
| **Escalation Speed** | Time from `assignedAt` to `escalatedAt` | Back-end |
| **Response Time (Escalation)** | Time from `escalatedAt` to first status change by technical staff | Technical |
| **First Time Fix Rate** | `firstTimeFix === true` ÷ total resolved tickets × 100 | Technical |
| **Attendance** | Tickets where technical staff responded vs assigned | Technical |
| **Delay Reasons Breakdown** | Count of each `delayReasons` value | All roles |

#### 3.2.5 UI: Ticket Management Dashboard

- **Route:** `/admin/tickets`
- **Views:**
  - **My Tickets** — tickets assigned to current user (filtered by their name)
  - **All Tickets** — full list (management view)
  - **Open Queue** — unassigned tickets needing back-end assignment
- **Columns:** Ticket #, Customer, Status, Created, Assigned To, Escalated To, Age, SLA Status
- **Actions:** Assign, Escalate, Resolve, Close, Add Follow-up, Add Delay Reason
- **Filters:** Status, Region, Created Date Range, Created By, Assigned To

#### 3.2.6 Ticket Form (Create Screen)

- **Route:** `/admin/tickets/new` (or inline modal)
- **Fields:**
  - Customer Name (required)
  - Customer Phone (required)
  - Customer Email (optional)
  - Location (dropdown)
  - Complaint Type (dropdown — list TBD with Adeolu)
  - Description (textarea)
- On save: auto-increment ticket number, set `createdBy` to logged-in user, set status to `open`, set `createdAt` timestamp

#### 3.2.7 Delay Reasons

When a ticket is resolved or closed, the resolving staff can log delay reasons:

- Equipment unavailable
- Transport issue
- Weather delay
- Customer not available on site
- Requires multiple visits
- Third-party dependency
- Other (free text)

---

### 3.3 Sales Dashboard Enhancements

#### 3.3.1 Segment Breakdown by Agent

**Current:** Segment breakdown shows total MRR per segment. Agent performance shows total MRR per agent.

**Change:** Add a view that shows which agents are closing deals in which segments (HOME, SME, ENTERPRISE, NEIGHBOURHOOD).

**Where:** `src/app/admin/sales/page.tsx` — new table or expand existing Agent Performance table

**Implementation:**
- Metrics API (`src/app/api/admin/sales/metrics/route.ts`) already computes per-agent metrics
- Add segment breakdown per agent: for each agent, split their MRR and customer count by segment
- Return new field: `agentSegmentBreakdown: { agent: string; segment: string; count: number; mrc: number }[]`

**UI:**
- Option A: Expandable rows in Agent Performance table — click an agent to see their segment breakdown
- Option B: New table section below Agent Performance

#### 3.3.2 Quarterly Field Auto-Population

**Current:** Users manually select quarter when adding a sales record.

**Change:** When the user selects a month, the quarter field auto-populates.

**Where:** `src/app/admin/sales/records/page.tsx` — the Add/Edit dialog

**Implementation:**
- Add a `useEffect` that watches `form.month` and auto-sets `form.quarter` using `getQuarterFromMonth()`
- The quarter field becomes read-only (disabled), showing the computed value
- Keep the quarter field in the data model (backward compatibility for imports)
- Update `getQuarterFromMonth` and `getMonthsForQuarter` to use the correct business year

#### 3.3.3 Business Year Alignment

**Current:** Business year starts in June (Q1 = Jun–Aug).

**Change:** Business year now runs **July to June**:

| Quarter | Months |
|---|---|
| QUARTER 1 | July, August, September |
| QUARTER 2 | October, November, December |
| QUARTER 3 | January, February, March |
| QUARTER 4 | April, May, June |

**Where:** `src/lib/sales-staff.ts` — `getQuarterFromMonth()` and `getMonthsForQuarter()`

**Impact:** This changes how all existing records' quarters are computed. Existing records stored with their original quarter values won't change (the quarter is stored as a field on the record). Only newly computed quarters and the month-to-quarter mapping will use the new calendar.

---

### 3.4 Managed Services (MSP) Module

#### 3.4.1 Segment & Type

Add a new segment: `MANAGED_SERVICES`

**Where:** `src/lib/sales-types.ts` — update `SalesSegment` type:
```typescript
export type SalesSegment = 'HOME' | 'SME' | 'ENTERPRISE' | 'NEIGHBOURHOOD' | 'MANAGED_SERVICES';
```

#### 3.4.2 Plan Codes

Add MSP plan codes:

| Code | Label | Segment |
|---|---|---|
| MSP-Basic | Managed IT — Basic | MANAGED_SERVICES |
| MSP-Pro | Managed IT — Pro | MANAGED_SERVICES |
| MSP-Enterprise | Managed IT — Enterprise | MANAGED_SERVICES |

**Where:** `src/lib/sales-staff.ts` — add to `planCodes` array and `planPricing` object

#### 3.4.3 Segment Mapping

Update `getSegmentForPlan()` in `src/lib/sales-staff.ts`:
```typescript
if (code.startsWith('MSP-')) return 'MANAGED_SERVICES';
```

#### 3.4.4 Plan Pricing (To be confirmed with Jeffery)

| Code | MRC (NGN) |
|---|---|
| MSP-Basic | TBD |
| MSP-Pro | TBD |
| MSP-Enterprise | TBD |

#### 3.4.5 Dashboard Integration

- MSP records appear in the sales dashboard as their own segment row in Segment Breakdown
- MSP is **not** rolled up into SME (unlike NEIGHBOURHOOD which rolls up to SME)
- Metrics API filters records by `r.segment === 'MANAGED_SERVICES'`

#### 3.4.6 Service Offerings (for reference)

Managed Services include (from iwn.ng/msp.html):
- IT Consultancy
- Internet Connectivity
- Network Services (LAN/WLAN/VPN)
- Google Workspace
- Business VOIP
- Web & App Development
- Google Cloud & AI
- 24/7 Monitoring
- Network Security & Firewall
- CCTV — IP Surveillance
- Access Control

These are for internal reference — the platform tracks the subscription (plan code, MRR) rather than individual service line items within MSP.

---

### 3.5 Staff Name Standardisation

**Current:** Inconsistent naming — some use full names ("Victoria Fokorede"), some use first name only ("Dorcas", "Stella"), field technicians show region suffix.

**Change:** All staff names across the platform must use a consistent `Firstname Lastname` format.

**Where:**
- `src/lib/staff.ts` — update `billingStaff` array to use full names: "Akinola Stella" (already full), "Olayoole Dorcas"
- `src/lib/sales-staff.ts` — verify all sales agents use consistent format

**Guidelines:**
- No nicknames
- No region suffixes in display names
- No titles (Mr., Mrs., Engr.)
- Format: `Firstname Lastname` (or accepted full name as registered)

---

### 3.6 Monitoring — Access Point Dashboard (Phase 2)

**Future scope — not in current build sprint.**

Requirements for reference:
- Dashboard showing all access points owned by I-World across all Points of Presence (POPs)
- Active users per access point in real-time
- Access point health indicators (online, degraded, offline)
- Scheduled monitoring alerts
- Proactive monitoring alerts

**Implementation notes:**
- Requires backend integration with network monitoring tools (SNMP, API from router/AP hardware)
- Data would be separate from Firestore — likely a time-series database or real-time metrics pipeline
- UI would be a new dashboard section: `/admin/network/monitoring`

---

### 3.7 WhatsApp API Integration (Phase 2)

**Future scope — not in current build sprint.**

Requirements for reference:
- All follow-ups between Front-end, Back-end, and Technical staff should be logged via WhatsApp
- When a follow-up note is added in the ticket system, it sends via WhatsApp API to the assigned staff
- Replies via WhatsApp are captured and logged back into the ticket
- Provides an audit trail for all inter-staff communication

**Technical considerations:**
- Requires WhatsApp Business API access (Meta)
- Webhook endpoint to receive incoming messages
- Two-way message sync between the platform and WhatsApp

---

## 4. Non-Functional Requirements

### 4.1 Performance
- Feedback page load: < 2s
- Sales dashboard metrics API response: < 3s (for up to 2,000 records)
- Ticket operations (create, assign): < 1s

### 4.2 Security
- Admin routes protected by Firebase Auth middleware
- Ticket system respects role-based access (front-end sees their own tickets, back-end sees assigned, etc.)
- Anonymous feedback must not store PII (personally identifiable information)

### 4.3 Data Integrity
- Soft deletes on tickets (same pattern as sales records — `deletedAt` field)
- Audit logging for all ticket state changes
- No duplication between support revenue and sales records (they use separate collections)

---

## 5. User Stories

### 5.1 CSAT — Anonymous Feedback

> **As a** customer,
> **I want to** submit feedback without sharing my name or email,
> **So that** I can be honest about my experience without worrying about being identified.

**Acceptance criteria:**
- Checkbox labelled "Submit anonymously" appears on the public feedback form
- When checked, name and email fields become optional
- Submitted feedback has `isAnonymous: true` and no customer name/email stored
- Anonymous and named feedback both appear in the admin dashboard

### 5.2 CSAT — Response Time Selection

> **As a** customer,
> **I want to** select how quickly support responded (5, 10, or 15 minutes),
> **So that** I can give feedback about response speed instead of assigning a star rating.

**Acceptance criteria:**
- Support category shows three options: Within 5 min, Within 10 min, Within 15 min
- Exactly one option must be selected
- First Contact Resolution (Yes/No) still appears
- Comment field still appears
- Submitted feedback records the selected response time

### 5.3 Tickets — Create and Assign

> **As a** front-end support agent,
> **I want to** create a ticket and have it automatically timestamped,
> **So that** I can track how quickly tickets are created and assigned.

**Acceptance criteria:**
- Ticket form captures customer name, phone, location, complaint type, and description
- Ticket number auto-increments
- Ticket is created with `status: 'open'` and `createdAt` timestamp
- Front-end agent assigns to a back-end agent
- Assignment records `assignedAt` timestamp for SLA tracking

### 5.4 Tickets — Escalate and Resolve

> **As a** back-end support agent,
> **I want to** either resolve a ticket or escalate to technical staff,
> **So that** complex issues get routed to field technicians while simple ones are closed quickly.

**Acceptance criteria:**
- Back-end agent can mark a ticket as "Resolved" with resolution notes
- Back-end agent can "Escalate" to a technical staff member with handover notes
- When escalated, `escalatedTo` and `escalatedAt` are recorded
- Technical staff can update status to "In Progress", "Resolved", "Closed"

### 5.5 Tickets — SLA Monitoring

> **As a** manager,
> **I want to** see which tickets breached the 1-minute SLA,
> **So that** I can identify and address slow response times.

**Acceptance criteria:**
- Tickets where `assignedAt - createdAt > 60000ms` have `slaBreached: true`
- SLA status column shown on the ticket management dashboard
- SLA breach indicator (green/red badge) visible on each ticket row

### 5.6 Sales — Segment by Agent

> **As a** manager,
> **I want to** see which agents are closing deals in each segment,
> **So that** I can identify who is strong in Enterprise, SME, Home, etc.

**Acceptance criteria:**
- Agent Performance table can be expanded to show per-segment breakdown
- Or a separate table showing agent × segment matrix
- Includes customer count and MRR per segment per agent

### 5.7 Sales — Auto Quarter

> **As a** sales agent,
> **I want to** the quarter field to fill in automatically when I select a month,
> **So that** I don't have to remember which quarter each month belongs to.

**Acceptance criteria:**
- When month is selected/changed, the quarter field auto-populates
- Quarter field becomes read-only/disabled
- Quarter still stored correctly on save

### 5.8 Managed Services — Sales Recording

> **As a** sales agent,
> **I want to** select Managed Services as a plan type when closing an MSP deal,
> **So that** MSP revenue is tracked separately from Home/SME/Enterprise.

**Acceptance criteria:**
- "Managed IT — Basic", "Managed IT — Pro", "Managed IT — Enterprise" appear in the plan code dropdown
- Selecting an MSP plan sets segment to MANAGED_SERVICES
- MSP records appear in the dashboard under their own segment row

---

## 6. Implementation Phases

### Phase 1 (Current Sprint)

| Item | Effort | Depends On |
|---|---|---|
| Shift business year to July–June | Small | — |
| Auto-populate quarter from month | Small | Business year change |
| Replace star ratings with response time selector | Small | — |
| Add anonymous submission checkbox | Small | — |
| Standardise staff names | Small | — |
| Add MSP segment, plans, and pricing | Medium | Pricing confirmation |
| Add segment breakdown by agent | Medium | — |
| Add feedback link in popup forms | Small | — |

### Phase 2 (Next Sprint)

| Item | Effort | Depends On |
|---|---|---|
| Ticket workflow engine (full CRUD + state machine) | Large | Phase 1 |
| Ticket KPI calculations and dashboard | Medium | Ticket engine |
| SLA breach detection | Medium | Ticket engine |
| Complaint type dropdown | Small | Agreement on types |

### Phase 3 (Future)

| Item | Effort | Depends On |
|---|---|---|
| WhatsApp API integration | Large | Ticket engine |
| Access point monitoring dashboard | Large | Network engineering |
| Back-end support feedback in CSAT | Small | Phase 2 |

---

## 7. Appendix

### 7.1 Staff Directory (All Departments)

**Support (Front-end):**
- Victoria Fokorede
- Aishat Hamzat
- Adekomoya Joseph
- Olusegun Oluwanishola
- Babatunde Christianah

**Support (Back-end):**
- Yusuf Femi
- Ibrahim Gbadamosi
- Omotunde Olamide
- Tunji Adebayo

**Field Technicians:**
- Lukmon Obasa
- Christian Adejo
- Habeeb Hussein
- Joseph Dung N
- Alowo Temitope
- Timilehin Alabi
- Adekunle Ademiju
- Adebisi Ogusola
- Kehinde Itehinola
- Olopade Olusegun
- Mubarak Raji

**Billing:**
- Akinola Stella
- Olayoole Dorcas

**Sales:**
- Titilade Bakare
- Henry Adiene
- Janet Oke
- Jeffery Udoji (Manager)
- Emmanuel Oladimeji
- Elizabeth Tola
- Ruth Suleimon

### 7.2 Business Year Reference

| Quarter | Months | Description |
|---|---|---|
| Q1 | July, August, September | Start of business year |
| Q2 | October, November, December | |
| Q3 | January, February, March | |
| Q4 | April, May, June | End of business year |

### 7.3 Managed Services Reference

From I-World Networks MSP offering (iwn.ng/msp.html):
- Zero upfront cost IT model — I-World designs, finances, builds, supports, and upgrades
- Single monthly subscription covering all IT needs
- Bundled services with zero capital expenditure for the client
- Services include: internet, networking, security, cloud, voice, monitoring, and support

---

*This PRD is a living document. Updates will be made as requirements are refined during implementation.*
