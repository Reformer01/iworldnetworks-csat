# Mailing System — Product Design Analysis

**Date:** August 28, 2026
**Scope:** Full product brief — journey maps, feature spec, component design system, roadmap
**Core pain:** Campaign creation is too manual, no delivery visibility, approval workflow is clunky

---

## 1. System Inventory

### What Exists Today

| Tab | Component | Status | Quality |
|-----|-----------|--------|---------|
| **Campaigns** | `CampaignsTab` | ✅ Built | Functional list with search/filter/pagination |
| **Campaign Create** | `CampaignForm` | ✅ Built | Basic: name, type, subject, body, audience pills |
| **Campaign Detail** | `[id]/page.tsx` | ✅ Built | Stats, audience JSON, body preview, approve/send/cancel |
| **Email Queue** | `EmailsTab` | ✅ Built | Stats cards, table, bulk approve/reject, compose modal |
| **Churn Surveys** | `ChurnTab` | ✅ Built | Summary stats, reason breakdown, rating distribution |

### What's Missing

| Feature | Impact | Effort |
|---------|--------|--------|
| Email templates | 🔴 High — every campaign is written from scratch | Medium |
| Schedule campaigns | 🔴 High — no way to send later | Low |
| Open/click tracking | 🔴 High — no delivery analytics | High |
| Approval workflow | 🟡 Medium — only super admin can approve | Medium |
| Campaign analytics dashboard | 🟡 Medium — no performance overview | Medium |
| A/B test subject lines | 🟢 Low — nice to have | Medium |
| Unsubscribe management | 🟢 Low — legal compliance | Low |

---

## 2. User Journey Maps

### Persona A: Aisha — Marketing Editor

**Goal:** Create and send a campaign to a customer segment quickly.

```
STAGE:      IDEA           CREATE         REVIEW         APPROVE        SEND
Actions:    Decides on     Opens form     Writes HTML    Waits for      Monitors
            campaign topic              Picks audience  super admin    delivery
Touchpoint: Slack/phone    /campaigns/new CampaignForm  Campaign detail Campaign detail
Emotion:    Motivated      Frustrated     Anxious        Impatient      Blind
Pain point: No templates   Starting from  No preview     Can't approve  No open/click
            for common     scratch       of how it      myself — need  data — don't
            scenarios      (15-30 min)    looks in email  admin          know if it
            every time                                  at 9 PM         worked
Opportunity: Template       Rich text     Email preview  Self-approval  Open/click
             library        editor        in iframe      for editors    tracking
```

**Emotion Curve:** 🙂 → 😤 → 😟 → 😐 → 😞

**Key insight:** Aisha spends 15-30 minutes writing each campaign from scratch because there are no templates. She can't preview how it looks in an email client. She has to wait for a super admin to approve before sending — often hours or until the next day.

---

### Persona B: Chidi — Super Admin (Approval & Oversight)

**Goal:** Approve campaigns quickly, monitor delivery, and ensure compliance.

```
STAGE:      CHECK           APPROVE        MONITOR        FOLLOW-UP     REPORT
Actions:    Opens email     Reviews draft  Watches queue  Retries fails Generates
            notification    Approves/sends Checks stats   manually      reports
Touchpoint: Gmail           Campaign detail Email Queue   Email Queue   Spreadsheet
Emotion:    Annoyed         Careful        Uncertain      Frustrated    Resigned
Pain point: No dashboard    No way to see  No delivery    No auto-      No analytics
            — must check    HTML preview   analytics —    retry for     dashboard —
            campaigns       in context     "sent" doesn't  failures     exports to
            tab manually                   mean "opened"              Excel
Opportunity: Email          Inline preview Real-time      Auto-retry    Built-in
             notification   with device    delivery       with backoff  campaign
             for drafts     simulation     dashboard                    analytics
```

**Emotion Curve:** 😒 → 🤔 → 😕 → 😤 → 😞

**Key insight:** Chidi is the bottleneck — only super admins can approve. He gets no notification when a campaign needs approval. After sending, he has no visibility into whether emails are actually being opened or clicked.

---

## 3. Feature Spec

### 3.1 Campaign Templates (Priority: 🔴 Critical)

**User story:** As an editor, I want to start from a template instead of blank, so I can create campaigns faster.

**Definition of done:**
- Template library with pre-built templates:
  - **Downtime Notice** — structured format with date, region, estimated duration
  - **Service Update** — what changed, what to do
  - **Promotional** — offer headline, CTA button, expiry
  - **Churn Survey** — exit survey link
  - **Blank** — current behavior
- Template picker on `/admin/campaigns/new`
- Templates use placeholders: `{{customer.name}}`, `{{tower.name}}`, `{{service.plan}}`
- Preview with sample data before sending
- Templates stored in code (not DB) — version controlled

**Effort:** 8-12 hours

---

### 3.2 Campaign Scheduler (Priority: 🔴 Critical)

**User story:** As an editor, I want to schedule a campaign to send at a specific time, so I don't have to wait for a super admin to be online.

**Definition of done:**
- "Schedule" option on campaign form (instead of "Send Now")
- Date/time picker with timezone (WAT)
- Campaign status: `draft` → `scheduled` → `sending` → `sent`
- Scheduled campaigns show countdown timer on detail page
- Cancel scheduled campaign before it sends
- Cron job checks for due campaigns and triggers send
- Editor can schedule, super admin can override

**Effort:** 6-8 hours

---

### 3.3 Email Delivery Analytics (Priority: 🔴 Critical)

**User story:** As a super admin, I want to know if emails are being opened and clicked, so I can measure campaign effectiveness.

**Definition of done:**
- Track opens: pixel beacon in email HTML
- Track clicks: redirect through `/api/track/click?url=...`
- Dashboard per campaign:
  - Sent / Delivered / Opened / Clicked / Bounced / Unsubscribed
  - Open rate, click rate, bounce rate
  - Timeline chart (opens over time)
- Dashboard across all campaigns:
  - Total emails sent this month
  - Average open rate, click rate
  - Best performing campaigns
- Unsubscribe tracking (legal compliance)

**Effort:** 15-20 hours (requires new DB tables + tracking endpoints)

---

### 3.4 Inline Email Preview (Priority: 🟡 Important)

**User story:** As an editor, I want to see how my email looks in Outlook, Gmail, and mobile before sending.

**Definition of done:**
- Preview panel on campaign form and detail page
- Three viewport tabs: Desktop (Outlook), Desktop (Gmail), Mobile
- Renders HTML in sandboxed iframe
- Shows plain text version side-by-side
- Device frame mockup (optional)

**Effort:** 4-6 hours

---

### 3.5 Approval Workflow Enhancement (Priority: 🟡 Important)

**User story:** As an editor, I want to submit for approval without waiting, and as a super admin, I want to approve in one click.

**Definition of done:**
- Editor clicks "Submit for Approval" → status changes to `pending_approval`
- Super admin gets email notification: "Campaign X needs approval"
- Approval page: preview + approve/reject buttons
- Bulk approve: select multiple drafts, approve all
- Self-approval option for editors (configurable per org)
- Approval audit trail: who approved, when

**Effort:** 6-8 hours

---

### 3.6 Campaign Analytics Dashboard (Priority: 🟡 Important)

**User story:** As a super admin, I want a single view of all campaign performance, so I can identify what's working.

**Definition of done:**
- New tab: "Analytics" in mailing hub
- Summary cards: total sent, avg open rate, avg click rate, total unsubscribes
- Campaign performance table: sorted by open rate
- Date range filter (last 7d, 30d, 90d, all)
- Export to CSV
- Trend chart: open rate over time

**Effort:** 8-10 hours

---

### 3.7 Rich Text Editor (Priority: 🟡 Important)

**User story:** As an editor, I want to write HTML emails without writing raw HTML.

**Definition of done:**
- WYSIWYG editor (e.g., Tiptap, Lexical, or react-email-editor)
- Formatting: bold, italic, links, images, buttons
- Template variables: `{{customer.name}}` autocomplete
- HTML source toggle
- Mobile preview

**Effort:** 10-15 hours

---

### 3.8 Auto-Retry with Backoff (Priority: 🟢 Nice-to-have)

**User story:** As a super admin, I want failed emails to retry automatically instead of me doing it manually.

**Definition of done:**
- Failed emails retry 3 times with exponential backoff (1m, 5m, 30m)
- After 3 failures, mark as `permanently_failed`
- Notification: "X emails failed after 3 retries"
- Manual retry button still available

**Effort:** 3-4 hours

---

### 3.9 Unsubscribe Management (Priority: 🟢 Nice-to-have)

**User story:** As a super admin, I want to manage unsubscribes for legal compliance.

**Definition of done:**
- Unsubscribe link in every email footer
- Unsubscribe page: confirm + add to blocklist
- Blocklist visible in admin: list of unsubscribed emails
- Re-subscribe option (with audit trail)
- Export blocklist

**Effort:** 4-6 hours

---

## 4. Component Design System

### 4.1 Campaign Card (Enhanced)

**Current:** Table row with name, type, status, audience, created, actions.
**Proposed:** Card with preview, status badge, quick actions.

```
┌─────────────────────────────────────────────────────────────┐
│ [Draft] August Downtime Notice                              │
│ Downtime · 1,247 recipients                                │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Email preview (thumbnail)                               │ │
│ │ "Dear {{customer.name}}, we have scheduled..."         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Created Aug 28 by Aisha · awaiting approval                 │
│                                                             │
│ [Preview]  [Edit]  [Submit for Approval]                   │
└─────────────────────────────────────────────────────────────┘
```

**New elements:**
- Email preview thumbnail
- "Submit for Approval" button (replaces "Open →")
- Creator name + time ago

---

### 4.2 Campaign Form (Redesigned)

**Current:** Single-page form with name, type, subject, text, HTML, audience.
**Proposed:** Multi-step wizard.

```
Step 1: Choose Template
┌─────────────────────────────────────────────────────────────┐
│ 📧 Start from a template                                    │
│                                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ 📢       │ │ ⚠️       │ │ 🎯       │ │ 📝       │       │
│ │ Campaign │ │ Downtime │ │ Service  │ │ Blank    │       │
│ │          │ │ Notice   │ │ Update   │ │          │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘

Step 2: Content
┌─────────────────────────────────────────────────────────────┐
│ Subject: [_________________________]                        │
│                                                             │
│ ┌──────────────────────┬──────────────────────┐            │
│ │ Editor (WYSIWYG)    │ Live Preview          │            │
│ │                      │ ┌──────────────────┐ │            │
│ │ Dear {{name}},       │ │ Dear Aisha,      │ │            │
│ │ We have scheduled... │ │ We have scheduled│ │            │
│ │                      │ │ ...              │ │            │
│ │ [Bold] [Italic] [🔗] │ │                  │ │            │
│ │                      │ └──────────────────┘ │            │
│ │ Variables:           │ Desktop | Mobile     │            │
│ │ • {{customer.name}}  │                      │            │
│ │ • {{tower.name}}     │                      │            │
│ └──────────────────────┴──────────────────────┘            │
└─────────────────────────────────────────────────────────────┘

Step 3: Audience
┌─────────────────────────────────────────────────────────────┐
│ Who should receive this?                                    │
│                                                             │
│ [All customers ▼]  or  [Lifecycle ▼] [Active ▼] [Lagos ▼]  │
│                                                             │
│ Preview: 1,247 recipients                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Sample recipients:                                      │ │
│ │ • Aisha Mohammed — aisha@iworldnetworks.net (Active)    │ │
│ │ • Chidi Okonkwo — chidi@iworldnetworks.net (Active)     │ │
│ │ • ... and 1,245 more                                   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

Step 4: Schedule & Send
┌─────────────────────────────────────────────────────────────┐
│ When should this send?                                      │
│                                                             │
│ ○ Send now                                                  │
│ ○ Schedule for: [Date picker] [Time picker]                 │
│                                                             │
│ Summary:                                                    │
│ • Campaign: August Downtime Notice                          │
│ • Audience: 1,247 Active customers in Lagos                 │
│ • Schedule: Tomorrow 9:00 AM WAT                            │
│                                                             │
│ [Save as Draft]  [Submit for Approval]  [Schedule]         │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.3 Email Queue Stats (Enhanced)

**Current:** 4 stat cards (Total, Pending, Processing, Sent, Failed).
**Proposed:** Enhanced with delivery metrics.

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Total        │ Sent         │ Delivered    │ Opened       │
│ 12,450       │ 12,200       │ 11,800       │ 8,260        │
│ (100%)       │ (98%)        │ (95.7%)      │ (70%)        │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Clicked      │ Bounced      │ Failed       │ Unsubscribed │
│ 2,478        │ 400          │ 250          │ 12           │
│ (21%)        │ (3.2%)       │ (2%)         │ (0.1%)       │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

### 4.4 Campaign Detail (Redesigned)

**Current:** Stats, audience JSON, body preview, approve/send/cancel.
**Proposed:** Tabbed layout with analytics.

```
┌─────────────────────────────────────────────────────────────┐
│ August Downtime Notice  [Draft]                             │
│ Downtime · Created Aug 28 by Aisha                          │
│                                                             │
│ [Overview] [Analytics] [Emails] [Settings]                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Overview tab:                                               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Email Preview                                           │ │
│ │ ┌───────────────────────────────────────────────────┐   │ │
│ │ │ Dear Aisha,                                       │   │ │
│ │ │ We have scheduled maintenance for Sagamu Tower... │   │ │
│ │ └───────────────────────────────────────────────────┘   │ │
│ │                                                         │ │
│ │ Audience: 1,247 Active customers                        │ │
│ │ Schedule: Tomorrow 9:00 AM WAT                          │ │
│ │                                                         │ │
│ │ [Edit]  [Submit for Approval]  [Delete]                │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Analytics tab (after send):                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │ │
│ │ │Sent  │ │Open  │ │Click │ │Bounce│ │Unsub │         │ │
│ │ │1,247 │ │872   │ │234   │ │12    │ │2     │         │ │
│ │ │70%   │ │19%   │ │1%    │ │0.2%  │       │         │ │
│ │ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │ │
│ │                                                         │ │
│ │ Opens over time: ────────📈───────                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

### 4.5 Template Picker

**Purpose:** Quick-start campaign creation.

```
┌─────────────────────────────────────────────────────────────┐
│ Choose a template                                           │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📢 Campaign Announcement                               │ │
│ │ For marketing campaigns, product launches, events       │ │
│ │ [Select]                                                │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ⚠️ Downtime Notice                                      │ │
│ │ For scheduled maintenance, outages, service disruptions │ │
│ │ [Select]                                                │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔄 Service Update                                       │ │
│ │ For plan changes, upgrades, policy updates              │ │
│ │ [Select]                                                │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📝 Blank                                                │ │
│ │ Start from scratch                                      │ │
│ │ [Select]                                                │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Information Architecture

### Current IA

```
/admin/mailing
├── /admin/mailing?tab=campaigns        ← Campaign list
├── /admin/mailing?tab=emails           ← Email queue
├── /admin/mailing?tab=churn            ← Churn surveys
├── /admin/campaigns/new                ← Create campaign
└── /admin/campaigns/[id]               ← Campaign detail
```

### Proposed IA

```
/admin/mailing
├── /admin/mailing?tab=campaigns        ← Campaign list (cards with preview)
├── /admin/mailing?tab=emails           ← Email queue (enhanced stats)
├── /admin/mailing?tab=churn            ← Churn surveys
├── /admin/mailing?tab=analytics        ← NEW: Campaign analytics dashboard
├── /admin/campaigns/new                ← Campaign wizard (template → content → audience → schedule)
├── /admin/campaigns/[id]               ← Campaign detail (tabbed: overview/analytics/emails/settings)
└── /admin/campaigns/templates          ← NEW: Template library management
```

---

## 6. Prioritized Roadmap

### Phase 1: Quick Wins (1-2 weeks) — *Fix the "too manual" problem*

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 1 | Campaign templates (4 pre-built) | 8-12h | 🔴 High |
| 2 | Inline email preview (iframe) | 4-6h | 🔴 High |
| 3 | Auto-retry with backoff | 3-4h | 🟡 Medium |
| 4 | Unsubscribe management | 4-6h | 🟡 Medium |

**Total:** 19-28 hours

---

### Phase 2: Core Improvements (2-3 weeks) — *Fix the "no visibility" problem*

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 5 | Email open/click tracking | 15-20h | 🔴 High |
| 6 | Campaign scheduler | 6-8h | 🔴 High |
| 7 | Approval workflow enhancement | 6-8h | 🟡 Medium |

**Total:** 27-36 hours

---

### Phase 3: Intelligence (2-3 weeks) — *Fix the "no insight" problem*

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 8 | Campaign analytics dashboard | 8-10h | 🟡 Medium |
| 9 | Rich text editor (WYSIWYG) | 10-15h | 🟡 Medium |
| 10 | Campaign performance ranking | 4-6h | 🟢 Low |

**Total:** 22-31 hours

---

### Phase 4: Polish (1 week) — *Nice-to-haves*

| # | Feature | Effort | Impact |
|---|---------|--------|--------|
| 11 | A/B test subject lines | 6-8h | 🟢 Low |
| 12 | Campaign cards with preview | 4-6h | 🟢 Low |
| 13 | Template management UI | 4-6h | 🟢 Low |

**Total:** 14-20 hours

---

### Total Effort

| Phase | Hours | Days (1 dev) |
|-------|-------|--------------|
| Phase 1 | 19-28h | 3-4 days |
| Phase 2 | 27-36h | 4-5 days |
| Phase 3 | 22-31h | 3-4 days |
| Phase 4 | 14-20h | 2-3 days |
| **Total** | **82-115h** | **12-16 days** |

---

## 7. Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Time to create campaign | 15-30 min | <5 min (with template) | User timing |
| Time to approve | Hours/days | <1 hour (with notification) | Audit trail |
| Open rate | Unknown | >60% | Tracking pixel |
| Click rate | Unknown | >15% | Click redirect |
| Editor satisfaction (SUS) | Unknown | >75 | Survey |
| Super admin approval time | Unknown | <1 hour avg | Audit trail |

---

## 8. Open Questions

1. **Email provider:** Are you using a transactional email service (SendGrid, Mailgun, AWS SES) or sending directly? This affects tracking implementation.

2. **Template variables:** Which fields should be available? I've listed `{{customer.name}}`, `{{tower.name}}`, `{{service.plan}}` — do you need more?

3. **Approval permissions:** Should editors be able to self-approve their own campaigns? Or is the dual-approval workflow required?

4. **Analytics retention:** How long should we keep open/click data? 30 days? 90 days? Forever?

5. **HTML editor:** Do you want a full WYSIWYG editor (like TinyMCE/Quill) or is a simple markdown-to-HTML converter enough?

---

*Generated by Product Designer skill*
*Analysis based on codebase review, heuristic evaluation, and simulated user interviews*
