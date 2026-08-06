# I-World Admin Hub — Field Operations One-Pager
(Field Technicians, Installation, BTS)

**Login:** admin site → sign in with your `@iworldnetworks.net` email + password. Verify email on first login.

## Your pages

### BTS Audit (`/admin/bts/audit`)
This is your main contribution — the BTS site audit log.
- Click **Add BTS Audit Record**.
- Fill in: BTS name, address, **status**, region. The audit period is auto-set to the current week — no need to change it.
- Save. Your record appears with the current period and is visible to Sales and management.
- Prefer **Edit** over Delete if you made a typo — editing preserves history. Deleting is available but asks for confirmation.

### BTS Data (`/admin/bts/import`)
- Import the list of customer/benchmark sites for a region. Review the import preview, then commit.
- After importing, **Import History** lists past batches — use the batch ID if you need to roll one back.

### Field Support (`/admin/field-support`)
- Overview of repair volume per technician and **Customer Sentiment** from FieldSupport feedback.
- If a resolved field ticket got feedback, you'll see it here.

### Installation (`/admin/installation`)
- Installation performance: volumes, completion time, and ratings from Installation-category feedback.

## Feedback at job sites
- Customers submit ratings/feedback (Reliability, Support, FieldSupport, Installation, Billing).
- FieldSupport + Installation feedback is what appears on your Field Support / Installation pages.
- A low rating is the signal to improve at that site — respond by closing the loop on the next visit.

## Don'ts
- Don't create spreadsheets ad-hoc and import unless you know the expected format; **preview before committing**.
- Don't re-import the same batch twice — use the existing batch ID to avoid duplicates.

## Daily routine
1. Look at today's BTS audit items — complete + save records as you work.
2. Any new installations → they show up under Installation once feedback arrives (or via the import flow).
3. Check Field Support sentiment weekly for areas to fix.