# I-World Networks — Admin Hub Training Script (Master Guide)

**Audience:** Departmental heads and staff
**Presenter:** Super Admin
**Format:** 60–75 minute session, screens projected live
**Prerequisite before the session:** demo data seeded, staff accounts created (see Section 1), indexes deployed

---

## Session Outline

| # | Block | Minutes | Audience |
|---|-------|---------|----------|
| 1 | How users get accounts & roles | 10 | Everyone |
| 2 | Login & navigation | 5 | Everyone |
| 3 | Dashboard / Overview | 5 | Everyone |
| 4 | Sales department walkthrough | 15 | Sales + all |
| 5 | Support department walkthrough | 10 | Support + all |
| 6 | Field Operations (BTS/Installation) | 10 | Field + all |
| 7 | Billing & Support Revenue | 5 | Billing + all |
| 8 | Shared tools (Stability, Staff, Testimonials, Manage Data) | 5 | Everyone |
| 9 | Q&A + hands-on | 10 | Everyone |

---

## 1. How Staff Get Accounts (Super Admin Only — before training)

The Admin Hub has **no self-registration**. Access is granted by a super admin, and there is no in-app "add user" button. Accounts are created in the **Firebase console** (the authentication backend), then the staff member signs in at the admin login page.

### Steps to add a new user

1. Open the **Firebase Console** → project **`i-world-networks-csat`**.
2. Go to **Build → Authentication → Users** tab.
3. Click **Add user**.
4. Enter the staff member's **corporate email** (`name@iworldnetworks.net` — only this domain is allowed) and a **temporary password** (e.g. `Welcome@2026`).
5. Click **Add user**.
6. Give the person their email + temporary password (WhatsApp or printed). Tell them the admin URL.
7. The person signs in, then **verifies their email** using the link shown on screen (or "Request New Verification Link" on the login page).
8. Once verified, they land on the Admin Dashboard. Done.

### Important: how roles actually work

- **Anyone** with a verified `@iworldnetworks.net` account can sign in and see all pages.
- **Super Admin / Editor** are not database users — they are a hardcoded email list in `src/lib/admin-config.ts`:

```
SUPER_ADMIN_EMAILS = reformer.ejembi@..., jeffery.udoji@...
EDITOR_EMAILS      = jeffery.udoji@..., titilade.bakare@...
```

- These lists only control **special buttons** (e.g. deleting records / managing revenue entries). To grant that power to someone, their email must be added to this file and the app redeployed — a developer task, not a UI task.

### Handling passwords & lockouts

- Forgot password: **Firebase Console → Authentication → Users → (user) → Reset password**. The app login page has no reset form, so this is the reset path.
- A user who can't get in usually has an **unverified email** — the login screen will say so and offer to resend the verification link.

---

## 2. Login & Navigation

**Presenter:** open `/admin/login`, sign in live.

1. URL: the Admin Hub is at the admin path of the deployed site (dev: `http://localhost:9002/admin/login`).
2. Sign in with corporate email + password (set by super admin).
3. First-time flow: **verify email** → dashboard.
4. Left sidebar = all modules. On mobile, the hamburger menu on the top right opens the same list.
5. Logout is top-right, "Logout".
6. "Public Portal" link at the top returns to the public customer site.

---

## 3. Dashboard / Overview (all staff)

- Everything is driven by **customer feedback submissions** (public feedback form + Splynx webhook feedback).
- Time-range picker: Last 7 Days / 30 Days / Quarter / Year or a custom range.
- Read the **Key Metrics row**: Overall Satisfaction %, Network Satisfaction %, Net Promoter Score, First Contact Resolution, Resolution Rate, Total Responses.
- **Department Breakdown** table: submissions, average rating, resolved count per department.
- **Regional Breakdown**: Ibadan, Abeokuta, Akure, Osogbo — share of submissions.
- **Status updates**: click any feedback to mark it Resolved / In Progress etc. and add resolution notes.
- **PDF Report** button: generates a branded landscape PDF (metrics + department + region + full submissions) for sharing in meetings.

**Department heads:** this is your weekly source-of-truth for "how is my team doing in the customers' eyes."

---

## 4. Sales Department (Sales + BTS Audit)

URLs (also grouped under the Sales sidebar): Dashboard, Monthly Revenue, BTS Audit, BTS Data, Records, Import Data, Targets.

### 4.1 Sales KPIs (`/admin/sales`)
- Overall metrics: total records, active/inactive/blocked counts, MRR/ARPU, region metrics, per-agent breakdowns.
- Segment tables: HOME / SME / ENTERPRISE / NEIGHBOURHOOD / MANAGED_SERVICES with active counts and MRR.
- BTS (business-to-something) roll-up and agent×segment cross-table.

### 4.2 Monthly Revenue (`/admin/sales/monthly-revenue`)
- Revenue by month: MRR, NRC, new customers, churn — filterable by region / segment / agent.
- Use the metric switch (revenue, MRR, customers) and the monthly table at the bottom.

### 4.3 Records (`/admin/sales/records`)
- Search, filter by region / status / agent, paginated list.
- **Add** a sales record manually (form with validation — errors highlight the offending field).
- **Edit / Delete** per row; delete asks for confirmation.
- **Export CSV / PDF** buttons (top-right).
- Super Admin / Titilade see an extra delete path — this is the hardcoded role list in action.

### 4.4 Import Data (`/admin/sales/import`)
- Upload a spreadsheet to bulk-load sales records (auto-maps account status and segment from plan codes).
- Check import preview for mapping warnings before committing.
- Every import creates an `importBatchId` — used to filter/roll back a batch in Records.

### 4.5 Targets (`/admin/sales/targets`)
- Set/update monthly sales targets per agent/region.
- Used for comparing actuals vs targets in KPIs.

### 4.6 BTS Audit (`/admin/bts/audit`)
- **Add BTS Audit Record** button opens the form: BTS name, address, status, region, audit period (defaults to current week).
- Filter by status / region / period; search.
- Edit / delete per record (row actions).
- **Audit period is the current ISO week** (e.g. 2026-W32) — records land under the active period automatically.

### 4.7 BTS Data (`/admin/bts/import`)
- Import customer site lists for BTS planning (region-filtered).
- **Import History** section shows past uploads and lets you review/roll back a batch.

---

## 5. Support Department (Support + Support Revenue)

### 5.1 Support (`/admin/support`)
- **Staff KPIs**: pick period (week/month/quarter). Each support agent's volume (assigned/resolved/escalated/reopened), time metrics (avg resolution/first response/assign), quality metrics (SLA compliance, first-contact resolution, CSAT), workload.
- **Team averages** panel compares each agent against the team.
- **Feedbacks tab**: support-category customer feedback with ratings (professionalism, clarity, responsiveness, knowledge).
- The KPI data is calculated from tickets and feedback; if Firestore indexes are missing, the page shows a 412-style error with the fix message.

### 5.2 Support Revenue (`/admin/support-revenue`)
- Revenue records for support engagements (project type, amount, dates).
- Filter by project type; **Add/Edit/Delete** records (delete restricted to Super Admin).
- Drives the revenue totals shown to management.

---

## 6. Field Operations (Field Support, Installation, BTS)

### 6.1 Field Support (`/admin/field-support`)
- Repair volume analytics per technician/region.
- Customer sentiment from FieldSupport feedback category.

### 6.2 Installation (`/admin/installation`)
- Installation performance: volumes, time-to-complete, ratings from Installation feedback.

### 6.3 BTS Audit & BTS Data
- Same as Section 4.6 / 4.7 — field team contributes audit records and site data; sales KPI page reads BTS roll-ups.

---

## 7. Billing (`/admin/billing`)

- Billing overview KPIs (outstanding, issues) and **Billing Issues** list.
- Driven by Billing-category feedback: customers reporting billing problems land here with ratings.
- Mark issues resolved from the dashboard status workflow.

---

## 8. Shared Tools

### 8.1 Stability (`/admin/stability`)
- Network stability signals from Reliability feedback (e.g. "Infrastructure v4.2" telemetry view) — uptime percentages, latency (ms).

### 8.2 Staff Performance (`/admin/staff`)
- Per-staff drill-down: pick a person from the roster (support agents, back-end support, billing agents, field technicians with regions).
- Their KPIs and trend comparisons. NOTE: this roster (`src/lib/staff.ts`) is **display data only** — it is not linked to login accounts.

### 8.3 Testimonials / Success Stories (`/admin/testimonials`)
- Approved positive feedback shown as customer success stories.

### 8.4 Manage Data — Data Management Center (`/admin/crud`)
- Full feedback record manager: search, filter by department / region / status / date.
- **Create / Edit / Delete** feedback records (used to fix bad entries or add missing ones; delete is privileged).
- Same validation rules as the public form.

---

## 9. Per-Department Cheat Sheet

| Department | Pages they should care about | Their main action |
|---|---|---|
| Sales | Sales KPIs, Monthly Revenue, Records, Import, Targets, BTS Audit, BTS Data | Import/enter sales, set targets, run audits |
| Support | Support (KPIs + feedback), Support Revenue | Review KPIs, mark feedback resolved |
| Field Operations | Field Support, Installation, BTS Audit, BTS Data | Add audit records, review install/repair stats |
| Billing | Billing, Support Revenue | Review issues, resolve billing feedback |
| All staff | Dashboard, Stability, Staff, Testimonials, Manage Data | Monitor, report, clean data |

---

## Presenter Notes / Do's and Don'ts

- **Do** create the users (Section 1) before the session and have their temporary passwords ready.
- **Do** open the seeded demo data so every page has content — the demo seed covers BTS audit, sales, targets, tickets, feedbacks, support revenue.
- **Do** pre-run a PDF export once (it's lazy-loaded, first click can be slow).
- **Don't** show the Firebase console beyond the Authentication section — the rest is irrelevant to trainees.
- **Don't** create "admin" accounts outside the `@iworldnetworks.net` domain — they will be blocked at login.
- **Reminder:** roles/special buttons are code-defined; tell staff that role changes go through the super admin + a developer, not the UI.
