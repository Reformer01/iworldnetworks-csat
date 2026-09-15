import { getAgentByEmail } from './sales-staff';

export const ALLOWED_EMAIL_DOMAIN = '@iworldnetworks.net';

export const SUPER_ADMIN_EMAILS = [
  'reformer.ejembi@iworldnetworks.net',
  'jeffery.udoji@iworldnetworks.net',
  'adeolu.oluwabiyi@iworldnetworks.net',
  'mathew.alli@iworldnetworks.net',
  'stella.akinola@iworldnetworks.net',
  'jude.alawode@iworldnetworks.net',
  'olumide.adelaja@iworldnetworks.net',
  'alaka.segun@iworldnetworks.net',
];

export const EDITOR_EMAILS = ['jeffery.udoji@iworldnetworks.net', 'titilade.bakare@iworldnetworks.net'];

function extraEmails(varName: string): string[] {
  return (process.env[varName] || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdmin(email: string): boolean {
  const lower = email.toLowerCase();
  return SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(lower) || extraEmails('SUPER_ADMIN_EMAILS_EXTRA').includes(lower);
}

export function isEditor(email: string): boolean {
  const lower = email.toLowerCase();
  return EDITOR_EMAILS.map((e) => e.toLowerCase()).includes(lower) || extraEmails('EDITOR_EMAILS_EXTRA').includes(lower);
}

export function isAllowedDomain(email: string): boolean {
  return email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN);
}


export function canManageSalesRecord(email: string, recordSalesAgent: string): boolean {
  if (isSuperAdmin(email) || isEditor(email)) return true;
  return getAgentByEmail(email)?.name === recordSalesAgent;
}

/** The sales agent name a user resolves to (undefined for non-agents). */
export function salesAgentForEmail(email: string): string | undefined {
  return getAgentByEmail(email)?.name;
}
