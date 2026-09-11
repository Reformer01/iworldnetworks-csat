import { prisma } from '@/lib/prisma';
import { getTransporter } from '@/lib/email';
import { emailForStaffName } from '@/lib/staff-email-map';
import { logInfo, logWarn, logError } from '@/lib/logger';

/**
 * Daily follow-up reminder: at 3:00 PM WAT (14:00 UTC), check each reachout
 * agent's EngagementLog for customers whose nextFollowUpAt is today or
 * overdue. Send them an email listing those customers. Skip agents with
 * zero due follow-ups.
 */

export async function runFollowUpReminders(now = new Date()): Promise<{ sent: number; skipped: number }> {
  const transporter = getTransporter();
  if (!transporter) {
    logError('[followup-reminder] SMTP not configured — cannot send reminders');
    return { sent: 0, skipped: 0 };
  }

  // Find all records with a follow-up date that is today or overdue.
  const due = await prisma.engagementLog.findMany({
    where: {
      nextFollowUpAt: { not: null, lte: now },
    },
    select: {
      staffName: true,
      customerName: true,
      phone: true,
      nextFollowUpAt: true,
      retentionRisk: true,
    },
    orderBy: [{ staffName: 'asc' }, { nextFollowUpAt: 'asc' }],
  });

  // Group by agent
  const byAgent = new Map<
    string,
    Array<{ customerName: string; phone: string | null; nextFollowUpAt: Date | null; retentionRisk: string | null }>
  >();
  for (const d of due) {
    const list = byAgent.get(d.staffName) ?? [];
    list.push({ customerName: d.customerName, phone: d.phone, nextFollowUpAt: d.nextFollowUpAt, retentionRisk: d.retentionRisk });
    byAgent.set(d.staffName, list);
  }

  let sent = 0;
  let skipped = 0;

  for (const [staffName, customers] of byAgent) {
    const email = emailForStaffName(staffName);
    if (!email) {
      logWarn('[followup-reminder] No email mapping for', { staffName });
      skipped++;
      continue;
    }

    const rows = customers
      .map((c) => {
        const risk = c.retentionRisk ? ` [${c.retentionRisk} risk]` : '';
        const phone = c.phone ? ` — ${c.phone}` : '';
        return `  • ${c.customerName}${risk}${phone}`;
      })
      .join('\n');

    const mailOptions = {
      from: '"I-World Networks CSAT" <survey@mail.iworldnetworks.net>',
      to: email,
      subject: `📋 ${customers.length} follow-up${customers.length === 1 ? '' : 's'} due today`,
      text: `Hi ${staffName},\n\nYou have ${customers.length} customer follow-up${customers.length === 1 ? '' : 's'} due today:\n\n${rows}\n\nLog in to the platform to update their records.\n\n— I-World Networks CSAT System`,
      html: `<p>Hi <strong>${staffName}</strong>,</p><p>You have <strong>${customers.length}</strong> customer follow-up${customers.length === 1 ? '' : 's'} due today:</p><ul style="padding-left:20px;">${customers.map((c) => `<li><strong>${c.customerName}</strong>${c.retentionRisk ? ` <span style="color:#999;">[${c.retentionRisk} risk]</span>` : ''}${c.phone ? ` — ${c.phone}` : ''}</li>`).join('')}</ul><p><a href="https://csat.iwn.ng/admin/engagement" style="background:#448515;color:white;padding:10px 24px;border-radius:99px;text-decoration:none;font-weight:bold;">Open Reachout Log</a></p><p style="color:#999;font-size:12px;">— I-World Networks CSAT System</p>`,
    };

    try {
      await transporter.sendMail(mailOptions);
      sent++;
      logInfo('[followup-reminder] Sent', { staffName, count: customers.length });
    } catch (err) {
      logError('[followup-reminder] Failed', { staffName, error: err instanceof Error ? err.message : String(err) });
      skipped++;
    }
  }

  return { sent, skipped };
}
