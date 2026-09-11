# Engagement & Reachout Log — Product Design Analysis

**Date:** August 28, 2026
**Scope:** Full product brief — journey maps, feature spec, component design, roadmap
**Core pain:** No way for staff to add new logs manually; page is review-only

---

## 1. System Inventory

### What Exists Today

| Feature | Component | Status | Quality |
|---------|-----------|--------|---------|
| KPI stats bar | `EngagementPage` | ✅ Built | Good — contacted today, follow-ups, high risk, total |
| Call outcomes chart | `EngagementPage` | ✅ Built | Functional — bar chart with click-to-filter |
| Retention risk chart | `EngagementPage` | ✅ Built | Functional — risk distribution with percentages |
| Staff filter pills | `EngagementPage` | ✅ Built | Good — shows count per agent |
| Search + filters | `EngagementPage` | ✅ Built | Search, call status, risk, date range |
| Log table | `EngagementPage` | ✅ Built | Click to edit — 9 columns |
| Edit dialog | `EditLogDialog` | ✅ Built | 12 fields — comprehensive |
| CSV export | `exportCsv` | ✅ Built | Full filtered export |
| PDF export | `exportPdf` | ✅ Built | Landscape with charts |
| POST endpoint | `POST /api/admin/engagement` | ✅ Built | Creates new logs |
| PATCH endpoint | `PATCH /api/admin/engagement/[id]` | ✅ Built | Updates existing logs |

### What's Missing

| Feature | Impact | Effort |
|---------|--------|--------|
| **Add new log UI** | 🔴 High — POST exists but no UI | Medium |
| Quick-log (phone call shortcut) | 🔴 High — agents need fast logging | Low |
| Bulk import from CSV | 🟡 Medium — seed historical data | Medium |
| Customer autocomplete | 🟡 Medium — no way to link to existing customer | Low |
| Log history per customer | 🟡 Medium — can't see past interactions | Medium |
| Mobile-optimized form | 🟡 Medium — agents log on phones | Medium |
| Activity feed / timeline | 🟢 Low — nice to have | Medium |
| Assign follow-ups to others | 🟢 Low — collaboration feature | Low |

---

## 2. User Journey Maps

### Persona A: Tunde — Field Support Agent

**Goal:** Log a customer call quickly after each interaction so my manager can track progress.

```
STAGE:      RECEIVE CALL    MAKE CALL       LOG RESULT      FOLLOW-UP      END OF DAY
Actions:    Gets assigned   Calls customer  Opens page      Sets next      Reviews
            ticket or       (2-5 min)       Finds customer  follow-up      daily log
            picks up phone                  (30-60 sec)     date
Touchpoint: Phone/ticket    Phone           /admin/engagement Phone         Same page
Emotion:    Annoyed         Hopeful         Frustrated      Anxious        Tired
Pain point: No way to       —               Must find       Can't set      No summary
            quick-log       —               customer in     reminder for   of what I
            from phone      —               big table       myself         accomplished
Opportunity: SMS/WhatsApp   —               Auto-populate   Calendar       Daily digest
             quick-log      —               form from       integration    email
                            —               ticket/customer
```

**Emotion Curve:** 😒 → 🙂 → 😤 → 😟 → 😐

**Key insight:** Tunde makes 15-20 calls per day. Each time, he has to navigate to the engagement page, find the customer in a table of 500+, click to open the edit dialog, fill in 12 fields, and save. This takes 2-3 minutes per call — **30-60 minutes of logging per day** that could be 5 minutes with a quick-log feature.

---

### Persona B: Grace — Support Manager

**Goal:** Monitor team performance, identify at-risk customers, and generate reports for management.

```
STAGE:      MORNING REVIEW   MONITOR         INTERVENE        REPORT         WEEKLY
Actions:    Checks stats     Watches for     Reassigns        Generates      Presents
            for yesterday    anomalies       high-risk        CSV/PDF        to leadership
Touchpoint: /admin/engagement Same page      Slack/phone      Export button  Meeting
Emotion:    Curious          Anxious         Urgent           Frustrated     Resigned
Pain point: Can't see        No alerts       No way to        No auto-       No analytics
            "yesterday vs    when risk       assign tasks     generated      dashboard —
            today" trend     increases       to specific      reports        exports to
                            —               agents                         Excel
Opportunity: Trend           Anomaly         Task assignment  Scheduled      Built-in
             comparison      detection       with deadline    reports        analytics
```

**Emotion Curve:** 🤔 → 😕 → 😤 → 😞 → 😐

**Key insight:** Grace spends 30 minutes every morning manually comparing yesterday's stats to last week's. She has no way to see trends, detect anomalies, or auto-generate the weekly report she presents to leadership.

---

## 3. Feature Spec

### 3.1 Add New Log Form (Priority: 🔴 Critical)

**User story:** As a support agent, I want to log a new call/engagement manually, so I don't lose track of interactions.

**Definition of done:**
- "Add Log" button in the header (next to export buttons)
- Opens a dialog/modal with:
  - **Customer name** (text input, autocomplete from Customer table)
  - **Phone** (auto-filled from customer record)
  - **BTS/Site** (auto-filled from customer record)
  - **Account status** (auto-filled: Active/Inactive)
  - **Plan** (auto-filled from customer record)
  - **Call status** (required: Contacted, No Answer, Not reachable, Switched Off, Busy, Wrong Number)
  - **Purpose** (dropdown: Relationship Building, Follow-Up, Complaint Resolution, Upsell, Win-Back, Other)
  - **Last contact** (date, defaults to today)
  - **Next follow-up** (date, optional)
  - **Feedback** (textarea)
  - **Complaint** (text input)
  - **Resolution** (text input)
  - **Upsell note** (textarea)
  - **Retention risk** (dropdown: Low, Medium, High)
- On save: creates new EngagementLog via POST endpoint
- Toast notification: "Log saved for [customer name]"
- Auto-sets `staffName` to current user's name
- Customer autocomplete searches by name, shows BTS and plan in dropdown

**Effort:** 6-8 hours

---

### 3.2 Quick-Log Shortcut (Priority: 🔴 Critical)

**User story:** As a field agent, I want to log a call in <30 seconds without filling 12 fields.

**Definition of done:**
- Keyboard shortcut: `Ctrl+Shift+L` opens quick-log
- Quick-log form (minimal):
  - **Customer name** (autocomplete, required)
  - **Call status** (required)
  - **Feedback** (optional textarea)
  - **Retention risk** (optional)
- Auto-fills: today's date, current user as staff, phone/BTS from customer record
- Save + close in one action
- "Advanced edit" link opens full form if needed
- Works on mobile (large touch targets)

**Effort:** 3-4 hours

---

### 3.3 Customer Autocomplete (Priority: 🟡 Important)

**User story:** As an agent, I want to search for customers by name and auto-fill their details.

**Definition of done:**
- Search input queries `/api/admin/customers?search=...`
- Dropdown shows: customer name, phone, BTS, plan, status
- Selecting a customer auto-fills: phone, BTS, account status, plan, region
- If customer not found: option to "Create new log for [name]"
- Debounced search (300ms)
- Shows max 10 results

**Effort:** 3-4 hours

---

### 3.4 Customer History Panel (Priority: 🟡 Important)

**User story:** As a manager, I want to see all past interactions with a customer before deciding what to do next.

**Definition of done:**
- Click customer name in table → opens side panel
- Panel shows:
  - Customer info (name, phone, BTS, plan, status)
  - Timeline of all engagement logs (newest first)
  - Each entry: date, call status, feedback, complaint, resolution, staff name
  - "Add new log" button at top
- Timeline shows: last 10 interactions
- Can scroll/paginate for older records

**Effort:** 4-6 hours

---

### 3.5 Mobile-Optimized Form (Priority: 🟡 Important)

**User story:** As a field agent, I want to log calls on my phone without zooming or horizontal scrolling.

**Definition of done:**
- Full-screen modal on mobile (not centered dialog)
- Stacked form fields (not grid)
- Large touch targets (48px minimum)
- Auto-focus first field
- Save button sticky at bottom
- Keyboard-friendly (Enter to save)

**Effort:** 4-6 hours

---

### 3.6 Bulk CSV Import (Priority: 🟡 Important)

**User story:** As a manager, I want to import historical call logs from spreadsheets.

**Definition of done:**
- "Import CSV" button on the page
- Upload dialog with:
  - CSV preview (first 10 rows)
  - Column mapping (drag to match)
  - Validation errors highlighted
  - "Import X records" button
- Required columns: customerName, callStatus, lastContactAt
- Optional columns: phone, btsName, feedback, complaint, retentionRisk
- Staff name auto-set to uploader or specified in CSV
- Deduplication: skip if same customer + date + staff already exists

**Effort:** 8-10 hours

---

### 3.7 Trend Comparison Dashboard (Priority: 🟢 Nice-to-have)

**User story:** As a manager, I want to see this week vs last week, this month vs last month.

**Definition of done:**
- New "Trends" tab in the stats section
- Line chart: daily contacted count (last 30 days)
- Bar chart: this week vs last week by call status
- Table: daily breakdown with deltas
- Date range picker for custom comparison
- Export trend data to CSV

**Effort:** 10-12 hours

---

### 3.8 Anomaly Alerts (Priority: 🟢 Nice-to-have)

**User story:** As a manager, I want to be notified when something unusual happens.

**Definition of done:**
- Banner when:
  - Contacted today < 50% of 7-day average
  - High-risk customers increased by >20%
  - Follow-ups overdue > 10
- Email notification for critical anomalies
- Configurable thresholds

**Effort:** 6-8 hours

---

## 4. Component Design System

### 4.1 Add Log Dialog (New)

**Purpose:** Create new engagement log entries.

```
┌─────────────────────────────────────────────────────────────┐
│ New Engagement Log                                          │
│                                                             │
│ Customer *                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search customer name...                              │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ Aisha Mohammed — Sagamu — Active — Residential     │ │ │
│ │ │ Chidi Okonkwo — Ijebu-Ode — Active — Enterprise    │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌──────────────┬──────────────┬──────────────┐             │
│ │ Phone        │ BTS / Site   │ Plan         │             │
│ │ 08012345678  │ Sagamu       │ 20Mbps       │ ← auto-filled│
│ └──────────────┴──────────────┴──────────────┘             │
│                                                             │
│ ┌──────────────┬──────────────┬──────────────┐             │
│ │ Call Status *│ Last Contact │ Next Follow-Up│             │
│ │ [Contacted ▼]│ [Today]      │ [Optional]   │             │
│ └──────────────┴──────────────┴──────────────┘             │
│                                                             │
│ Purpose                                                     │
│ [Follow-Up ▼]                                               │
│                                                             │
│ Customer Feedback                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ "Customer is happy with the service..."                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌──────────────┬──────────────┐                             │
│ │ Complaint    │ Resolution   │                             │
│ │ [Optional]   │ [Optional]   │                             │
│ └──────────────┴──────────────┘                             │
│                                                             │
│ Retention Risk                                              │
│ [Low ▼]                                                     │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Upsell / Cross-sell Opportunity                        │ │
│ │ "Customer asked about 50Mbps plan..."                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                          [Cancel]  [Save Log]              │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.2 Quick-Log Panel (New)

**Purpose:** Fast call logging (<30 seconds).

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Quick Log                              Agent: Tunde      │
│                                                             │
│ Customer *                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 Start typing customer name...                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Call Status *                                               │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│ │Contacted│ │No Answer│ │ Not     │ │ Switched│           │
│ │    ✓    │ │         │ │reachable│ │  Off    │           │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                             │
│ Quick Notes (optional)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Retention Risk                                              │
│ [  Low  ] [ Medium ] [  High  ]                            │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │              [ Save & Next ]                            │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Open full form →]                                          │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.3 Enhanced Stats Cards

**Current:** 4 cards (Contacted Today, Follow-Ups Due, High Risk, Total)
**Proposed:** 6 cards with trend indicators.

```
┌──────────────┬──────────────┬──────────────┐
│ Contacted    │ Follow-Ups   │ High Risk    │
│ Today        │ Due          │              │
│ 24           │ 8            │ 3            │
│ ↑ 12% vs avg │ ↓ 2 from yesterday │ ↑ 1   │
├──────────────┼──────────────┼──────────────┤
│ Total        │ Avg Calls/   │ Response     │
│ Customers    │ Day          │ Rate         │
│ 1,247        │ 18.5         │ 72%          │
└──────────────┴──────────────┴──────────────┘
```

---

### 4.4 Customer History Side Panel

**Purpose:** View all past interactions with a customer.

```
┌─────────────────────────────────────────────────────────────┐
│ Aisha Mohammed                              [Add Log] [✕]  │
│ Sagamu · 08012345678 · Active · 20Mbps Residential         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Aug 28 — Contacted — Follow-Up                             │
│ "Customer asked about upgrading to 50Mbps plan"             │
│ Risk: Medium · Agent: Tunde                                 │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ Aug 25 — Contacted — Win-Back                               │
│ "Called to check why customer hasn't renewed"               │
│ Complaint: Slow speed during peak hours                     │
│ Resolution: Escalated to network team                       │
│ Risk: High · Agent: Grace                                   │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ Aug 20 — No Answer                                         │
│ Risk: — · Agent: Tunde                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Prioritized Roadmap

### Phase 1: Quick Wins (1-2 weeks) — *Fix the "can't add logs" problem*

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Add new log dialog with customer autocomplete | 6-8h | 🔴 High |
| 2 | Quick-log shortcut (Ctrl+Shift+L) | 3-4h | 🔴 High |
| 3 | Customer autocomplete from Customer table | 3-4h | 🟡 Medium |

**Total:** 12-16 hours

---

### Phase 2: Core Improvements (2-3 weeks) — *Fix the "no history" problem*

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 4 | Customer history side panel | 4-6h | 🟡 Medium |
| 5 | Mobile-optimized form | 4-6h | 🟡 Medium |
| 6 | Bulk CSV import | 8-10h | 🟡 Medium |

**Total:** 16-22 hours

---

### Phase 3: Intelligence (2-3 weeks) — *Fix the "no insight" problem*

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 7 | Trend comparison dashboard | 10-12h | 🟡 Medium |
| 8 | Anomaly alerts (banner + email) | 6-8h | 🟢 Low |

**Total:** 16-20 hours

---

### Total Effort

| Phase | Hours | Days (1 dev) |
|-------|-------|--------------|
| Phase 1 | 12-16h | 2 days |
| Phase 2 | 16-22h | 3 days |
| Phase 3 | 16-20h | 3 days |
| **Total** | **44-58h** | **7-8 days** |

---

## 6. Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Time to log a call | 2-3 min (find + edit) | <30 sec (quick-log) | User timing |
| Logs per agent per day | Unknown (no way to add) | 15-20 | Database count |
| Customer history visibility | None | Full timeline | Feature usage |
| Mobile usability | Poor (zoom required) | Native-feel | SUS survey |
| Report generation | Manual CSV/PDF | Automated weekly | Feature usage |

---

## 7. Open Questions

1. **Customer autocomplete source:** Should it search the `Customer` table (unified) or the `BtsCustomer` table? The unified `Customer` table has more data.

2. **Staff name assignment:** Should new logs auto-assign to the current user, or should managers be able to log on behalf of agents?

3. **Import format:** Do you have existing CSV/spreadsheet data to import? What columns does it have?

4. **Alert delivery:** Should anomaly alerts be in-app banners only, or also email notifications?

5. **Follow-up scheduling:** Should follow-up dates auto-suggest based on call outcome (e.g., "No Answer" → suggest 3 days later)?

---

*Generated by Product Designer skill*
*Analysis based on codebase review, heuristic evaluation, and simulated user interviews*
