# I-World Networks — Customer Experience & Sales Performance Platform

## Report for Management

**Date:** July 2026
**Prepared by:** Project Development Team

---

## 1. Executive Summary

We have built a unified digital platform that serves two critical business functions for I-World Networks:

1. **Automatically collect and track customer feedback** across every department — internet quality, support, billing, installations, and field services.
2. **Give management a real-time view of sales performance** — revenue, customer growth, and agent productivity across all four regions (Ogun, Oyo, Osun, Ondo).

The platform replaces manual, scattered processes with an automated system that gives us data we can actually use to make decisions.

---

## 2. The Problem We Are Solving

### Before This Platform

| Problem | Impact |
|---|---|
| **No structured feedback system** — Customer complaints and compliments were shared informally, lost in phone calls and WhatsApp messages. We had no way to track satisfaction trends or hold departments accountable. | Management couldn't identify which departments were performing well or where customers were consistently unhappy. |
| **No trigger for follow-up** — When a customer paid an invoice, raised a support ticket, or got a new installation, nobody followed up to ask how it went. | We missed opportunities to catch problems early and improve our service. |
| **Sales tracking was manual** — Revenue, customer counts, and agent performance were tracked in spreadsheets or not at all. Data was always outdated by the time it reached management. | Management couldn't see real-time performance, spot declining regions, or know which agents needed support. |
| **No integration between billing and feedback** — The Splynx billing system (which handles all customer accounts) operated separately from any customer experience tracking. | Customer events (invoices, tickets, installations) happened in silos — there was no automated way to reach out to customers after these interactions. |

---

## 3. What the Platform Does — Key Capabilities

### 3.1 Customer Feedback Collection (Two Channels)

**Channel A — Public Web Portal (iwn.ng)**
Customers can visit the company website and submit feedback in any of six categories:
- **Internet Quality** — rate network stability, speed, peak-hour performance
- **Customer Support** — rate how support agents handle calls and tickets
- **Field Support** — rate technician visits, repairs, and service quality
- **Installation (Onboarding)** — rate how smoothly new installations go
- **Billing** — rate invoice accuracy and payment experience
- **Share Your Story** — customers can leave testimonials and refer friends

Each category has specific rating questions tailored to that experience. Customers fill in their name, location, service plan, and optionally mention the staff member who helped them.

**Channel B — Automated Email Surveys (Splynx-Triggered)**
This is the more powerful channel. The platform connects directly to our Splynx billing system. When a customer:
- Receives an invoice → they get an email asking how the billing experience was
- Closes a support ticket → they get an email asking how the support was
- Gets a new installation → they get an email asking how the installation went

The email contains a personalised link that takes them to a simple, short survey (3 questions). The customer's name, plan, and details are already filled in — they just click a star rating and submit.

**Key benefit:** This runs automatically. We do not need staff to manually send follow-up emails or make calls. Every customer event becomes an opportunity to measure satisfaction.

### 3.2 Management Dashboard — Customer Feedback

The admin dashboard shows management:
- **Overall Satisfaction Score** — percentage of satisfied customers
- **Network Performance Score** — how customers rate internet quality
- **Would-Recommend Score** — Net Promoter style metric
- **Resolved-First-Time Rate** — how often issues are fixed on first contact
- **Satisfaction Trends Over Time** — a chart showing whether we are improving or declining
- **Department Performance Table** — average rating per department (Support, Billing, Installation, Field Support)
- **Regional Pulse** — satisfaction levels broken down by region (Ibadan, Abeokuta, Akure, Osogbo)
- **Recent Activity** — the 10 most recent feedback submissions with the ability to mark them as resolved or escalated
- **One-Click PDF Report** — generates a complete executive report for management meetings

### 3.3 Sales Performance Dashboard

This is a complete sales management system that tracks:

**Key Metrics (at a glance):**
- **Monthly Recurring Revenue (MRR)** — total monthly income from active customers
- **Average Revenue Per Customer (ARPU)** — how much each customer pays on average
- **Active Customer Count** — paying customers
- **Churn Rate** — percentage of customers lost
- **Installation Fees Collected** — one-time charges
- **Total Records in System**

**Breakdowns and Analysis:**
- **Revenue by Agent** — bar chart showing which sales agents bring in the most revenue
- **Revenue by Region** — pie chart showing Ogun, Oyo, Osun, Ondo performance
- **Regional Performance Table** — MRR, active customers, target revenue, and attainment percentage per region
- **Segment Breakdown** — revenue from Home, SME, Enterprise, and Neighbourhood plans
- **Revenue by Base Station (BTS)** — a pie chart and table showing revenue per transmission station (useful for infrastructure investment decisions)
- **Agent Performance Table** — each agent's name, region, customer count, MRR, one-time fees, target, and attainment percentage

**Target Tracking:**
- Company-wide targets: ₦30 million annual revenue, 1,000 new customers
- Each agent has an individual annual target
- Each region has a target percentage (Ogun 35%, Oyo 35%, Osun 15%, Ondo 15%)
- Attainment is calculated in real-time — you can see instantly if a region or agent is ahead or behind

### 3.4 Sales Records Management

The platform includes a full system for recording and managing customer sales:
- **Add individual records** — enter customer name, location, plan, pricing, agent, and status
- **Edit/Delete** — managers can correct errors
- **Search & Filter** — find records by name, location, plan, status, or region
- **CSV Import** — bulk-upload historical data from spreadsheets
- **CSV Export** — download all records for reporting
- **PDF Export** — download a formatted PDF with I-World branding, logo, and all record data
- **New vs Revived tracking** — mark whether a customer is brand new or a returning customer (and which agent revived them)
- **BTS assignment** — link each customer to their transmission station for infrastructure analysis
- **Enterprise plan support** — for business customers, you can enter custom bitrates and negotiated prices instead of choosing from fixed options
- **Custom Services** — record non-standard deals with a service description

### 3.5 Other Operational Dashboards

Beyond the main feedback and sales dashboards, the platform also has specialised views for each department:

- **Network Stability Dashboard** — uptime and performance data derived from customer feedback
- **Support Performance Dashboard** — average response times, first-contact resolution, agent-specific ratings
- **Field Support Dashboard** — technician leaderboards, repair quality scores
- **Installation Dashboard** — installation team performance, regional activity
- **Billing Overview Dashboard** — billing accuracy, restoration speed
- **Staff Performance Page** — individual performance analytics for every support agent, technician, and billing staff member with trend charts
- **Testimonials Curation Page** — collect and manage customer success stories for marketing
- **Support Revenue Tracker** — record equipment sales and repair income separate from subscription revenue

---

## 4. How the System Connects to Our Operations

```
Splynx Billing System
        │
        │  (invoice paid, ticket closed, customer added)
        ▼
Platform Webhook ──► Generates personalised survey link
        │
        ├──► Email sent to customer
        │
        └──► Customer clicks link, rates experience
                  │
                  ▼
            Feedback stored in database ──► Appears on Management Dashboard
                                            in real-time

Sales Team
        │
        │  (adds record after closing a deal)
        ▼
    Sales Records ──► Updates Dashboard KPIs (MRR, ARPU, attainment)
                      in real-time
```

---

## 5. Access and Permissions

| Role | What They Can See | What They Can Do |
|---|---|---|
| **Management** (Jeffery Udoji, Reformer Ejembi) | Everything — all dashboards, all records, all data | Full control — add, edit, delete anything |
| **Department Leads** (e.g. Titilade Bakare) | Everything — all dashboards and records | Can edit and correct sales records |
| **Sales Agents** | Their own records, all dashboards (view-only) | Can add new records for deals they close; cannot edit or delete |
| **Other Staff** | All dashboards (view-only) | Can view performance data; cannot modify anything |

All staff log in with their @iworldnetworks.net email. The system restricts access by domain — no external email can access the admin area.

---

## 6. Technical Summary (Simplified)

| Component | What It Is |
|---|---|
| **Website/Framework** | Next.js — modern, fast web application framework |
| **Database** | Google Firebase Firestore — cloud database, accessible from anywhere |
| **Authentication** | Firebase Auth — secure login with email and password |
| **Billing Integration** | Splynx webhook — our platform "listens" for events from Splynx |
| **Email** | SMTP through I-World's mail server (mail.iworldnetworks.net) |
| **Hosting** | Ready for deployment on CyberPanel or Firebase App Hosting |
| **Domain** | csat.iwn.ng (proposed) |

---

## 7. What Has Been Built vs What Remains

### Completed
- ✅ Public feedback portal with 6 categories
- ✅ Splynx webhook integration — automated survey triggers
- ✅ Email delivery system
- ✅ Feedback management dashboard
- ✅ Sales dashboard with full KPI tracking
- ✅ Sales records management (add, edit, delete, search, filter)
- ✅ CSV import/export
- ✅ PDF export (dashboard reports + sales records)
- ✅ Per-department dashboards (Support, Billing, Installation, Field Support)
- ✅ Staff performance tracking
- ✅ Role-based access control
- ✅ Enterprise and custom service plan support
- ✅ BTS (Base Station) revenue tracking with charts
- ✅ Neighbourhood plan integration
- ✅ Revived customer tracking

### Pending
- ❌ Production deployment (needs management approval for go-live)
- ❌ Staff training (scheduled after management presentation)
- ❌ Field visit automation trigger (awaiting input from Matthew on how field visits are tracked in Splynx)
- ❌ Automated data integration from Splynx hardware module (requires paid add-on that management previously declined)

---

## 8. Frequently Asked Questions

**Q: Is the platform secure?**
A: Yes. All admin pages require login with a company email. Data is stored in Google's secure cloud infrastructure. Feedback collection uses industry-standard security practices (rate limiting, CSRF protection, HTTP-only cookies).

**Q: Does this replace Splynx?**
A: No. Splynx remains our billing and customer management system. The platform connects to Splynx via webhooks to trigger surveys automatically, but it does not replace any existing system.

**Q: Can we export data for reports?**
A: Yes. You can export sales records as CSV (for Excel) or PDF (formatted with company branding). The dashboard can also generate a one-click PDF executive report.

**Q: How long will deployment take?**
A: Approximately 2 days for full deployment, plus half a day for staff training.

**Q: What if a customer doesn't want to give feedback?**
A: They simply ignore the email. No follow-up is sent. The system respects customer choice.

---

*For questions or a live demonstration, please contact the project development team.*
