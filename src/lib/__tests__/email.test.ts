import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' });

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail })),
  },
}));

type EmailModule = typeof import('@/lib/email');

describe('email templates (tone + safety)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SPLYNX_SMTP_PASS = 'test-secret';
    process.env.SPLYNX_SMTP_HOST = 'mail.test.invalid';
    process.env.SPLYNX_SMTP_PORT = '465';
    process.env.SPLYNX_SMTP_USER = 'no_reply@mail.test.invalid';
    process.env.SPLYNX_FROM_EMAIL = 'no_reply@mail.test.invalid';
    process.env.SPLYNX_FROM_NAME = 'I-World Networks Limited';
    sendMail.mockClear();
  });

  afterEach(() => {
    delete process.env.SPLYNX_SMTP_PASS;
  });

  async function load(): Promise<EmailModule> {
    return import('@/lib/email');
  }

  // -------------------------------------------------------------------------
  // Invoice reminder
  // -------------------------------------------------------------------------

  it('invoice reminder is gentle, factual and never threatens service interruption', async () => {
    const { sendInvoiceReminderEmail } = await load();

    await sendInvoiceReminderEmail({
      to: 'ada@example.com',
      customerName: 'Ada Customer',
      invoices: [{ invoiceNumber: 'INV-001', amount: 23375, dueDate: '2026-03-03', daysOverdue: 20 }],
      reminderType: '15d',
    });

    const mail = sendMail.mock.calls[0][0] as { to: string; subject: string; text: string; html: string };
    expect(mail.to).toBe('ada@example.com');
    expect(mail.subject).toContain('gentle reminder');
    expect(mail.subject).toContain('INV-001');
    expect(mail.subject).not.toContain('Payment reminder');
    expect(mail.subject).not.toContain('overdue');
    // Empathetic copy
    expect(mail.text).toContain("We're sorry to bother you");
    expect(mail.text).toContain('life gets busy');
    expect(mail.text).toContain('reply to this email');
    expect(mail.text).toContain('payment arrangement');
    expect(mail.html).toContain('payment arrangement');
    // Factual without shaming
    expect(mail.text).toContain('20 days overdue');
    // Currency formatting (en-NG)
    expect(mail.text).toContain('₦23,375.00');
    // Portal link present
    expect(mail.text).toContain('portal.iwn.ng');
    expect(mail.html).toContain('href="https://portal.iwn.ng"');
    // The insensitive threat must be gone everywhere
    expect(mail.text).not.toContain('avoid service interruption');
    expect(mail.html).not.toContain('avoid service interruption');
    expect(mail.text).not.toContain('to avoid');
  });

  it('invoice reminder never threatens customers whose service is already interrupted', async () => {
    const { sendInvoiceReminderEmail } = await load();

    await sendInvoiceReminderEmail({
      to: 'gone@example.com',
      customerName: 'J. Leon',
      invoices: [{ invoiceNumber: '202601002918', amount: 61275, dueDate: '2024-09-30', daysOverdue: 675 }],
      reminderType: '30d',
    });

    const mail = sendMail.mock.calls[0][0] as { text: string; html: string };
    expect(mail.text).toContain('675 days overdue');
    expect(mail.text).not.toContain('interruption');
    expect(mail.html).not.toContain('interruption');
    expect(mail.text).toContain("If you've already paid, please simply ignore this message");
  });

  it('escapes customer names and invoice numbers in HTML', async () => {
    const { sendInvoiceReminderEmail } = await load();

    await sendInvoiceReminderEmail({
      to: 'ada@example.com',
      customerName: '<Ada> & "Bob"',
      invoices: [{ invoiceNumber: 'INV-<X>', amount: 100, dueDate: '2026-01-01', daysOverdue: 15 }],
      reminderType: '15d',
    });

    const mail = sendMail.mock.calls[0][0] as { html: string };
    expect(mail.html).toContain('&lt;Ada&gt; &amp; &quot;Bob&quot;');
    expect(mail.html).toContain('INV-&lt;X&gt;');
    expect(mail.html).not.toContain('<Ada>');
    expect(mail.html).not.toContain('<X>');
  });

  // -------------------------------------------------------------------------
  // Churn survey
  // -------------------------------------------------------------------------

  it('churn survey apologises and links to the survey page', async () => {
    const { sendChurnSurveyEmail } = await load();

    await sendChurnSurveyEmail({
      to: 'ada@example.com',
      customerName: 'Ada Customer',
      churnUrl: 'https://csat.iwn.ng/churn?token=abc-123',
    });

    const mail = sendMail.mock.calls[0][0] as { subject: string; text: string; html: string };
    expect(mail.subject).toContain("sorry to see you go");
    expect(mail.text).toContain('genuinely sorry to see you go');
    expect(mail.text).toContain('anything we could have done better');
    expect(mail.text).toContain('only takes a minute');
    expect(mail.text).toContain('https://csat.iwn.ng/churn?token=abc-123');
    expect(mail.html).toContain('href="https://csat.iwn.ng/churn?token=abc-123"');
  });

  // -------------------------------------------------------------------------
  // Win-back
  // -------------------------------------------------------------------------

  it('win-back is warm and apologetic, not a sales pitch', async () => {
    const { sendWinBackEmail } = await load();

    await sendWinBackEmail({
      to: 'ada@example.com',
      customerName: 'Ada Customer',
      portalUrl: 'https://portal.iwn.ng',
      csatUrl: 'https://csat.iwn.ng',
      feedbackUrl: 'https://csat.iwn.ng/feedback/popup?token=abc&embed=true',
    });

    const mail = sendMail.mock.calls[0][0] as { subject: string; text: string; html: string };
    expect(mail.subject).toBe('We miss you at I-World Networks');
    expect(mail.text).toContain("We've missed you — truly");
    expect(mail.text).toContain("we're sorry");
    expect(mail.text).toContain("we'd love the chance to make it right");
    expect(mail.text).toContain('two weeks of complimentary service');
    expect(mail.text).toContain('no strings attached');
    expect(mail.text).toContain("We'd love to have you home");
    // All three links present
    expect(mail.text).toContain('portal.iwn.ng');
    expect(mail.text).toContain('csat.iwn.ng');
    expect(mail.text).toContain('feedback/popup?token=abc&embed=true');
    expect(mail.html).toContain('Reconnect &amp; Activate Offer');
    expect(mail.html).toContain('href="https://portal.iwn.ng"');
    expect(mail.html).toContain('href="https://csat.iwn.ng"');
    expect(mail.html).toContain('href="https://csat.iwn.ng/feedback/popup?token=abc&amp;embed=true"');
    // The removed infrastructure sales pitch must not be back
    expect(mail.text).not.toContain('dual data centers');
    expect(mail.text).not.toContain('IXPN');
    expect(mail.html).not.toContain('IXPN');
    // No threatening/financial pressure language
    expect(mail.text).not.toContain('payment');
    expect(mail.text).not.toContain('invoice');
  });

  // -------------------------------------------------------------------------
  // Feedback request
  // -------------------------------------------------------------------------

  it('feedback request is appreciative and links to the form', async () => {
    const { sendFeedbackEmail } = await load();

    await sendFeedbackEmail({
      to: 'ada@example.com',
      customerName: 'Ada Customer',
      feedbackUrl: 'https://csat.iwn.ng/feedback?token=xyz',
    });

    const mail = sendMail.mock.calls[0][0] as { subject: string; text: string; html: string };
    expect(mail.subject).toBe('How was your experience with I-World Networks?');
    expect(mail.text).toContain('truly value your business');
    expect(mail.text).toContain('honest feedback helps us improve');
    expect(mail.text).toContain('https://csat.iwn.ng/feedback?token=xyz');
    expect(mail.html).toContain('href="https://csat.iwn.ng/feedback?token=xyz"');
  });

  // -------------------------------------------------------------------------
  // SMTP guard
  // -------------------------------------------------------------------------

  it('throws when SMTP password is not configured', async () => {
    delete process.env.SPLYNX_SMTP_PASS;
    const { sendWinBackEmail } = await load();

    await expect(
      sendWinBackEmail({
        to: 'ada@example.com',
        customerName: 'Ada',
        portalUrl: 'https://portal.iwn.ng',
        csatUrl: 'https://csat.iwn.ng',
        feedbackUrl: 'https://csat.iwn.ng/feedback/popup?token=abc',
      }),
    ).rejects.toThrow('SMTP not configured');

    expect(sendMail).not.toHaveBeenCalled();
  });
});
