'use client';

import React from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { Button } from '@/components/ui/button';
import { Mail, Eye } from 'lucide-react';

const templates = [
  {
    name: 'Invoice Reminder 15d',
    type: 'invoice_reminder/15d',
    subject: 'A gentle reminder about invoice INV-123 (15 days overdue)',
    trigger: 'Unpaid invoice 15-29d overdue, reminder15SentAt is null, lifecycle active only',
    to: 'customer@example.com (deliverable, not opted out)',
    bodyText: `Dear Ada Customer,\n\nWe're sorry to bother you — this is just a gentle reminder that you have 1 invoice past due (15 days overdue):\n\n1. Invoice INV-123 (₦50,000.00, due 2026-08-10) — 15 days overdue\n\nIf you've already paid, please ignore. Pay via https://portal.iwn.ng`,
    bodyHtml: `<p>Dear Ada Customer,</p><p>We're sorry to bother you — this is just a gentle reminder that you have <strong>1 invoice</strong> past due (<strong>15 days overdue</strong>):</p><ul><li>Invoice INV-123 (₦50,000.00, due 2026-08-10) — 15 days overdue</li></ul>`,
  },
  {
    name: 'Invoice Reminder 30d',
    type: 'invoice_reminder/30d',
    subject: 'A gentle reminder about invoice INV-123 (30 days overdue)',
    trigger: 'Unpaid invoice ≥30d overdue, reminder30SentAt is null, not combined with 15d',
    to: 'same filter, but 30d — sent as separate email, one per customer per threshold',
    bodyText: `Dear Ada Customer,\n\nYou have 1 invoice past due (30 days overdue):\n\n1. Invoice INV-123 (₦50,000.00, due 2026-07-25) — 32 days overdue\n\nIf you've already paid, please ignore.`,
    bodyHtml: `<p>Dear Ada Customer,</p><p>You have <strong>1 invoice</strong> past due (<strong>30 days overdue</strong>):</p><ul><li>Invoice INV-123 (₦50,000.00, due 2026-07-25) — 32 days overdue</li></ul>`,
  },
  {
    name: 'Win-Back (inactive 60d+)',
    type: 'winback',
    subject: 'We miss you at I-World Networks',
    trigger: 'lifecycle=inactive AND now - inactiveSince >= 60 days, winBackSentAt is null, pending_approval → needs super approve',
    to: 'inactive 60d+ with deliverable email',
    bodyText: `Dear Ada Customer,\n\nWe've missed you — truly. If your experience didn't meet expectations, we're sorry, and we'd love the chance to make it right.\n\nAs our way of saying sorry, we'd like to welcome you back with two weeks of complimentary service, no strings attached.\n\nReconnect:\n- Activate: https://portal.iwn.ng\n- Visit: https://csat.iwn.ng\n- Feedback: https://csat.iwn.ng/feedback/popup?token=...\n\nWarm regards,\nI-World Networks Limited`,
    bodyHtml: `<p>Dear Ada Customer,</p><p>We've missed you — truly.</p><p><strong>Two weeks complimentary service</strong></p><p><a href="https://portal.iwn.ng">Reconnect & Activate Offer</a> <a href="https://csat.iwn.ng">Visit Us</a> <a href="https://csat.iwn.ng/feedback/popup?token=...">Share Feedback</a></p>`,
  },
  {
    name: 'Feedback Request (paid only, 1/month)',
    type: 'feedback_request',
    subject: 'How was your experience with I-World Networks?',
    trigger:
      'isPaid=true AND paidAt >= monthStart (e.g. Aug 1), 1 per customer per calendar month (pending_approval dedup 30d), lifecycle != churned',
    to: 'Customers who paid an invoice this month',
    bodyText: `Hi Ada Customer,\n\nThank you for being an I-World Networks customer — we truly value your business. We'd love to hear how your experience has been so far; your honest feedback helps us improve.\n\nShare your feedback in 30 seconds:\nhttps://csat.iwn.ng/feedback?token=...&subject=Billing`,
    bodyHtml: `<p>Hi Ada Customer,</p><p>Thank you for being an I-World Networks customer — we truly value your business.</p><p><a href="https://csat.iwn.ng/feedback?token=...">Share your feedback in 30 seconds</a></p>`,
  },
  {
    name: 'Manual',
    type: 'manual',
    subject: 'Your subject (stripped \\r\\n, ≤200)',
    trigger:
      'POST /api/admin/emails {to, subject, html, text} — super: pending → enqueued immediately; editor: pending_approval → super must POST /api/admin/emails/[id] {approve}',
    to: 'Single address you type',
    bodyText: 'Your raw html/text as composed in Mailing → Compose',
    bodyHtml: '<p>Your raw html as composed</p>',
  },
  {
    name: 'Campaign',
    type: 'campaign',
    subject: 'Your campaign subject',
    trigger:
      'POST /api/admin/campaigns/[id]/send (super only, status pending_approval→approved) — resolves audience (customer where deleted false filtered by audienceJson) → 1 EmailJob + 1 Bull Job per recipient, status pending → processing → sent',
    to: 'Segment (lifecycle/city/bts/servicePlan)',
    bodyText: 'Your campaign html/text with tracking injected via injectTracking(html, emailJobId, campaignId)',
    bodyHtml: '<p>Your campaign html with tracking pixel</p>',
  },
  {
    name: '(Disabled) Churn Survey',
    type: 'churn_survey (disabled)',
    subject: "We're sorry to see you go",
    trigger: 'DISABLED per your request — no longer sends. Previously: lifecycle=churned within 30d, churnSurveySentAt is null',
    to: '—',
    bodyText: "Hi Ada,\n\nWe're genuinely sorry to see you go. Tell us what happened: https://csat.iwn.ng/churn?token=...",
    bodyHtml:
      '<p>Hi Ada,</p><p>We’re genuinely sorry to see you go.</p><p><a href="https://csat.iwn.ng/churn?token=...">Tell us what happened</a></p>',
  },
];

export default function MailingTemplatesPage() {
  return (
    <SalesLayout>
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight flex items-center gap-3">
            <Mail className="w-6 h-6 text-secondary" /> Mail Templates
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
            All 7 templates — subjects, triggers, audience, and rendered preview. No hidden templates.
          </p>
        </header>
        <div className="grid gap-6">
          {templates.map((t) => (
            <div key={t.type} className="bg-white rounded-2xl border whisper-shadow p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display font-bold text-primary uppercase text-base">{t.name}</h2>
                  <p className="font-mono text-[10px] uppercase font-bold text-secondary mt-1">{t.type}</p>
                </div>
                <span className="px-2 py-1 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-mono font-bold whitespace-nowrap">
                  {t.type.includes('disabled') ? 'Disabled' : 'Active'}
                </span>
              </div>
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Subject</p>
                    <p className="font-mono text-xs font-bold bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">{t.subject}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Trigger</p>
                    <p className="font-mono text-[11px] leading-relaxed bg-slate-50 border rounded-lg px-3 py-2 mt-1">{t.trigger}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">To</p>
                    <p className="font-mono text-[11px] bg-slate-50 border rounded-lg px-3 py-2 mt-1">{t.to}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Text preview
                    </p>
                    <pre className="font-mono text-[11px] whitespace-pre-wrap bg-white border rounded-lg px-3 py-2 mt-1 max-h-48 overflow-auto">
                      {t.bodyText}
                    </pre>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">HTML preview</p>
                    <div
                      className="border rounded-lg px-3 py-2 mt-1 max-h-48 overflow-auto text-xs"
                      dangerouslySetInnerHTML={{ __html: t.bodyHtml }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10px] opacity-50 mt-6 text-center">
          Follow-up reminders (📋 3 follow-ups due today) are *not* EmailJobs — they are direct transporter.sendMail at 15:00 WAT via
          src/lib/followup-reminders.ts.
        </p>
      </div>
    </SalesLayout>
  );
}
