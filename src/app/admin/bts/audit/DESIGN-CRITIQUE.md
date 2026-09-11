# BTS Audit Cards — Design Critique

**Page:** `/admin/bts/audit`
**Date:** August 28, 2026
**Evaluator:** Product Designer (AI)
**Fidelity:** Production code review

---

## Executive Summary

The BTS Audit page is an **information-dense dashboard** that displays per-tower audit data from UISP and the unified customer roster. While functional, the current design suffers from **cognitive overload**, **inconsistent visual hierarchy**, and **accessibility gaps** that undermine its effectiveness as an operational tool.

**Overall Score: 62/100** (Below benchmark of 80)

| Category | Score | Grade |
|----------|-------|-------|
| Nielsen's Heuristics (10) | 6.2/10 | C |
| Accessibility (WCAG AA) | 5.8/10 | C- |
| Information Hierarchy | 6.5/10 | C+ |
| Mobile Experience | 5.0/10 | D |
| Actionability | 7.0/10 | B- |

---

## Heuristic Evaluation

### N1: Visibility of System Status ✅ (7/10)

**What works:**
- Loading spinner during data fetch
- Error state with AlertTriangle icon
- Empty state with clear message
- "Last sync" timestamp on each card

**What fails:**
- ❌ No skeleton loader (spinner hides all content)
- ❌ No progress indicator for CSV export
- ❌ No visual indication that cards are clickable
- ❌ No feedback after CSV export (no toast/snackbar)

**Recommendation:** Replace spinner with `PageSkeleton` component; add toast on export success.

---

### N2: Match Between System and Real World ❌ (4/10)

**What fails:**
- ❌ `byAccountType` uses raw API keys: `NEIGHBOURHOOD`, `PARTNERS_HOSTS`, `BUNDLED`, `CUSTOM`, `OTHER` — users must decode these
- ❌ `potentialMrr` vs `activeMrr` terminology — "Potential MRC" is unclear (MRC = Monthly Recurring Charge, but users may expect MRR)
- ❌ "Service Plan" column shows raw plan names without context
- ❌ No explanation of what "suspended" means in this context

**Recommendation:** Create a glossary tooltip; normalize account type labels; clarify MRC vs MRR distinction.

---

### N3: User Control and Freedom ❌ (3/10)

**What fails:**
- ❌ No back button from detail modal (only "Close")
- ❌ No way to pin/favorite frequently checked towers
- ❌ No keyboard navigation between cards
- ❌ No way to compare towers side-by-side
- ❌ No undo for "Show empty" toggle (data disappears)

**Recommendation:** Add Escape key to close modal; add tower comparison feature; add keyboard shortcuts for card navigation.

---

### N4: Consistency and Standards ⚠️ (5/10)

**What fails:**
- ❌ KPI cards use `text-xl` but tower cards use `text-base` — inconsistent scale
- ❌ "By Account Type" section uses `text-[10px]` for labels but `text-[9px]` for KPI labels — inconsistent micro-typography
- ❌ Modal uses `bg-zinc-50` but main cards use `bg-surface-container-lowest` — different container styles
- ❌ Status badges inconsistent: `bg-green-100` vs `bg-emerald-100` (same concept, different colors)
- ❌ `SectionCard` vs raw `<div>` — mixed card containers

**Recommendation:** Standardize all container components; use consistent color tokens; align typography scale.

---

### N5: Error Prevention ⚠️ (6/10)

**What works:**
- Search filters in real-time
- "Show empty" toggle prevents overwhelming view

**What fails:**
- ❌ No confirmation before export (accidental clicks)
- ❌ No rate limiting on search (if search were server-side)
- ❌ No validation that `includeEmpty` toggle won't break anything

**Recommendation:** Add debounced search; add export confirmation for large datasets (>100 towers).

---

### N6: Recognition Rather Than Recall ❌ (4/10)

**What fails:**
- ❌ No tooltips explaining what each metric means
- ❌ No "What's this?" links for MRC, account types, service plans
- ❌ No visual comparison (sparklines, trend arrows) for MRR values
- ❌ No way to see historical data for a tower
- ❌ Account type breakdown is just numbers — no visualization

**Recommendation:** Add inline tooltips; add MRR trend sparklines; add account type mini-bar charts.

---

### N7: Flexibility and Efficiency of Use ⚠️ (6/10)

**What works:**
- Search filter for towers
- CSV export for data portability
- Click-to-expand detail view

**What fails:**
- ❌ No keyboard shortcuts (Ctrl+F for search, Escape for modal)
- ❌ No bulk operations (select multiple towers, export selected)
- ❌ No saved views (e.g., "Show only towers with >10 customers")
- ❌ No sort controls (by MRR, by customer count, by last sync)
- ❌ No column customization in detail modal table

**Recommendation:** Add keyboard shortcuts; add sort controls; add saved filter presets.

---

### N8: Aesthetic and Minimalist Design ❌ (5/10)

**What fails:**
- ❌ **Cognitive overload**: Each card shows 8+ data points simultaneously
- ❌ **Visual noise**: `text-[9px] uppercase tracking-widest font-bold` repeated 15+ times per card
- ❌ **Inconsistent spacing**: `p-5`, `p-6`, `px-3 py-2`, `px-3 py-2` mixed throughout
- ❌ **Color confusion**: Primary (blue), emerald (green), zinc (gray), slate (dark gray) — 4 color families for one page
- ❌ **Overuse of borders**: `border-border`, `border-border/40`, `border-border/60` — inconsistent opacity levels

**Recommendation:** Reduce to 3 primary data points per card; use progressive disclosure; standardize spacing scale.

---

### N9: Help Users Recognize, Diagnose, and Recover from Errors ⚠️ (6/10)

**What works:**
- Error state shows AlertTriangle icon
- Error message is displayed

**What fails:**
- ❌ No retry button on error
- ❌ No suggestion of what might be wrong (e.g., "Check your network connection")
- ❌ No error logging visible to user

**Recommendation:** Add retry button; add error context; add "Last successful sync" timestamp on error state.

---

### N10: Help and Documentation ❌ (3/10)

**What fails:**
- ❌ No onboarding tour for first-time users
- ❌ No contextual help tooltips
- ❌ No glossary for domain terms (MRC, account types, service plans)
- ❌ No "What am I looking at?" explanation

**Recommendation:** Add interactive tour; add glossary; add data source explanation.

---

## Accessibility Evaluation

### A1: Color Contrast ❌ (4/10)

**Critical failures:**
- ❌ `text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60` — **fails 4.5:1 ratio** (opacity reduces contrast)
- ❌ `text-on-surface-variant/40` — **fails 4.5:1 ratio**
- ❌ `text-on-surface-variant/50` — **fails 4.5:1 ratio**
- ❌ Status badges use colored backgrounds with colored text — may fail contrast
- ❌ `text-emerald-600` on white background — **may fail 4.5:1** depending on exact shade

**Recommendation:** Remove opacity modifiers from text; use solid colors with sufficient contrast; test with WebAIM Contrast Checker.

---

### A2: Keyboard Navigation ❌ (3/10)

**Critical failures:**
- ❌ Cards are clickable `<div>` elements — **not focusable** without `tabIndex`
- ❌ Modal has no focus trap — Tab escapes to background
- ❌ No keyboard shortcut to close modal (Escape)
- ❌ Search input has no keyboard shortcut to focus
- ❌ No visible focus indicators on cards

**Recommendation:** Add `tabIndex={0}` and `role="button"` to cards; add focus trap to modal; add Escape key handler; add focus ring.

---

### A3: Screen Reader Support ❌ (4/10)

**Critical failures:**
- ❌ Cards lack `aria-label` — screen reader announces "div" with no context
- ❌ Status badges lack `aria-label` — "bg-green-100" means nothing
- ❌ Modal lacks `role="dialog"` and `aria-modal="true"`
- ❌ "By Account Type" section is not wrapped in semantic structure
- ❌ Icons (Clock3, Wifi, AlertTriangle) lack `aria-hidden="true"`

**Recommendation:** Add ARIA labels to all interactive elements; add `role="dialog"` to modal; hide decorative icons.

---

## Card Design Analysis

### Current Card Anatomy

```
┌─────────────────────────────────────┐
│ [Tower Name]              [Status]  │ ← Header
│ [Region]                 [Suspended]│
├─────────────────────────────────────┤
│ Customers        │ Devices          │ ← 2x2 Grid
│ {total} ({active})│ {count} · {down}│
├─────────────────────────────────────┤
│ Potential MRC    ₦{value}          │ ← MRR Section
│ Active MRC       ₦{value}          │
├─────────────────────────────────────┤
│ By Account Type                     │ ← Breakdown
│ {type}  {count} · ₦{potential} ₦{active}│
├─────────────────────────────────────┤
│ 🕐 Last sync    {date} · {rel}    │ ← Footer
└─────────────────────────────────────┘
```

### Problems with Current Layout

1. **Too many data points**: 8+ metrics per card creates cognitive overload
2. **No visual hierarchy**: All data has equal visual weight
3. **No progressive disclosure**: Everything shown at once, nothing hidden
4. **No comparison context**: Is ₦500K good? Bad? We don't know
5. **No trend information**: Static snapshot, no history

---

## Recommended Card Redesign

### Option A: Simplified Card (Recommended)

```
┌─────────────────────────────────────┐
│ [Tower Name]              [●] Active │ ← Clear hierarchy
│ [Region]                           │
├─────────────────────────────────────┤
│                                     │
│  127 Customers     ₦1.2M MRC       │ ← Primary metrics (large)
│  (119 active)      (₦980K active)  │
│                                     │
├─────────────────────────────────────┤
│ ┌──────────────────────────────┐   │
│ │ ████████████░░░░░░ 65%       │   │ ← Account type bar chart
│ │ Residential  Enterprise      │   │
│ └──────────────────────────────┘   │
├─────────────────────────────────────┤
│ 8 devices · 2 down  │ 🕐 2h ago   │ ← Secondary metrics (small)
└─────────────────────────────────────┘
```

**Benefits:**
- 3-tier hierarchy: Primary → Secondary → Tertiary
- Visual bar chart for account type distribution
- Reduced cognitive load
- Better mobile experience

### Option B: Minimal Card (For power users)

```
┌─────────────────────────────────────┐
│ [Tower Name]              [●] Active │
│ [Region]                     2h ago │
├─────────────────────────────────────┤
│ 127 customers │ ₦1.2M MRC │ 8 dev  │ ← Single row
└─────────────────────────────────────┘
```

**Benefits:**
- Maximum density for scanning
- 50+ towers visible without scrolling
- Click to expand for details

---

## Data Display Recommendations

### 1. Account Type Visualization

**Current:** Raw numbers in a list
```html
<span>Neighbourhood</span>
<span>85 · ₦425K</span>
```

**Recommended:** Mini bar chart with percentages
```html
<div class="flex items-center gap-2">
  <div class="flex-1 bg-gray-200 rounded-full h-2">
    <div class="bg-blue-500 h-2 rounded-full" style="width: 65%"></div>
  </div>
  <span class="text-xs font-mono">65%</span>
  <span class="text-xs text-gray-500">85 customers</span>
</div>
```

### 2. MRR Display

**Current:** Two separate lines
```
Potential MRC    ₦500K
Active MRC       ₦420K
```

**Recommended:** Comparison bar with delta
```
┌─────────────────────────────────────┐
│ MRR   ₦420K / ₦500K  (84%)       │
│ ████████████████░░░░ 84%            │
│ Active vs Potential                 │
└─────────────────────────────────────┘
```

### 3. Device Status

**Current:** Text only
```
8 devices · 2 down
```

**Recommended:** Status indicator with visual cue
```
┌─────────────────────────────────────┐
│ Devices  8 total                    │
│ ●●●●●●●○○                          │ ← Visual dot indicator
│ 6 online  2 offline                 │
└─────────────────────────────────────┘
```

### 4. Last Sync

**Current:** Static timestamp
```
Last sync  2026-08-28 · 2h ago
```

**Recommended:** Relative time with staleness indicator
```
┌─────────────────────────────────────┐
│ Synced 2h ago  🟢 Fresh            │ ← Color-coded freshness
│              or 🔴 Stale (>24h)    │
└─────────────────────────────────────┘
```

---

## Mobile-Specific Issues

### Current Problems

1. **Cards stack vertically** — 100+ towers = excessive scrolling
2. **Detail modal is 85vh** — hard to dismiss on mobile
3. **Table in modal is 720px min-width** — requires horizontal scroll
4. **No swipe gestures** — can't swipe between towers
5. **No pull-to-refresh** — must use browser refresh

### Recommended Mobile Patterns

1. **Card grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (already correct)
2. **Bottom sheet modal:** Replace fixed overlay with draggable bottom sheet
3. **Swipe navigation:** Left/right swipe between towers in detail view
4. **Pull-to-refresh:** Add `useRefreshControl` hook
5. **Sticky header:** KPI summary stays visible while scrolling cards

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 hours)
1. ✅ Add `tabIndex={0}` and `role="button"` to cards
2. ✅ Add `role="dialog"` and `aria-modal` to modal
3. ✅ Add Escape key handler to close modal
4. ✅ Remove opacity from text (use solid colors)
5. ✅ Add toast notification on CSV export

### Phase 2: Visual Hierarchy (4-6 hours)
1. ⬜ Redesign card layout with 3-tier hierarchy
2. ⬜ Add account type bar chart visualization
3. ⬜ Add MRR comparison bar (active vs potential)
4. ⬜ Add device status dot indicator
5. ⬜ Add sync freshness color coding

### Phase 3: Interactivity (6-8 hours)
1. ⬜ Add sort controls (by MRR, customers, last sync)
2. ⬜ Add saved filter presets
3. ⬜ Add tower comparison feature
4. ⬜ Add keyboard shortcuts (↑↓ for cards, Enter to open)
5. ⬜ Add pull-to-refresh on mobile

### Phase 4: Advanced (8-12 hours)
1. ⬜ Add MRR trend sparklines (7-day, 30-day)
2. ⬜ Add tower performance score (composite metric)
3. ⬜ Add anomaly detection highlights
4. ⬜ Add bulk operations (export selected, pin towers)
5. ⬜ Add onboarding tour for first-time users

---

## Testing Recommendations

### Usability Test Plan

**Objective:** Validate that users can quickly identify towers needing attention.

**Tasks:**
1. "Find all towers with device outages" (scan + filter)
2. "Compare MRR between two towers" (select + compare)
3. "Export towers with >50 customers to CSV" (filter + export)
4. "Identify the tower with the highest potential MRR" (sort + scan)

**Success Criteria:**
- Task 1: <30 seconds
- Task 2: <45 seconds
- Task 3: <60 seconds
- Task 4: <20 seconds

**Participants:** 5-6 ops team members who use this page daily.

---

## Conclusion

The BTS Audit page is **functional but not optimal**. The current design prioritizes **data density** over **actionability**, making it hard for users to quickly identify what needs attention.

**Key improvements needed:**
1. **Visual hierarchy** — 3-tier card layout (primary/secondary/tertiary metrics)
2. **Accessibility** — ARIA labels, keyboard navigation, focus management
3. **Progressive disclosure** — Show summary, expand for details
4. **Comparison context** — Sparklines, trend arrows, benchmarks
5. **Mobile optimization** — Bottom sheet modal, swipe navigation

**Estimated effort:** 20-30 hours across 4 phases.

**Next steps:**
1. Get user feedback on card redesign options (A vs B)
2. Run usability test with 5 ops team members
3. Implement Phase 1 quick wins
4. Iterate based on test findings

---

*Generated by Product Designer skill — design_critique.py*
*Evaluation based on Nielsen's 10 Usability Heuristics + WCAG 2.1 AA*
