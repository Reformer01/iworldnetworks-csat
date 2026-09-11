import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';
import { isAllowedDomain, isSuperAdmin } from '@/lib/admin-config';

/**
 * Verifies the Firebase ID token from an Authorization header.
 * Returns the decoded token if valid AND the email is from an allowed domain.
 * Returns null otherwise.
 */
export async function verifyAdminToken(authHeader: string | null): Promise<{ uid: string; email: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7);
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    const email = decoded.email;
    if (decoded.email_verified && email && isAllowedDomain(email)) {
      return { uid: decoded.uid, email };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verifies the Firebase ID token AND enforces the super_admin role.
 * Restricts destructive operations to the two super admins (see admin-config).
 * Returns the decoded token if valid, otherwise null.
 */
export async function verifySuperAdminToken(authHeader: string | null): Promise<{ uid: string; email: string } | null> {
  const admin = await verifyAdminToken(authHeader);
  if (!admin) return null;
  if (!isSuperAdmin(admin.email)) return null;
  return admin;
}

/** @deprecated Use verifyAdminToken instead. Identical logic. */
export const verifySupportToken = verifyAdminToken;
