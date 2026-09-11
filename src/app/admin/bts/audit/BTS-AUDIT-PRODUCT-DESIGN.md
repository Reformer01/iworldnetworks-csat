# BTS Audit — Product Design Analysis

**Date:** August 28, 2026
**Scope:** Feature spec, component design system, user journey maps, roadmap
**Primary pain:** No actionable insights — the page shows data but doesn't help you *do* anything with it

---

## 1. User Journey Maps

### Persona A: Emeka — NOC Engineer (Network Operations)

**Goal:** Quickly identify towers with device outages and stale syncs so I can dispatch field techs.

```
STAGE:      ARRIVE         SCAN           DIAGNOSE        ACT            FOLLOW-UP
Actions:    Opens page     Scans cards     Clicks tower    Notes issue    Checks later
            Looks at KPIs  Filters search  Reads modal     Writes ticket  Exports CSV
Touchpoint: Sidebar nav    Tower cards     Detail modal    Paper/Excel    Same page
Emotion:    Focused        Anxious        Overwhelmed     Frustrated     Unsatisfied
Pain point: No alert for   Too many        Modal shows     No way to      No history —
            what's broken  cards, can't    raw data,       create ticket  can't tell if
                          spot problems   no guidance      from page      issue recurred
Opportunity: Alert banner  "Needs         Actionable      Inline task    Trend sparklines
             for stale/    attention"     recommendations creation      & incident log
             down towers   filter         ("check X")     (not CSV)
```

**Emotion Curve:** 😐 → 😟 → 😫 → 😤 → 😐

**Key insight:** Emeka doesn't want to *see* data — he wants to know **what to do next**. The current page is a spreadsheet dressed as a dashboard.

---

### Persona B: Aisha — Sales Analyst (Revenue Team)

**Goal:** Understand which towers drive the most MRR and where there's untapped revenue potential.

```
STAGE:      ARRIVE         ANALYZE         COMPARE         INSIGHT        EXPORT
Actions:    Opens page     Reads KPIs      Compares towers Calculates     Downloads
            Checks totals  Sorts by MRR    across regions  revenue gaps   report
Touchpoint: Sidebar nav    KPI cards       Tower cards     Her own brain   CSV export
Emotion:    Curious        Engaged         Confused        Frustrated     Resigned
Pain point: No "top        Can't sort      No comparison   No auto-        CSV is raw
            towers" view   by MRR or       mode — must     calculated     data — no
                          customers       open each one   revenue gap     summary
Opportunity: Summary       Sort controls   Side-by-side    "Revenue        Pre-formatted
             leaderboard   on all cards    comparison      opportunity"   report with
             at top                       view            metric          totals
```

**Emotion Curve:** 🙂 → 🤔 → 😕 → 😞 → 😐

**Key insight:** Aisha wants to **compare and rank** towers, but the page treats all towers equally. She ends up exporting CSV to Excel every time.

---

## 2. Feature Spec

### 2.1 Current State (What Exists)

| Feature | Status | Quality |
|---------|--------|---------|
| Tower card grid (3-col) | ✅ Built | Good — 3-tier hierarchy |
| KPI summary bar (5 cards) | ✅ Built | Good — towers, customers, active, MRC |
| Search by name/region | ✅ Built | Good — real-time filter |
| Show empty towers toggle | ✅ Built | Basic |
| CSV export | ✅ Built | Raw data, no summary |
| Detail modal | ✅ Built | Functional but dense |
| Refresh button | ✅ Built | Basic |
| Toast notifications | ✅ Built | Good |
| Keyboard: Escape to close | ✅ Built | Basic |

### 2.2 Missing Features (What Hurts)

#### 🔴 Critical (Blocks core jobs)

| # | Feature | Why it's missing | Impact |
|---|---------|------------------|--------|
| F1 | **"Needs Attention" filter** | No way to see only problematic towers | Users must scan all 100+ cards |
| F2 | **Sort controls** | Cards are in API order | Can't find top/bottom towers |
| F3 | **Revenue opportunity metric** | `mrrTotal - activeMrr` exists in data but not surfaced | Users do mental math |
| F4 | **Tower comparison mode** | No side-by-side view | Must open/close modal repeatedly |
| F5 | **Incident history** | `lastSyncAt` is the only timestamp | Can't tell if outages are new or recurring |

#### 🟡 Important (Improves experience significantly)

| # | Feature | Why it's missing | Impact |
|---|---------|------------------|--------|
| F6 | **Alert banner for critical towers** | No proactive notification | Users miss emergencies |
| F7 | **Sort by any metric** | Not implemented | Can't rank towers |
| F8 | **Pre-formatted export report** | CSV is raw data | Sales team re-formats in Excel |
| F9 | **Tower health score** | Not calculated | No at-a-glance quality indicator |
| F10 | **Customer count sparkline** | Not tracked | Can't see growth/decline trends |

#### 🟢 Nice-to-have (Polish & delight)

| # | Feature | Why it's missing | Impact |
|---|---------|------------------|--------|
| F11 | **Map view** | Not built | Spatial understanding of tower network |
| F12 | **Pin/favorite towers** | Not built | Power users lose their go-to towers |
| F13 | **Keyboard navigation** | Only Escape works | Can't scan cards without mouse |
| F14 | **Dark mode for cards** | Theme system exists, cards not updated | Night shift readability |
| F15 | **Bulk actions** | Not built | Can't export/print/select multiple |

---

### 2.3 Feature Specifications

#### F1: "Needs Attention" Filter

**User story:** As a NOC engineer, I want to see only towers that need my attention, so I don't waste time scanning healthy towers.

**Definition of done:**
- Toggle button: "⚠️ Needs Attention" in toolbar
- When active, shows only towers where:
  - `deviceOutageCount > 0` (device down), OR
  - `status === 'disabled' || status === 'down'` (tower down), OR
  - `suspended === true` (tower suspended), OR
  - `lastSyncAt` is >24 hours old (stale sync), OR
  - `mrrPercentage < 50%` (low MRR utilization — revenue risk)
- Each card shows a red/orange badge explaining *why* it needs attention
- Count shown: "12 towers need attention"
- Combines with search filter

**Effort:** 3-4 hours

---

#### F2: Sort Controls

**User story:** As a sales analyst, I want to sort towers by MRR, customer count, or sync time, so I can quickly find the biggest/smallest towers.

**Definition of done:**
- Dropdown in toolbar: "Sort by" with options:
  - Name (A-Z / Z-A) — default
  - Customers (high-low / low-high)
  - MRR (high-low / low-high)
  - Active MRR (high-low / low-high)
  - Last sync (newest / oldest)
  - Device outages (most first)
- Sort indicator on active column
- Sort persists across page refreshes (localStorage)

**Effort:** 2-3 hours

---

#### F3: Revenue Opportunity Metric

**User story:** As a sales analyst, I want to see how much revenue is being left on the table at each tower, so I can prioritize upsell efforts.

**Definition of done:**
- Calculate: `opportunity = mrrTotal - activeMrr` (potential MRR minus active MRR)
- Display on card as a third metric row: "₦200K opportunity"
- Color-coded: red if >₦500K, amber if >₦100K, green if <₦100K
- Show in KPI summary: total opportunity across all towers
- Show in detail modal: opportunity per account type

**Effort:** 2-3 hours

---

#### F4: Tower Comparison Mode

**User story:** As a user, I want to compare 2-3 towers side-by-side, so I can make decisions about resource allocation.

**Definition of done:**
- "Compare" checkbox on each card (multi-select)
- When 2+ towers selected, floating "Compare (N)" button appears
- Click opens a comparison table:
  - Columns: one per selected tower
  - Rows: all metrics (customers, MRR, devices, sync, account types)
  - Delta indicators: which tower is better/worse for each metric
- Side-by-side on desktop, stacked on mobile
- Escape or "Done" to exit comparison

**Effort:** 6-8 hours

---

#### F5: Incident History

**User story:** As a NOC engineer, I want to see if a tower has had recurring issues, so I can escalate chronic problems.

**Definition of done:**
- Track: last 5 sync timestamps, last status changes, device outage history
- Display in detail modal as a timeline:
  ```
  📅 Aug 28, 10:00 — Status: Active (synced)
  📅 Aug 27, 14:30 — Device outage: 3 devices down
  📅 Aug 26, 09:00 — Status: Active (synced)
  📅 Aug 25, 11:15 — Device outage: resolved (2 devices)
  ```
- "Chronic" badge if >3 incidents in 7 days
- Requires backend: store audit snapshots in database

**Effort:** 8-12 hours (requires new DB table + scheduler)

---

#### F6: Alert Banner

**User story:** As a NOC engineer, I want to see a summary alert when I open the page, so I know immediately if something is wrong.

**Definition of done:**
- Banner at top of page (below KPIs) when critical conditions exist:
  - 🔴 Red: Any tower has `status === 'down'` or `deviceOutageCount > 5`
  - 🟡 Amber: Any tower has `lastSyncAt > 24h` or `suspended === true`
  - 🟢 Green: "All towers healthy" (no issues)
- Banner shows count: "3 towers with device outages"
- Click banner to auto-filter to affected towers
- Dismissible (localStorage, reappears on reload)

**Effort:** 2-3 hours

---

#### F7: Pre-Formatted Export Report

**User story:** As a sales analyst, I want a formatted report I can share with management, not raw CSV data.

**Definition of done:**
- Two export options:
  1. "Export CSV" — raw data (current behavior)
  2. "Export Report" — formatted summary:
     - Summary section: total towers, total customers, total MRR, total opportunity
     - Top 10 towers by MRR
     - Bottom 10 towers by MRR
     - Towers needing attention list
     - Account type breakdown
- Export as CSV with headers, or generate PDF/HTML
- Include date stamp and filter context

**Effort:** 4-6 hours

---

#### F8: Tower Health Score

**User story:** As a user, I want a single number that tells me how healthy a tower is, so I can quickly prioritize.

**Definition of done:**
- Calculate composite score (0-100):
  - Device uptime: 40% weight (100% = all devices online)
  - MRR utilization: 30% weight (active/potential ratio)
  - Sync freshness: 20% weight (100% = synced in last hour)
  - Status: 10% weight (100% = active)
- Display as colored badge: 🟢 80-100, 🟡 50-79, 🔴 0-49
- Show on card: "Health: 87"
- Sort by health score option
- Show average health in KPI summary

**Effort:** 3-4 hours

---

## 3. Component Design System

### 3.1 Tower Card (Enhanced)

**Current state:** 3-tier hierarchy with account type bar chart.
**Enhanced spec:**

```
┌─────────────────────────────────────────┐
│ [●] Tower Name               [Suspended]│  ← Tier 1: Identity
│     Region                              │
├─────────────────────────────────────────┤
│ 127 Customers        ₦1.2M MRR         │  ← Tier 1: Primary metrics
│ 119 active           ₦980K active       │
├─────────────────────────────────────────┤
│ MRR Utilization        84%              │  ← Tier 1.5: Visual bar
│ ████████████████░░░░                    │
├─────────────────────────────────────────┤
│ 🟢 Health: 87          ⚠️ +₦200K opp.  │  ← NEW: Health + Opportunity
├─────────────────────────────────────────┤
│ [WiFi] 8 devices  [●] 2h ago Fresh     │  ← Tier 2: Context
├─────────────────────────────────────────┤
│ Account Mix                             │  ← Tier 3: Breakdown
│ ████████████░░░░░░                      │
│ ● Residential 65% ● Partners 35%       │
└─────────────────────────────────────────┘
```

**New elements:**
- **Health score badge:** Positioned top-right, colored circle with number
- **Revenue opportunity:** Shown below MRR if `mrrTotal > activeMrr`
- **Attention badge:** Red/orange badge if tower needs attention (replaces health score when critical)

**States:**
| State | Visual Treatment |
|-------|-----------------|
| Default | White card, border-border/60 |
| Hover | border-secondary, shadow-lg |
| Focused | ring-2 ring-secondary |
| Needs Attention | border-l-4 border-l-red-500, red badge |
| Selected (comparison) | border-secondary, checkmark overlay |

---

### 3.2 Attention Badge

**Purpose:** Immediately communicates *why* a tower needs attention.

**Variants:**
| Variant | Color | Icon | Text | Trigger |
|---------|-------|------|------|---------|
| Device Down | `bg-red-50 text-red-600 border-red-200` | WifiOff | "2 devices down" | `deviceOutageCount > 0` |
| Tower Down | `bg-red-50 text-red-600 border-red-200` | AlertTriangle | "Tower down" | `status === 'disabled'` |
| Suspended | `bg-red-50 text-red-600 border-red-200` | Pause | "Suspended" | `suspended === true` |
| Stale Sync | `bg-amber-50 text-amber-600 border-amber-200` | Clock | "Sync stale" | `lastSyncAt > 24h` |
| Revenue Gap | `bg-orange-50 text-orange-600 border-orange-200` | TrendingDown | "₦200K gap" | `mrrTotal - activeMrr > 100K` |

---

### 3.3 Health Score Badge

**Purpose:** Single-number quality indicator for at-a-glance assessment.

**Calculation:**
```
healthScore = (
  deviceUptime * 0.40 +      // (deviceCount - outages) / deviceCount * 100
  mrrUtilization * 0.30 +     // activeMrr / mrrTotal * 100
  syncFreshness * 0.20 +      // 100 if <1h, 75 if <6h, 50 if <24h, 25 if <7d, 0 if >7d
  statusScore * 0.10          // 100 if active, 50 if unknown, 0 if disabled/down
)
```

**Visual:**
```
┌──────────┐
│    87    │  ← Number in circle
│  ● ● ●   │  ← Ring: green if ≥80, amber if ≥50, red if <50
└──────────┘
```

**Position:** Top-right of card, next to tower name.

---

### 3.4 Sort Dropdown

**Purpose:** Allow users to reorder tower cards by any metric.

**Spec:**
```
┌─────────────────────────┐
│ Sort by: [Last Sync ▼]  │
├─────────────────────────┤
│ ○ Name (A → Z)          │
│ ● Last Sync (newest)    │  ← active
│ ○ Customers (most)      │
│ ○ MRR (highest)         │
│ ○ Health (best)         │
│ ○ Device Outages (most) │
└─────────────────────────┘
```

**Behavior:**
- Dropdown in toolbar (next to search)
- Default: "Last Sync (newest)" — most useful for NOC
- Icon shows current sort direction
- Click toggles direction
- Persists in localStorage

---

### 3.5 Alert Banner

**Purpose:** Proactive notification of critical conditions.

**Spec:**
```
┌─────────────────────────────────────────────────────────┐
│ 🔴 3 towers with device outages  [Show affected →]     │
└─────────────────────────────────────────────────────────┘
```

**Variants:**
| Level | Color | Icon | Count | Action |
|-------|-------|------|-------|--------|
| Critical | `bg-red-50 border-red-200 text-red-700` | AlertTriangle | `deviceOutageCount > 0 || status === 'down'` | Click to filter |
| Warning | `bg-amber-50 border-amber-200 text-amber-700` | Clock | `lastSyncAt > 24h \|\| suspended` | Click to filter |
| Healthy | `bg-emerald-50 border-emerald-200 text-emerald-700` | CheckCircle2 | 0 issues | Static |

---

### 3.6 Comparison Table

**Purpose:** Side-by-side tower comparison.

**Spec:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ Tower Comparison (2)                                    [Done]      │
├──────────────────┬──────────────────┬──────────────────┬─────────────┤
│                  │ TOWER A          │ TOWER B          │ Delta       │
├──────────────────┼──────────────────┼──────────────────┼─────────────┤
│ Region           │ Sagamu           │ Ijebu-Ode        │ —           │
│ Customers        │ 127              │ 89               │ +38 ↑       │
│ Active           │ 119              │ 85               │ +34 ↑       │
│ MRR              │ ₦1.2M            │ ₦890K            │ +₦310K ↑    │
│ Active MRR       │ ₦980K            │ ₦720K            │ +₦260K ↑    │
│ Opportunity      │ ₦220K            │ ₦170K            │ +₦50K       │
│ Health           │ 87 🟢            │ 72 🟡            │ +15 ↑       │
│ Devices          │ 8 (0 down)       │ 6 (2 down)       │ +2, -2 ↓    │
│ Last Sync        │ 2h ago           │ 18h ago           │ Fresh ✓     │
│ Account Mix      │ Res 65%          │ Res 80%           │ —           │
└──────────────────┴──────────────────┴──────────────────┴─────────────┘
```

**Behavior:**
- Floating panel (bottom sheet on mobile)
- Max 3 towers
- Delta column shows difference with ↑/↓ arrows
- Green if tower A is better, red if worse, neutral if equal

---

### 3.7 Revenue Opportunity KPI

**Purpose:** Surface the total revenue gap across all towers.

**Spec:**
```
┌─────────────────────────────────────┐
│ 💡 Revenue Opportunity              │
│ ₦2.4M                              │  ← Total gap (potential - active)
│ 12 towers with gaps >₦100K         │  ← Context
└─────────────────────────────────────┘
```

**Position:** 6th KPI card (new row or extend existing grid).

---

## 4. Prioritized Roadmap

### Phase 1: Quick Wins (1-2 days) — *Fix the "no insight" problem*

| # | Feature | Effort | Impact | Effort:Impact |
|---|---------|--------|--------|---------------|
| F3 | Revenue opportunity metric | 2-3h | 🔴 High | ⭐⭐⭐ |
| F6 | Alert banner for critical towers | 2-3h | 🔴 High | ⭐⭐⭐ |
| F1 | "Needs Attention" filter | 3-4h | 🔴 High | ⭐⭐⭐ |
| F2 | Sort controls | 2-3h | 🟡 Medium | ⭐⭐ |

**Total:** 9-13 hours

**Why first:** These four features transform the page from "spreadsheet" to "dashboard." Users immediately see what needs attention and can act on it.

---

### Phase 2: Power Features (3-5 days) — *Enable comparison and reporting*

| # | Feature | Effort | Impact | Effort:Impact |
|---|---------|--------|--------|---------------|
| F8 | Tower health score | 3-4h | 🟡 Medium | ⭐⭐ |
| F7 | Pre-formatted export report | 4-6h | 🟡 Medium | ⭐⭐ |
| F4 | Tower comparison mode | 6-8h | 🟡 Medium | ⭐ |

**Total:** 13-18 hours

---

### Phase 3: Intelligence (1-2 weeks) — *Add history and trends*

| # | Feature | Effort | Impact | Effort:Impact |
|---|---------|--------|--------|---------------|
| F5 | Incident history (requires DB) | 8-12h | 🟡 Medium | ⭐ |
| F10 | Customer count sparklines | 4-6h | 🟢 Low | ⭐ |

**Total:** 12-18 hours

---

### Phase 4: Polish (1 week) — *Nice-to-haves*

| # | Feature | Effort | Impact | Effort:Impact |
|---|---------|--------|--------|---------------|
| F13 | Keyboard navigation (↑↓ Enter) | 3-4h | 🟢 Low | ⭐ |
| F14 | Dark mode for cards | 2-3h | 🟢 Low | ⭐ |
| F12 | Pin/favorite towers | 3-4h | 🟢 Low | ⭐ |
| F15 | Bulk actions (export selected) | 4-6h | 🟢 Low | ⭐ |

**Total:** 12-17 hours

---

### Phase 5: Future (Backlog)

| # | Feature | Effort | Impact | Effort:Impact |
|---|---------|--------|--------|---------------|
| F9 | Map view | 15-20h | 🟢 Low | ⭐ |
| F11 | Trend sparklines (30-day) | 6-8h | 🟢 Low | ⭐ |

**Total:** 21-28 hours

---

## 5. Complete Effort Estimate

| Phase | Hours | Days (1 dev) | Priority |
|-------|-------|--------------|----------|
| Phase 1: Quick Wins | 9-13h | 1.5-2 days | 🔴 Do first |
| Phase 2: Power Features | 13-18h | 2-3 days | 🟡 Next |
| Phase 3: Intelligence | 12-18h | 2-3 days | 🟢 Later |
| Phase 4: Polish | 12-17h | 2-3 days | ⚪ Backlog |
| Phase 5: Future | 21-28h | 3-4 days | ⚪ Backlog |
| **Total** | **67-94h** | **10-15 days** | |

---

## 6. Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Time to identify problematic tower | ~60s (scan all) | <10s (filter/alert) | Usability test |
| Export frequency | Every session | 1x/week (insights in-app) | Analytics |
| "Needs attention" filter usage | N/A | 60% of sessions | Analytics |
| Sort usage | N/A | 40% of sessions | Analytics |
| Tower comparison usage | N/A | 20% of sessions | Analytics |
| SUS score | Unknown | >80 | Survey |
| CSV export quality | Raw data | Formatted report | User feedback |

---

## 7. Open Questions for You

1. **Incident history (F5):** Do you want to store historical snapshots in the database? This requires a new `TowerAuditSnapshot` table and a scheduler. Or is `lastSyncAt` enough for now?

2. **Map view (F9):** Do you have GPS coordinates for towers? If not, this feature requires importing location data from UISP.

3. **Comparison limit:** Should users compare 2 towers or up to 3? More towers = more complex UI.

4. **Export format:** CSV only, or do you want PDF/HTML reports too?

5. **Health score weights:** Are the proposed weights (40% devices, 30% MRR, 20% sync, 10% status) reasonable? Or should some factors matter more?

---

*Generated by Product Designer skill*
*Analysis based on user interviews (simulated), codebase review, and heuristic evaluation*
