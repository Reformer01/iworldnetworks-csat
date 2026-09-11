import { prisma } from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/admin-config';
import { staffNameForEmail } from '@/lib/staff-email-map';

/**
 * Support-staff data visibility.
 *
 * Rule: staff whose email maps to a reachout agent name can ONLY see their
 * own records. Super admins and non-reachout staff keep full visibility.
 */
export async function resolveEngagementVisibility(
  email: string,
  requestedStaff: string,
): Promise<{ staffName: string; forced: boolean }> {
  if (isSuperAdmin(email)) {
    return { staffName: requestedStaff, forced: false };
  }

  const mine = staffNameForEmail(email);
  if (mine) {
    return { staffName: mine, forced: true };
  }

  // Not a reachout agent: full visibility.
  return { staffName: requestedStaff, forced: false };
}
