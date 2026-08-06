# I-World Admin Hub — Shared Tools One-Pager (All Staff)

**Login:** admin site → sign in with your `@iworldnetworks.net` email. Verify email on first login.

These pages are useful to every department, not just one.

## Overview / Dashboard (`/admin/dashboard`)
The single view of customer sentiment. All metrics come from **customer feedback** (public form + Splynx webhook).
- **Time range picker** top-right: 7 days / 30 days / quarter / year — or set a custom date range.
- **Key Metrics row**: Overall Satisfaction %, Network Satisfaction %, NPS, First Contact Resolution %, Resolution Rate, Total Responses.
- **Department Breakdown**: submissions + avg rating + resolved count, per department (Support, Billing, Field, Installation, etc.).
- **Regional Breakdown**: share of submissions by Ibadan, Abeokuta, Akure, Osogbo.
- **Feedback Management**: click a feedback → mark Resolved/In Progress → add resolution notes.
- **Generate PDF Report**: branded landscape report of the whole dashboard — great for weekly/monthly management meetings.

## Stability (`/admin/stability`)
- Network stability telemetry (uptime %, ms latency, infrastructure view) from **Reliability** feedback.
- Spot regions where stability is degrading before they become complaints.

## Staff Performance (`/admin/staff`)
- Select a staff member → their KPI and trend line.
- Roster includes Support agents, Back-end, Billing, Field technicians (with regions).
- IMPORTANT: this roster is display/reference data only. It is **not** login accounts and not linked to the dashboard's live stats — treat it as a people directory with performance history.

## Success Stories / Testimonials (`/admin/testimonials`)
- Approved positive customer feedback shown as public-facing success stories ("Success Stories").
- Use this to pull quotes for marketing or management reports.

## Manage Data — Data Management Center (`/admin/crud`)
- The raw feedback repository with full controls.
- **Search**, filter by **department / region / status / date**.
- **Create** missing feedback (rare), **Edit** bad entries, **Delete** duplicates/incorrect submissions.
- Delete is a privileged action here — if you delete a record and it was part of a report, the department's totals change. Follow the same rule as everywhere: only delete with supervisor approval.

## Golden rules for everyone
1. **Do not create user accounts** — that's the super admin's job in the backend console.
2. **Do not delete financial/support-revenue records unless super admin approves.**
3. Verify email to get in; use "Request New Verification Link" if the mail hasn't arrived.
4. When in doubt about an error, screenshot it — the data all comes from customer feedback + seeded demo data, not from logins.