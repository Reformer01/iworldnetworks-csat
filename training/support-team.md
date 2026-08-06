# I-World Admin Hub — Support Team One-Pager

**Login:** admin site → sign in with your `@iworldnetworks.net` email + password from your supervisor. Verify email on first login.

## Support Dashboard (`/admin/support`)
This page shows your performance, period by period:
- Pick a period up top: **week / month / quarter**.
- **Your KPI card**: tickets assigned / resolved / escalated, avg resolution time, SLA compliance, first-contact resolution, customer satisfaction.
- **Team average panel**: how you compare to the rest of the team.
- **Feedbacks tab**: support-category customer feedback with your ratings — see what customers say after their tickets.

Your KPI numbers are calculated automatically from tickets and feedback — no manual entry. If the page ever shows a "requires an index" error, tell the super admin; it's a backend config fix, not something you broke.

## Support Revenue (`/admin/support-revenue`)
- Records of revenue from support projects/engagements.
- **Add / Edit** records for projects your team closed (amount, project type, dates).
- **Delete is restricted to Super Admin** — if an entry is wrong, ask the super admin or edit it instead.

## Where feedback lands
Customer feedback in the **Support** category flows here automatically:
- Poor rating → shows in your sentiment/KPIs
- Resolve the customer, then mark the feedback **Resolved** with notes in **Dashboard** (Overview → open feedback → set status)

## Don'ts
- Don't delete feedback records — data integrity matters ("Manage Data" is the only place, delete is privileged there too).
- Don't create new users.

## Your daily routine
1. Open Dashboard → check new **Support** feedback; resolve + note as soon as possible.
2. Check your Support KPIs each week so you can see trends.
3. If you close paid support projects, add them to **Support Revenue**.

## Escalations
If the Support page shows no data but you know tickets exist: this is usually missing Firestore indexes or demo data not seeded. Ping the super admin; do not try to "fix" it in the console.