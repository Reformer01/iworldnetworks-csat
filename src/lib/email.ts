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

function getTransporter() {
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
    console.warn('[email] SPLYNX_SMTP_PASS not configured - skipping email');
    return;
  }

  const safeCustomerName = escapeHtml(customerName);
  const safeFeedbackUrl = escapeHtml(feedbackUrl);

  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to,
    subject: 'How was your experience with I-World Networks?',
    text: `Hi ${customerName}, thank you for choosing I-World Networks. How was your experience? Share your feedback in 30 seconds.\n\n${feedbackUrl}`,
    html: `<p>Hi ${safeCustomerName},</p><p>Thank you for choosing I-World Networks. How was your experience?</p><p><a href="${safeFeedbackUrl}">Share your feedback in 30 seconds</a></p>`,
  });
}
