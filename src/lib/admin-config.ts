export const ALLOWED_EMAIL_DOMAIN = '@iworldnetworks.net';

export const SUPER_ADMIN_EMAILS = [
  'reformer.ejembi@iworldnetworks.net',
  'jeffery.udoji@iworldnetworks.net',
];

export function isSuperAdmin(email: string): boolean {
  return SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase());
}

export function isAllowedDomain(email: string): boolean {
  return email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN);
}
