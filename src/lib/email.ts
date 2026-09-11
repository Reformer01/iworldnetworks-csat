import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SPLYNX_SMTP_HOST || 'mail.iworldnetworks.net';
const SMTP_PORT = parseInt(process.env.SPLYNX_SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SPLYNX_SMTP_USER || 'no_reply@mail.iworldnetworks.net';
const SMTP_PASS = process.env.SPLYNX_SMTP_PASS;
const FROM_EMAIL = process.env.SPLYNX_FROM_EMAIL || 'no_reply@mail.iworldnetworks.net';
const FROM_NAME = process.env.SPLYNX_FROM_NAME || 'I-World Networks Limited';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);
}

export function getTransporter() {
  if (!SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

interface SendFeedbackEmailParams {
  to: string;
  customerName: string;
  feedbackUrl: string;
}

export async function sendFeedbackEmail({ to, customerName, feedbackUrl }: SendFeedbackEmailParams) {
  const transporter = getTransporter();
  if (!transporter) {
    // Fail loudly so callers mark the EmailJob 'failed' — never silently skip
    // (a silent skip would be recorded as 'sent' for an email that never left).
    throw new Error('SMTP not configured (SPLYNX_SMTP_PASS missing) - email not sent');
  }

  const safeCustomerName = escapeHtml(customerName);
  const safeFeedbackUrl = escapeHtml(feedbackUrl);

  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject: 'How was your experience with I-World Networks?',
    text: `Hi ${customerName},\n\nThank you for being an I-World Networks customer — we truly value your business. We'd love to hear how your experience has been so far; your honest feedback helps us improve for you.\n\nShare your feedback in 30 seconds:\n${feedbackUrl}\n\nThank you,\nI-World Networks Limited`,
    html: `<p>Hi ${safeCustomerName},</p>
<p>Thank you for being an I-World Networks customer — we truly value your business. We'd love to hear how your experience has been so far; your honest feedback helps us improve for you.</p>
<p><a href="${safeFeedbackUrl}">Share your feedback in 30 seconds</a></p>
<p>Thank you,<br/>I-World Networks Limited</p>`,
  });
}

interface InvoiceReminderItem {
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
}

interface SendInvoiceReminderEmailParams {
  to: string;
  customerName: string;
  invoices: InvoiceReminderItem[];
  reminderType: '15d' | '30d';
}

function formatInvoiceList(invoices: InvoiceReminderItem[]): { text: string; html: string } {
  const lines = invoices.map((inv, i) => {
    const amountStr = Number.isFinite(inv.amount) ? inv.amount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }) : '';
    return `${i + 1}. Invoice ${inv.invoiceNumber} (${amountStr}, due ${inv.dueDate}) — ${inv.daysOverdue} days overdue`;
  });
  const text = lines.join('\n');
  const html = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return { text, html };
}

export async function sendInvoiceReminderEmail({
  to,
  customerName,
  invoices,
  reminderType,
}: SendInvoiceReminderEmailParams) {
  const transporter = getTransporter();
  if (!transporter) {
    // Fail loudly so callers mark the EmailJob 'failed' — never silently skip
    // (a silent skip would be recorded as 'sent' for an email that never left).
    throw new Error('SMTP not configured (SPLYNX_SMTP_PASS missing) - email not sent');
  }

  const safeCustomerName = escapeHtml(customerName);
  const { text: invoiceListText, html: invoiceListHtml } = formatInvoiceList(invoices);
  const invoiceCount = invoices.length;
  const maxDaysOverdue = Math.max(...invoices.map((i) => i.daysOverdue));
  const subject = invoiceCount === 1
    ? `A gentle reminder about invoice ${invoices[0].invoiceNumber}`
    : `A gentle reminder about ${invoiceCount} overdue invoices`;

  const reminderLabel = reminderType === '30d' ? '30 days' : '15 days';

  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject,
    text: `Dear ${customerName},

We're sorry to bother you — this is just a gentle reminder that you have ${invoiceCount} invoice${invoiceCount > 1 ? 's' : ''} past due (${reminderLabel} overdue):

${invoiceListText}

We know life gets busy and things slip through the cracks. If you've already paid, please simply ignore this message and accept our thanks.

If you'd like help with this, or would prefer to discuss a payment arrangement, just reply to this email — we're happy to help. You can also pay securely online at any time via the customer portal: https://portal.iwn.ng

Thank you for your understanding,
I-World Networks Limited`,
    html: `<p>Dear ${safeCustomerName},</p>
<p>We're sorry to bother you — this is just a gentle reminder that you have <strong>${invoiceCount} invoice${invoiceCount > 1 ? 's' : ''}</strong> past due (<strong>${reminderLabel} overdue</strong>):</p>
<ul>${invoiceListHtml}</ul>
<p>We know life gets busy and things slip through the cracks. If you've already paid, please simply ignore this message and accept our thanks.</p>
<p>If you'd like help with this, or would prefer to discuss a payment arrangement, just reply to this email — we're happy to help. You can also pay securely online at any time via the customer portal: <a href="https://portal.iwn.ng">portal.iwn.ng</a>.</p>
<p>Thank you for your understanding,<br/>I-World Networks Limited</p>`,
  });
}

interface SendChurnSurveyEmailParams {
  to: string;
  customerName: string;
  churnUrl: string;
}

export async function sendChurnSurveyEmail({ to, customerName, churnUrl }: SendChurnSurveyEmailParams) {
  const transporter = getTransporter();
  if (!transporter) {
    // Fail loudly so callers mark the EmailJob 'failed' — never silently skip
    // (a silent skip would be recorded as 'sent' for an email that never left).
    throw new Error('SMTP not configured (SPLYNX_SMTP_PASS missing) - email not sent');
  }

  const safeCustomerName = escapeHtml(customerName);
  const safeChurnUrl = escapeHtml(churnUrl);

  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject: "We're sorry to see you go",
    text: `Hi ${customerName},

We're genuinely sorry to see you go. If there's anything we could have done better, we'd love to hear about it — your honest feedback helps us serve our community better, and it only takes a minute.

Tell us what happened:
${churnUrl}

Thank you for your time and for being part of I-World Networks.
I-World Networks Limited`,
    html: `<p>Hi ${safeCustomerName},</p>
<p>We're genuinely sorry to see you go. If there's anything we could have done better, we'd love to hear about it — your honest feedback helps us serve our community better, and it only takes a minute.</p>
<p><a href="${safeChurnUrl}">Tell us what happened</a></p>
<p>Thank you for your time and for being part of I-World Networks.<br/>I-World Networks Limited</p>`,
  });
}

interface SendWinBackEmailParams {
  to: string;
  customerName: string;
  portalUrl: string;
  csatUrl: string;
  feedbackUrl: string;
}

/** "We've Missed You" win-back email for churned customers. */
export async function sendWinBackEmail({ to, customerName, portalUrl, csatUrl, feedbackUrl }: SendWinBackEmailParams) {
  const transporter = getTransporter();
  if (!transporter) {
    // Fail loudly so callers mark the EmailJob 'failed' — never silently skip
    // (a silent skip would be recorded as 'sent' for an email that never left).
    throw new Error('SMTP not configured (SPLYNX_SMTP_PASS missing) - email not sent');
  }

  const safeCustomerName = escapeHtml(customerName);
  const safePortalUrl = escapeHtml(portalUrl);
  const safeCsatUrl = escapeHtml(csatUrl);
  const safeFeedbackUrl = escapeHtml(feedbackUrl);

  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject: "We miss you at I-World Networks",
    text: `Dear ${customerName},

We've missed you — truly. If your experience with us didn't meet your expectations, we're sorry, and we'd love the chance to make it right.

As our way of saying sorry, we'd like to welcome you back with two weeks of complimentary service, no strings attached.

Reconnect with us:
- Activate your two-week offer: ${portalUrl}
- Visit us: ${csatUrl}
- Share your feedback: ${feedbackUrl}

Your business means a lot to us. We'd love to have you home.

Warm regards,
I-World Networks Limited`,
    html: `<p>Dear ${safeCustomerName},</p>
<p>We've missed you — truly. If your experience with us didn't meet your expectations, we're sorry, and we'd love the chance to make it right.</p>
<p>As our way of saying sorry, we'd like to welcome you back with <strong>two weeks of complimentary service, no strings attached</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
  <tr>
    <td style="padding: 6px 4px;"><a href="${safePortalUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 8px; background: #448515; color: #ffffff; text-decoration: none; font-weight: bold;">Reconnect &amp; Activate Offer</a></td>
    <td style="padding: 6px 4px;"><a href="${safeCsatUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 8px; background: #1a1a2e; color: #ffffff; text-decoration: none; font-weight: bold;">Visit Us</a></td>
    <td style="padding: 6px 4px;"><a href="${safeFeedbackUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 8px; border: 1px solid #448515; color: #448515; text-decoration: none; font-weight: bold;">Share Feedback</a></td>
  </tr>
</table>
<p>Your business means a lot to us. We'd love to have you home.</p>
<p>Warm regards,<br/>I-World Networks Limited</p>`,
  });
}
