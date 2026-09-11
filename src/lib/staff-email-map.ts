/**
 * Canonical mapping of platform sign-in emails to reachout agent names.
 * Used by: engagement visibility enforcement, daily follow-up reminders,
 * notification routing.
 */

export const STAFF_EMAIL_TO_NAME: Record<string, string> = {
  'victoria.fakorede@iworldnetworks.net': 'Victoria Fokorede',
  'aishat.hamzat@iworldnetworks.net': 'Aishat Hamzat',
  'adewale.adekomaya@iworldnetworks.net': 'Adekomoya Joseph',
  'olusegun.oluwanishola@iworldnetworks.net': 'Olusegun Oluwanishola',
  'christianah.babatunde@iworldnetworks.net': 'Babatunde Christianah',
};

export const REACHOUT_AGENT_EMAILS = Object.keys(STAFF_EMAIL_TO_NAME);

export function staffNameForEmail(email: string): string | null {
  return STAFF_EMAIL_TO_NAME[email.toLowerCase().trim()] ?? null;
}

export function emailForStaffName(staffName: string): string | null {
  const lower = staffName.toLowerCase();
  for (const [email, name] of Object.entries(STAFF_EMAIL_TO_NAME)) {
    if (name.toLowerCase() === lower) return email;
  }
  return null;
}
